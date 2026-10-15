/**
 * The one place in the app that calls a model.
 *
 * Every AI feature goes through `generateJson`, which enforces, in order:
 * configuration, input size, per-user rate limit, duplicate-request
 * suppression, a per-attempt timeout, bounded retries with backoff, structured
 * validation against the caller's spec, usage accounting, and a typed error that
 * the API can hand to the user truthfully.
 *
 * Nothing else in the Worker imports a transport directly, so switching provider
 * or adding one means touching this file and `../gemini.ts`, not the features.
 *
 * Failures are never papered over: an unconfigured or broken provider raises
 * `AiError`. Only `AI_DEMO_MODE=true` (a local-development switch) allows a
 * deterministic stand-in, and the result is labelled `engine: 'demo'` so it can
 * never be mistaken for a model answer.
 */

import { AiError } from './errors'
import { aiCacheKey, acquireAiSlot, finishAiSlot, releaseAiSlot, recordAiUsage, countAiCallsSince, sweepAiCache } from './usage'
import { aiConfig, aiConfigured, type AiEnv } from './config'
import { parseStructured, SchemaError, specToJson, type Spec } from './schema'
import { GeminiHttpError, geminiEmbedText, geminiGenerateJson, type Part } from '../gemini'

export type { Part }
export { aiConfigured }
export { aiStatus } from './config'
export { AiError } from './errors'

export type AiCtx = {
  /** The authenticated caller. Never a body field, never a client-supplied id. */
  userId: string
  /** A short stable name used in accounting rows, e.g. 'career_paths'. */
  feature: string
}

export type GenerateArgs = {
  parts: Part[]
  spec: Spec
  system?: string
  temperature?: number
  tier?: 'quality' | 'fast'
  maxOutputTokens?: number
  /**
   * Everything that changes the answer. Identical material from the same user
   * inside the dedupe window returns the stored result instead of paying twice.
   */
  dedupeMaterial?: string
  /** Set false for a deliberate regeneration the user asked for. */
  cache?: boolean
}

export type GenerateOutcome<T> = {
  value: T
  engine: 'gemini'
  model: string
  cached: boolean
  latencyMs: number
}

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms))

/** Rough byte cost of a request, so an oversized upload is refused before it is sent. */
function inputCharCount(parts: Part[]): number {
  let total = 0
  for (const part of parts) {
    if ('text' in part) total += part.text.length
    else total += part.inlineData.data.length
  }
  return total
}

/**
 * The provider's one entry point for structured generation.
 *
 * Returns the validated value plus how it was obtained. Throws `AiError` for
 * every failure mode; callers either surface it or (only in demo mode) fall back
 * to a deterministic result they label as such.
 */
export async function generateJson<T>(env: AiEnv & { DB: D1Database }, ctx: AiCtx, args: GenerateArgs): Promise<GenerateOutcome<T>> {
  const config = aiConfig(env)
  if (!aiConfigured(env)) {
    throw new AiError(
      'ai_unconfigured',
      'No AI provider key is configured, so this feature cannot run. Set AI_API_KEY for the Worker, then try again.',
    )
  }
  if (config.provider !== 'gemini') {
    throw new AiError('ai_unconfigured', `AI_PROVIDER "${config.provider}" is not implemented. Use "gemini".`)
  }

  const chars = inputCharCount(args.parts)
  if (chars > config.maxInputChars) {
    throw new AiError(
      'ai_input_too_large',
      `That input is ${Math.round(chars / 1000)}k characters; the limit is ${Math.round(config.maxInputChars / 1000)}k. Send a shorter excerpt.`,
    )
  }

  const used = await countAiCallsSince(env.DB, ctx.userId, new Date(Date.now() - 60 * 60 * 1000).toISOString())
  if (used >= config.rateLimitPerHour) {
    const retryAfter = 60 * 30
    throw new AiError(
      'ai_rate_limited',
      `You have used your ${config.rateLimitPerHour} AI requests for this hour. Try again shortly.`,
      { retryAfter },
    )
  }

  const cacheable = args.cache !== false && config.dedupeWindowMs > 0
  const key = cacheable
    ? aiCacheKey(ctx.userId, ctx.feature, args.dedupeMaterial ?? JSON.stringify(args.parts))
    : null

  if (key) {
    const slot = await acquireAiSlot(env.DB, key, ctx.userId, ctx.feature, config.dedupeWindowMs, crypto.randomUUID())
    if (slot.state === 'cached') {
      return { value: slot.response as T, engine: 'gemini', model: config.model, cached: true, latencyMs: 0 }
    }
    if (slot.state === 'busy') {
      throw new AiError('ai_busy', 'An identical request is already running. Give it a moment.')
    }
  }

  const model = args.tier === 'fast' ? config.modelLite : config.model
  const started = Date.now()
  let lastError: AiError | null = null
  let outputChars = 0

  try {
    for (let attempt = 0; attempt <= config.maxRetries; attempt++) {
      const controller = new AbortController()
      const timer = setTimeout(() => controller.abort(), config.timeoutMs)
      try {
        const result = await geminiGenerateJson({
          apiKey: config.apiKey,
          model,
          parts: args.parts,
          responseSchema: specToJson(args.spec),
          system: args.system,
          temperature: args.temperature,
          maxOutputTokens: args.maxOutputTokens,
          signal: controller.signal,
        })
        outputChars = result.text.length

        let raw: unknown
        try {
          raw = JSON.parse(result.text)
        } catch {
          throw new AiError('ai_invalid_output', 'The model returned something that was not JSON. Nothing was saved.')
        }

        let value: T
        try {
          value = parseStructured<T>(args.spec, raw)
        } catch (error) {
          const problems = error instanceof SchemaError ? error.problems.slice(0, 5).join('; ') : 'unknown shape'
          throw new AiError('ai_invalid_output', `The model's answer did not match the required structure (${problems}). Nothing was saved.`)
        }

        if (key) await finishAiSlot(env.DB, key, value)
        await recordAiUsage(env.DB, {
          userId: ctx.userId,
          feature: ctx.feature,
          provider: config.provider,
          model,
          engine: 'gemini',
          latencyMs: Date.now() - started,
          inputChars: chars,
          outputChars,
          status: 'ok',
          cacheKey: key ?? undefined,
        })
        // Cleanup is incidental, never on the hot path of every call.
        if (Math.random() < 0.05) void sweepAiCache(env.DB)

        return { value, engine: 'gemini', model, cached: false, latencyMs: Date.now() - started }
      } catch (error) {
        lastError = normalise(error)
        if (!lastError.retryable || attempt === config.maxRetries) break
        const backoff = Math.min(3_000, 350 * 2 ** attempt) + Math.floor(Math.random() * 150)
        await sleep(Math.max(backoff, (lastError.retryAfter ?? 0) * 1000))
      } finally {
        clearTimeout(timer)
      }
    }
  } catch (error) {
    lastError = normalise(error)
  }

  const failure = lastError ?? new AiError('ai_provider_error', 'The AI provider could not be reached.')
  if (key) await releaseAiSlot(env.DB, key)
  await recordAiUsage(env.DB, {
    userId: ctx.userId,
    feature: ctx.feature,
    provider: config.provider,
    model,
    engine: 'gemini',
    latencyMs: Date.now() - started,
    inputChars: chars,
    outputChars,
    status: 'error',
    errorKind: failure.kind,
    cacheKey: key ?? undefined,
  })
  throw failure
}

function normalise(error: unknown): AiError {
  if (error instanceof AiError) return error
  if (error instanceof GeminiHttpError) {
    if (error.status === 429) {
      return new AiError('ai_rate_limited', 'The AI provider is rate limiting requests right now. Try again in a moment.', {
        retryAfter: error.retryAfterSeconds ?? 30,
      })
    }
    if (error.status >= 500) {
      return new AiError('ai_provider_error', 'The AI provider is having trouble. Your work is unchanged: try again.')
    }
    return new AiError('ai_provider_error', `The AI provider rejected the request (${error.status}).`, {
      retryable: false,
    })
  }
  if (error instanceof Error && error.name === 'AbortError') {
    return new AiError('ai_timeout', 'The AI provider took too long to answer. Your work is unchanged: try again.')
  }
  if (error instanceof SchemaError) {
    return new AiError('ai_invalid_output', 'The model returned an unusable structure. Nothing was saved.')
  }
  return new AiError('ai_provider_error', 'The AI provider could not be reached. Try again.')
}

/**
 * Embedding helper for semantic ranking.
 *
 * Best-effort by design: `null` means "rank lexically instead". It is not
 * rate-limited or cached because it runs inside a single request against a
 * small catalog, and its failure must not fail the user's action.
 */
export async function embed(env: AiEnv & { DB: D1Database }, text: string): Promise<number[] | null> {
  const config = aiConfig(env)
  if (!aiConfigured(env) || config.provider !== 'gemini') return null
  if (text.length > config.maxInputChars) return null

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), config.timeoutMs)
  try {
    return await geminiEmbedText({ apiKey: config.apiKey, model: config.embedModel, text, signal: controller.signal })
  } finally {
    clearTimeout(timer)
  }
}
