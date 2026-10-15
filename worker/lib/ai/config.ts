/**
 * AI configuration, read from the environment only.
 *
 * The key lives in the Worker's environment and nowhere else: it is never a
 * `VITE_` variable, never in the bundle, and never in a response body. Every
 * limit here exists so one user cannot turn a shared key into an unbounded bill.
 *
 * `AI_*` names are the documented ones. The older `GEMINI_*` names still work so
 * an existing deployment does not break on upgrade.
 */

export type AiEnv = {
  AI_PROVIDER?: string
  AI_API_KEY?: string
  AI_MODEL?: string
  AI_MODEL_LITE?: string
  AI_EMBED_MODEL?: string
  AI_TIMEOUT_MS?: string
  AI_MAX_RETRIES?: string
  AI_MAX_INPUT_CHARS?: string
  AI_RATE_LIMIT_PER_HOUR?: string
  AI_DEDUPE_WINDOW_MS?: string
  /** Local/dev only: serve the deterministic engine instead of failing. */
  AI_DEMO_MODE?: string

  // Back-compat with the original Gemini-only names.
  GEMINI_API_KEY?: string
  GEMINI_MODEL?: string
  GEMINI_MODEL_LITE?: string
  GEMINI_EMBED_MODEL?: string
}

export type AiConfig = {
  provider: string
  apiKey: string
  model: string
  modelLite: string
  embedModel: string
  timeoutMs: number
  maxRetries: number
  maxInputChars: number
  rateLimitPerHour: number
  dedupeWindowMs: number
  demoMode: boolean
}

export const DEFAULT_MODEL = 'gemini-3.8-flash'
export const DEFAULT_LITE_MODEL = 'gemini-3.5-flash-lite'
export const DEFAULT_EMBED_MODEL = 'gemini-embedding-001'

/** Documented defaults. Kept in code so a missing var is never "unlimited". */
export const AI_DEFAULTS = {
  timeoutMs: 20_000,
  maxRetries: 2,
  maxInputChars: 120_000,
  rateLimitPerHour: 40,
  dedupeWindowMs: 10 * 60 * 1000,
} as const

/**
 * Parses a numeric limit.
 *
 * An absent or unparseable value falls back to the documented default, but an
 * explicit `0` is honoured (then clamped to `min`): "no retries" and "no cache"
 * are real settings, and silently turning them back on would be a nasty
 * surprise in a deployment that asked for them.
 */
function int(value: string | undefined, fallback: number, min: number, max: number): number {
  if (value === undefined || value.trim() === '') return fallback
  const parsed = Number(value)
  if (!Number.isFinite(parsed)) return fallback
  return Math.min(max, Math.max(min, Math.round(parsed)))
}

const truthy = (value: string | undefined) => value === 'true' || value === '1' || value === 'yes'

export function aiConfig(env: AiEnv): AiConfig {
  const provider = (env.AI_PROVIDER ?? 'gemini').trim().toLowerCase()
  return {
    provider,
    apiKey: (env.AI_API_KEY ?? env.GEMINI_API_KEY ?? '').trim(),
    model: (env.AI_MODEL ?? env.GEMINI_MODEL ?? '').trim() || DEFAULT_MODEL,
    modelLite: (env.AI_MODEL_LITE ?? env.GEMINI_MODEL_LITE ?? '').trim() || DEFAULT_LITE_MODEL,
    embedModel: (env.AI_EMBED_MODEL ?? env.GEMINI_EMBED_MODEL ?? '').trim() || DEFAULT_EMBED_MODEL,
    timeoutMs: int(env.AI_TIMEOUT_MS, AI_DEFAULTS.timeoutMs, 1_000, 60_000),
    maxRetries: int(env.AI_MAX_RETRIES, AI_DEFAULTS.maxRetries, 0, 5),
    maxInputChars: int(env.AI_MAX_INPUT_CHARS, AI_DEFAULTS.maxInputChars, 1_000, 500_000),
    rateLimitPerHour: int(env.AI_RATE_LIMIT_PER_HOUR, AI_DEFAULTS.rateLimitPerHour, 1, 1_000),
    dedupeWindowMs: int(env.AI_DEDUPE_WINDOW_MS, AI_DEFAULTS.dedupeWindowMs, 0, 24 * 60 * 60 * 1000),
    demoMode: truthy(env.AI_DEMO_MODE),
  }
}

/** True when a real provider call is possible. */
export function aiConfigured(env: AiEnv): boolean {
  return aiConfig(env).apiKey.length > 0
}

/**
 * Public description of the AI layer for `/api/health` and the UI. Contains no
 * key material: only whether one exists and which model would be used.
 */
export function aiStatus(env: AiEnv) {
  const config = aiConfig(env)
  return {
    provider: config.provider,
    configured: aiConfigured(env),
    demoMode: config.demoMode,
    model: config.model,
    rateLimitPerHour: config.rateLimitPerHour,
    timeoutMs: config.timeoutMs,
  }
}
