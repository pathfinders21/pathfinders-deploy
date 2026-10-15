/**
 * Raw Gemini transport.
 *
 * Deliberately dependency-free: the Worker calls generativelanguage.googleapis.com
 * directly with `fetch`, so the bundle stays small and nothing assumes a Node
 * runtime. This module knows about HTTP and Gemini's request shape: it knows
 * nothing about retries, budgets, caching or validation, which all live in
 * `worker/lib/ai/provider.ts`. Keeping the split means a second provider would
 * only have to replace this file.
 *
 * The key is passed in by the provider, which reads it from the Worker
 * environment. It is never shipped to the browser.
 *
 * Docs: https://ai.google.dev/api/generate-content
 */

import type { JsonSchema } from './ai/schema'

export const GEMINI_API_BASE = 'https://generativelanguage.googleapis.com/v1beta'

export type TextPart = { text: string }
export type InlinePart = { inlineData: { mimeType: string; data: string } }
export type Part = TextPart | InlinePart

/** A non-2xx from the provider, carrying what the retry policy needs to decide. */
export class GeminiHttpError extends Error {
  status: number
  retryAfterSeconds?: number
  constructor(message: string, status: number, retryAfterSeconds?: number) {
    super(message)
    this.name = 'GeminiHttpError'
    this.status = status
    this.retryAfterSeconds = retryAfterSeconds
  }
  /** 429 and 5xx are worth another attempt; 4xx is not. */
  get retryable(): boolean {
    return this.status === 429 || this.status === 408 || this.status >= 500
  }
}

type GeminiCandidate = { content?: { parts?: Array<{ text?: string }> }; finishReason?: string }
type GeminiResponse = {
  candidates?: GeminiCandidate[]
  usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number }
}

export type GenerateResult = {
  text: string
  promptTokens: number
  outputTokens: number
}

export async function geminiGenerateJson(args: {
  apiKey: string
  model: string
  parts: Part[]
  responseSchema: JsonSchema
  system?: string
  temperature?: number
  signal?: AbortSignal
  maxOutputTokens?: number
}): Promise<GenerateResult> {
  const url = `${GEMINI_API_BASE}/models/${encodeURIComponent(args.model)}:generateContent`

  const body = {
    contents: [{ role: 'user', parts: args.parts }],
    ...(args.system ? { systemInstruction: { parts: [{ text: args.system }] } } : {}),
    generationConfig: {
      responseMimeType: 'application/json',
      responseSchema: args.responseSchema,
      temperature: args.temperature ?? 0.2,
      ...(args.maxOutputTokens ? { maxOutputTokens: args.maxOutputTokens } : {}),
    },
  }

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-goog-api-key': args.apiKey },
    body: JSON.stringify(body),
    signal: args.signal,
  })

  if (!res.ok) {
    const detail = await res.text().catch(() => '')
    const retryAfter = Number(res.headers.get('retry-after'))
    throw new GeminiHttpError(
      // Status only: a provider error body can echo the request back.
      `Provider returned ${res.status} for ${args.model}: ${detail.slice(0, 200)}`,
      res.status,
      Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter : undefined,
    )
  }

  const data = (await res.json()) as GeminiResponse
  const text = (data.candidates?.[0]?.content?.parts ?? []).map((p) => p.text ?? '').join('').trim()
  const finish = data.candidates?.[0]?.finishReason
  if (!text) {
    throw new GeminiHttpError(`Provider returned no content (finishReason: ${finish ?? 'unknown'})`, 502)
  }

  return {
    text,
    promptTokens: data.usageMetadata?.promptTokenCount ?? 0,
    outputTokens: data.usageMetadata?.candidatesTokenCount ?? 0,
  }
}

/**
 * Embeds text for semantic (vector) matching.
 *
 * Returns `null` on any failure: the caller degrades to lexical ranking rather
 * than failing the request, so a flaky embedding model never takes down search.
 */
export async function geminiEmbedText(args: {
  apiKey: string
  model: string
  text: string
  signal?: AbortSignal
}): Promise<number[] | null> {
  const url = `${GEMINI_API_BASE}/models/${encodeURIComponent(args.model)}:embedContent`
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-goog-api-key': args.apiKey },
      body: JSON.stringify({ model: `models/${args.model}`, content: { parts: [{ text: args.text }] } }),
      signal: args.signal,
    })
    if (!res.ok) return null
    const data = (await res.json()) as { embedding?: { values?: number[] } }
    const values = data.embedding?.values
    return Array.isArray(values) && values.length > 0 ? values : null
  } catch {
    return null
  }
}

/** Cosine similarity. Returns 0 for mismatched or empty vectors. */
export function cosine(a: number[], b: number[]): number {
  const n = Math.min(a.length, b.length)
  if (n === 0) return 0
  let dot = 0
  let na = 0
  let nb = 0
  for (let i = 0; i < n; i++) {
    dot += a[i]! * b[i]!
    na += a[i]! * a[i]!
    nb += b[i]! * b[i]!
  }
  if (na === 0 || nb === 0) return 0
  return dot / (Math.sqrt(na) * Math.sqrt(nb))
}
