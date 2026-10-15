/**
 * AI usage accounting, per-user rate limiting and duplicate-request suppression.
 *
 * All three live in D1 so they survive an isolate restart: a rate limit held in
 * module memory would reset on every cold start and would not be shared between
 * isolates, which is the same as not having one.
 *
 * The cache row doubles as a lock. `acquire` either returns an already-computed
 * response, takes the slot, or reports that an identical request is in flight: * which is what stops a double-click (or a client retry) from billing twice.
 */

export type AiUsageRow = {
  userId: string
  feature: string
  provider: string
  model: string
  engine: string
  latencyMs: number
  inputChars: number
  outputChars: number
  status: 'ok' | 'error'
  errorKind?: string
  /** Identical-request cache key, when the call was eligible for caching. */
  cacheKey?: string
}

function keyHash(input: string): string {
  // FNV-1a, 32-bit, hex. Bounded length is the point: the key is a primary key.
  let hash = 0x811c9dc5
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i)
    hash = Math.imul(hash, 0x01000193)
  }
  return (hash >>> 0).toString(16).padStart(8, '0')
}

/** Stable cache key for an identical request by the same user. */
export function aiCacheKey(userId: string, feature: string, material: string): string {
  return `${feature}:${userId}:${keyHash(material)}`
}

export async function recordAiUsage(db: D1Database, row: AiUsageRow): Promise<void> {
  try {
    await db
      .prepare(
        `INSERT INTO ai_usage
         (id, created_at, user_id, feature, provider, model, engine, latency_ms, input_chars, output_chars, status, error_kind, cache_key)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .bind(
        crypto.randomUUID(),
        new Date().toISOString(),
        row.userId,
        row.feature,
        row.provider,
        row.model,
        row.engine,
        Math.max(0, Math.round(row.latencyMs)),
        Math.max(0, Math.round(row.inputChars)),
        Math.max(0, Math.round(row.outputChars)),
        row.status,
        row.errorKind ?? null,
        row.cacheKey ?? null,
      )
      .run()
  } catch (error) {
    // Accounting must never be the reason a user's request fails.
    console.error('[pathfinders] could not record ai usage', error instanceof Error ? error.message : error)
  }
}

export async function countAiCallsSince(db: D1Database, userId: string, sinceIso: string): Promise<number> {
  const row = await db
    .prepare("SELECT COUNT(*) AS n FROM ai_usage WHERE user_id = ? AND status = 'ok' AND created_at > ?")
    .bind(userId, sinceIso)
    .first<{ n: number }>()
  return row?.n ?? 0
}

export type UsageSummary = {
  windowHours: number
  callsInWindow: number
  limitPerHour: number
  remaining: number
  totalCalls: number
  lastCallAt: string | null
}

/** What the UI needs to tell a student where they stand. Never a key or a prompt. */
export async function usageSummary(
  db: D1Database,
  userId: string,
  limitPerHour: number,
): Promise<UsageSummary> {
  const since = new Date(Date.now() - 60 * 60 * 1000).toISOString()
  const [callsInWindow, total, last] = await Promise.all([
    countAiCallsSince(db, userId, since),
    db.prepare('SELECT COUNT(*) AS n FROM ai_usage WHERE user_id = ?').bind(userId).first<{ n: number }>(),
    db
      .prepare('SELECT created_at FROM ai_usage WHERE user_id = ? ORDER BY created_at DESC LIMIT 1')
      .bind(userId)
      .first<{ created_at: string }>(),
  ])
  return {
    windowHours: 1,
    callsInWindow,
    limitPerHour,
    remaining: Math.max(0, limitPerHour - callsInWindow),
    totalCalls: total?.n ?? 0,
    lastCallAt: last?.created_at ?? null,
  }
}

export type SlotResult =
  | { state: 'cached'; response: unknown }
  | { state: 'acquired' }
  | { state: 'busy' }

/**
 * Claims the right to make one model call for this exact request.
 *
 * Ownership is proved with a token written into the row, not by "did my insert
 * land": `INSERT OR IGNORE` cannot tell a caller whether it created the row or
 * lost a race to one that already existed, so the row is read back and the
 * caller proceeds only if the stored token is its own. That is what makes two
 * simultaneous identical requests resolve to exactly one provider call: one
 * caller runs it, the other either receives the stored answer or is told the
 * request is already in flight.
 *
 * A `done` row inside the dedupe window is returned as-is. A `running` row older
 * than a minute is treated as a crashed call and taken over.
 */
export async function acquireAiSlot(
  db: D1Database,
  key: string,
  userId: string,
  feature: string,
  dedupeWindowMs: number,
  token: string,
): Promise<SlotResult> {
  const now = Date.now()
  const nowIso = new Date(now).toISOString()

  const read = () =>
    db
      .prepare('SELECT status, response, created_at FROM ai_cache WHERE key = ?')
      .bind(key)
      .first<{ status: string; response: string; created_at: string }>()

  const serve = (row: { status: string; response: string; created_at: string }): SlotResult | null => {
    if (row.status !== 'done') return null
    if (now - Date.parse(row.created_at) > dedupeWindowMs) return null
    try {
      return { state: 'cached', response: JSON.parse(row.response) }
    } catch {
      return null
    }
  }

  const existing = await read()
  if (existing) {
    const cached = serve(existing)
    if (cached) return cached
  }

  await db
    .prepare(
      'INSERT OR IGNORE INTO ai_cache (key, user_id, feature, status, response, created_at) VALUES (?, ?, ?, ?, ?, ?)',
    )
    .bind(key, userId, feature, 'running', token, nowIso)
    .run()

  const stored = await read()
  if (!stored) return { state: 'acquired' }
  if (stored.status === 'running' && stored.response === token) return { state: 'acquired' }

  const cached = serve(stored)
  if (cached) return cached

  // A call that never finished (crashed isolate, killed request) must not wedge
  // this key forever. Only an old one is taken over, and only by the writer that
  // wins the conditional update.
  if (stored.status === 'running' && now - Date.parse(stored.created_at) > 60_000) {
    await db
      .prepare('UPDATE ai_cache SET response = ?, created_at = ? WHERE key = ? AND response = ?')
      .bind(token, nowIso, key, stored.response)
      .run()
    const retaken = await read()
    if (retaken?.status === 'running' && retaken.response === token) return { state: 'acquired' }
  }

  return { state: 'busy' }
}

export async function finishAiSlot(db: D1Database, key: string, response: unknown): Promise<void> {
  try {
    await db
      .prepare("UPDATE ai_cache SET status = 'done', response = ? WHERE key = ?")
      .bind(JSON.stringify(response), key)
      .run()
  } catch {
    /* the result is already in hand; a failed cache write is not the user's problem */
  }
}

/** Releases a claimed slot so a retry is not blocked by a call that never landed. */
export async function releaseAiSlot(db: D1Database, key: string): Promise<void> {
  try {
    await db.prepare('DELETE FROM ai_cache WHERE key = ?').bind(key).run()
  } catch {
    /* nothing to do: the stale-row takeover handles this on the next attempt */
  }
}

/** Opportunistic cleanup, run after a write so the table cannot grow forever. */
export async function sweepAiCache(db: D1Database, olderThanMs = 24 * 60 * 60 * 1000): Promise<void> {
  try {
    await db
      .prepare('DELETE FROM ai_cache WHERE created_at < ?')
      .bind(new Date(Date.now() - olderThanMs).toISOString())
      .run()
  } catch {
    /* best effort */
  }
}
