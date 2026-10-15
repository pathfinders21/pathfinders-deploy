/**
 * A small server side action limiter for the cheap-but-abusive endpoints.
 *
 * The AI endpoints already have their own metered budget in `lib/ai/usage.ts`.
 * This covers the actions around them that cost nothing to send but a lot to
 * absorb: creating mentorship requests, posting messages and submitting
 * verification evidence. Rows live in `action_events`, are counted inside a
 * sliding window, and stale rows are pruned opportunistically so the table
 * cannot grow without bound.
 *
 * Limits are deliberately per-user rather than per-IP: identity here is the
 * verified `user.sub`, which cannot be spoofed by a header.
 */

import { RequestError } from './requests'

export type ActionLimit = { limit: number; windowMs: number; label: string }

export const ACTION_LIMITS = {
  'request.create': { limit: 10, windowMs: 60 * 60 * 1000, label: 'mentorship requests' },
  'message.send': { limit: 60, windowMs: 60 * 60 * 1000, label: 'messages' },
  'verification.submit': { limit: 3, windowMs: 24 * 60 * 60 * 1000, label: 'verification submissions' },
  // Reports on an AI result. Generous enough to report several, small enough that the
  // table is not a dumping ground.
  'ai_feedback': { limit: 20, windowMs: 60 * 60 * 1000, label: 'AI feedback reports' },
  'agent.propose': { limit: 15, windowMs: 60 * 60 * 1000, label: 'agent proposals' },
  // Assistant turns also carry their own metered model budget; this stops a tab left
  // open in a loop from spending it faster than a person could type.
  'assistant.chat': { limit: 30, windowMs: 60 * 60 * 1000, label: 'assistant messages' },
} as const satisfies Record<string, ActionLimit>

export type ActionKey = keyof typeof ACTION_LIMITS

const PRUNE_AFTER_MS = 7 * 24 * 60 * 60 * 1000

function humanWindow(ms: number): string {
  const minutes = Math.round(ms / 60_000)
  if (minutes < 60) return `${minutes} minute${minutes === 1 ? '' : 's'}`
  const hours = Math.round(minutes / 60)
  return `${hours} hour${hours === 1 ? '' : 's'}`
}

/**
 * Throws 429 when the caller has already used up the allowance for `action` in
 * the current window, and records the attempt otherwise.
 *
 * The count and the insert are separate statements, so a burst can admit a
 * couple of extra calls under race: acceptable for abuse control, and the
 * alternative (a unique-row claim per slot) costs a write on every request.
 */
export async function enforceActionLimit(db: D1Database, userId: string, action: ActionKey): Promise<void> {
  const { limit, windowMs, label } = ACTION_LIMITS[action]
  const now = Date.now()
  const since = new Date(now - windowMs).toISOString()

  const row = await db
    .prepare('SELECT COUNT(*) AS n FROM action_events WHERE user_id = ? AND action = ? AND created_at >= ?')
    .bind(userId, action, since)
    .first<{ n: number }>()

  if ((row?.n ?? 0) >= limit) {
    throw new RequestError(
      `Too many ${label} in the last ${humanWindow(windowMs)}. Please wait and try again.`,
      429,
    )
  }

  await db
    .prepare('INSERT INTO action_events (id, user_id, action, created_at) VALUES (?, ?, ?, ?)')
    .bind(crypto.randomUUID(), userId, action, new Date(now).toISOString())
    .run()

  // Opportunistic pruning: bounded work, keeps the table small, and never
  // touches another user's rows.
  const cutoff = new Date(now - PRUNE_AFTER_MS).toISOString()
  await db
    .prepare('DELETE FROM action_events WHERE user_id = ? AND action = ? AND created_at < ?')
    .bind(userId, action, cutoff)
    .run()
}
