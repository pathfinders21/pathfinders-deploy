/**
 * In-app messaging between an accepted mentorship pair.
 *
 * A thread is not a free-standing object: it *is* an accepted
 * `mentorship_requests` row. That choice means authorisation is derived from one
 * place: the relationship: instead of a separate participant table that could
 * drift out of sync with it. Every read and every write re-reads that row and
 * checks the caller against `mentee_id` / `mentor_id`, so:
 *
 *  - a non-participant cannot read or post, even with a valid request id;
 *  - a thread cannot outlive the relationship (if the request is not `accepted`,
 *    messaging is closed);
 *  - the recipient is always the *other* participant, never a client-supplied id.
 *
 * There is no phone number, no email forwarding and no external provider here:
 * this is the platform's own record, and it is the only communication channel it
 * claims to provide.
 */

import { RequestError } from './requests'

export type MessageRow = {
  id: string
  request_id: string
  sender_id: string
  recipient_id: string
  body: string
  created_at: string
  read_at: string | null
}

export type MessageView = {
  id: string
  body: string
  mine: boolean
  createdAt: string
  read: boolean
}

export type ThreadView = {
  requestId: string
  counterpart: { id: string; name: string; role: 'mentor' | 'mentee' }
  goalTitle: string | null
  acceptedAt: string
  unread: number
  lastMessageAt: string | null
  messages: MessageView[]
}

export const MAX_MESSAGE_BODY = 2000

type AcceptedRequest = {
  id: string
  mentee_id: string
  mentor_id: string
  goal_id: string | null
  status: string
  created_at: string
  updated_at: string
}

/**
 * Loads the relationship and proves the caller belongs to it.
 *
 * Distinguishes "no such request" (404) from "not yours" (403) so a legitimate
 * user gets a fixable message, while an outsider learns only that the id exists.
 */
async function acceptedRequest(db: D1Database, requestId: string, userId: string): Promise<AcceptedRequest> {
  const row = await db
    .prepare(
      `SELECT id, mentee_id, mentor_id, goal_id, status, created_at, updated_at
       FROM mentorship_requests WHERE id = ?`,
    )
    .bind(requestId)
    .first<AcceptedRequest>()

  if (!row) throw new RequestError('No such mentorship request.', 404)
  if (row.status !== 'accepted') {
    throw new RequestError('Messaging opens once the mentor accepts the request.', 409)
  }
  if (row.mentee_id !== userId && row.mentor_id !== userId) {
    throw new RequestError('You are not part of this mentorship.', 403)
  }
  return row
}

export function validateBody(value: unknown): string {
  const body = typeof value === 'string' ? value.trim() : ''
  if (!body) throw new RequestError('Write a message before sending.', 400)
  if (body.length > MAX_MESSAGE_BODY) {
    throw new RequestError(`Keep messages under ${MAX_MESSAGE_BODY} characters.`, 400)
  }
  return body
}

async function namesFor(db: D1Database, userIds: readonly string[]): Promise<Map<string, string>> {
  const ids = [...new Set(userIds.filter(Boolean))]
  const out = new Map<string, string>()
  if (ids.length === 0) return out
  const placeholders = ids.map(() => '?').join(',')
  const { results } = await db
    .prepare(`SELECT user_id, display_name FROM profiles WHERE user_id IN (${placeholders})`)
    .bind(...ids)
    .all<{ user_id: string; display_name: string }>()
  for (const row of results ?? []) out.set(row.user_id, row.display_name || '')
  return out
}

/**
 * Every accepted mentorship the caller is part of, with its messages.
 *
 * Two queries regardless of how many relationships the user has, so the cost
 * does not grow with the number of threads.
 */
export async function listThreads(db: D1Database, userId: string): Promise<ThreadView[]> {
  const { results } = await db
    .prepare(
      `SELECT r.id, r.mentee_id, r.mentor_id, r.goal_id, r.status, r.created_at, r.updated_at,
              g.title AS goal_title
       FROM mentorship_requests r
       LEFT JOIN goals g ON g.id = r.goal_id
       WHERE r.status = 'accepted' AND (r.mentee_id = ? OR r.mentor_id = ?)
       ORDER BY r.created_at DESC`,
    )
    .bind(userId, userId)
    .all<AcceptedRequest & { goal_title: string | null }>()

  const rows = results ?? []
  if (rows.length === 0) return []

  const placeholders = rows.map(() => '?').join(',')
  const { results: messageRows } = await db
    .prepare(
      `SELECT * FROM messages WHERE request_id IN (${placeholders}) ORDER BY created_at ASC`,
    )
    .bind(...rows.map((r) => r.id))
    .all<MessageRow>()

  const names = await namesFor(db, rows.map((r) => (r.mentee_id === userId ? r.mentor_id : r.mentee_id)))

  const byRequest = new Map<string, MessageRow[]>()
  for (const message of messageRows ?? []) {
    const list = byRequest.get(message.request_id) ?? []
    list.push(message)
    byRequest.set(message.request_id, list)
  }

  return rows.map((row) => {
    const messages = byRequest.get(row.id) ?? []
    const counterpartId = row.mentee_id === userId ? row.mentor_id : row.mentee_id
    const unread = messages.filter((m) => m.recipient_id === userId && !m.read_at).length
    const last = messages[messages.length - 1]
    return {
      requestId: row.id,
      counterpart: {
        id: counterpartId,
        name: names.get(counterpartId) || (row.mentee_id === userId ? 'Your mentor' : 'Your student'),
        role: row.mentee_id === userId ? 'mentor' : 'mentee',
      },
      goalTitle: row.goal_title,
      acceptedAt: row.updated_at || row.created_at,
      unread,
      lastMessageAt: last ? last.created_at : null,
      messages: messages.map((m) => ({
        id: m.id,
        body: m.body,
        mine: m.sender_id === userId,
        createdAt: m.created_at,
        read: Boolean(m.read_at),
      })),
    }
  })
}

export async function listThread(db: D1Database, userId: string, requestId: string): Promise<ThreadView> {
  const threads = await listThreads(db, userId)
  const thread = threads.find((t) => t.requestId === requestId)
  if (thread) return thread
  // Not in the list: either it does not exist, is not accepted, or is not ours.
  // `acceptedRequest` decides which, and throws the matching status.
  await acceptedRequest(db, requestId, userId)
  return {
    requestId,
    counterpart: { id: '', name: '', role: 'mentor' },
    goalTitle: null,
    acceptedAt: new Date().toISOString(),
    unread: 0,
    lastMessageAt: null,
    messages: [],
  }
}

/** Posts a message. The caller must be one of the two participants. */
export async function sendMessage(
  db: D1Database,
  userId: string,
  requestId: string,
  rawBody: unknown,
): Promise<MessageView> {
  const body = validateBody(rawBody)
  const request = await acceptedRequest(db, requestId, userId)
  const recipientId = request.mentee_id === userId ? request.mentor_id : request.mentee_id
  const createdAt = new Date().toISOString()
  const id = crypto.randomUUID()

  await db
    .prepare(
      `INSERT INTO messages (id, request_id, sender_id, recipient_id, body, created_at, read_at)
       VALUES (?, ?, ?, ?, ?, ?, NULL)`,
    )
    .bind(id, requestId, userId, recipientId, body, createdAt)
    .run()

  return { id, body, mine: true, createdAt, read: false }
}

/** Marks the other participant's messages as read. Returns how many changed. */
export async function markThreadRead(db: D1Database, userId: string, requestId: string): Promise<number> {
  await acceptedRequest(db, requestId, userId)
  const result = await db
    .prepare(
      'UPDATE messages SET read_at = ? WHERE request_id = ? AND recipient_id = ? AND read_at IS NULL',
    )
    .bind(new Date().toISOString(), requestId, userId)
    .run()
  return result.meta?.changes ?? 0
}
