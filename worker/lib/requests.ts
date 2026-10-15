/**
 * The mentorship request flow.
 *
 * Every transition is decided here, on the server, from the rows: never from a
 * field the client sent. The rules:
 *
 *   pending → accepted | declined   (only the mentor on the request)
 *   pending → withdrawn             (only the student who sent it)
 *
 * `accepted`, `declined` and `withdrawn` are terminal. There is no endpoint that
 * lets a student accept their own request, and no endpoint that lets a mentor
 * decline somebody else's. The WHERE clause in each UPDATE repeats the ownership
 * check, so even a race between two requests cannot move a row the caller does
 * not own.
 */

import { recordEvent } from './db'
import { loadProfile, mentorReadiness, menteeSummary, type Profile } from './profile'
import { readSnapshot } from './matching/index'
import type { Env } from '../env'

export type RequestStatus = 'pending' | 'accepted' | 'declined' | 'withdrawn'
export const REQUEST_STATUSES: readonly RequestStatus[] = ['pending', 'accepted', 'declined', 'withdrawn']

/** The only transitions the server will perform. */
export const TRANSITIONS: Record<'accept' | 'decline' | 'withdraw', { from: RequestStatus; to: RequestStatus; by: 'mentor' | 'mentee' }> = {
  accept: { from: 'pending', to: 'accepted', by: 'mentor' },
  decline: { from: 'pending', to: 'declined', by: 'mentor' },
  withdraw: { from: 'pending', to: 'withdrawn', by: 'mentee' },
}

export type RequestRow = {
  id: string
  mentee_id: string
  mentor_id: string
  goal_id: string | null
  message: string
  status: string
  response: string
  match_score: number | null
  created_at: string
  updated_at: string
}

export type MentorBrief = {
  id: string
  name: string
  headline: string
  expertise: string[]
}

export type RequestView = {
  id: string
  direction: 'incoming' | 'outgoing'
  status: RequestStatus
  message: string
  response: string
  matchScore: number | null
  goalTitle: string | null
  createdAt: string
  updatedAt: string
  mentor: MentorBrief | null
  mentee: ReturnType<typeof menteeSummary> | null
  can: { accept: boolean; decline: boolean; withdraw: boolean }
}

const asStatus = (value: string): RequestStatus =>
  (REQUEST_STATUSES as readonly string[]).includes(value) ? (value as RequestStatus) : 'pending'

export class RequestError extends Error {
  status: number
  constructor(message: string, status = 400) {
    super(message)
    this.name = 'RequestError'
    this.status = status
  }
}

const MAX_MESSAGE = 1000

/**
 * Creates a pending request.
 *
 * Duplicate protection is enforced by a read of the pair's existing rows, and
 * the eligibility checks are repeated here rather than trusted from the match
 * response: a client could otherwise request a mentor who is inactive, not ready
 * or has never existed.
 */
export async function createRequest(
  env: Env,
  menteeId: string,
  mentorId: string,
  input: { message: string; goalId?: string | null },
): Promise<RequestView> {
  if (mentorId === menteeId) throw new RequestError('You cannot request yourself.', 400)

  const mentorProfile = await loadProfile(env.DB, mentorId)
  if (!mentorProfile || mentorProfile.role !== 'mentor') {
    throw new RequestError('That mentor does not exist.', 404)
  }
  const readiness = mentorReadiness(mentorProfile)
  if (!readiness.ready) {
    throw new RequestError(
      `That mentor cannot take requests yet (${readiness.missing.join(', ')}).`,
      409,
    )
  }

  const existing = await env.DB
    .prepare(
      "SELECT id, status FROM mentorship_requests WHERE mentee_id = ? AND mentor_id = ? AND status IN ('pending','accepted','declined') LIMIT 1",
    )
    .bind(menteeId, mentorId)
    .first<{ id: string; status: string }>()
  if (existing) {
    throw new RequestError(
      existing.status === 'pending'
        ? 'You already have a pending request with this mentor.'
        : `You already have a ${existing.status} request with this mentor.`,
      409,
    )
  }

  const message = input.message.trim().slice(0, MAX_MESSAGE)
  const snapshot = await readSnapshot(env.DB, menteeId, mentorId)
  const now = new Date().toISOString()
  const id = crypto.randomUUID()

  await env.DB
    .prepare(
      `INSERT INTO mentorship_requests (id, mentee_id, mentor_id, goal_id, message, status, response, match_score, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, 'pending', '', ?, ?, ?)`,
    )
    .bind(id, menteeId, mentorId, input.goalId ?? null, message, snapshot?.score ?? null, now, now)
    .run()

  await recordEvent(
    env.DB,
    menteeId,
    'request',
    `Request sent to ${mentorProfile.displayName || 'a mentor'}`,
    message.slice(0, 160) || 'No message included.',
  )
  await recordEvent(
    env.DB,
    mentorId,
    'request',
    'New mentorship request',
    'Open your dashboard to accept or decline.',
  )

  const view = await loadRequestView(env, id, menteeId)
  if (!view) throw new RequestError('The request could not be read back.', 500)
  return view
}

async function mentorBrief(profile: Profile): Promise<MentorBrief> {
  return {
    id: profile.userId,
    name: profile.displayName || 'A mentor',
    headline: [profile.education.program, profile.education.year].filter(Boolean).join(' · '),
    expertise: profile.expertise.slice(0, 8),
  }
}

async function goalTitle(db: D1Database, goalId: string | null): Promise<string | null> {
  if (!goalId) return null
  const row = await db.prepare('SELECT title FROM goals WHERE id = ?').bind(goalId).first<{ title: string }>()
  return row?.title ?? null
}

/** One request, with only the fields the viewer is entitled to. */
export async function loadRequestView(
  env: Env,
  requestId: string,
  viewerId: string,
): Promise<RequestView | null> {
  const row = await env.DB
    .prepare('SELECT * FROM mentorship_requests WHERE id = ? AND (mentee_id = ? OR mentor_id = ?)')
    .bind(requestId, viewerId, viewerId)
    .first<RequestRow>()
  if (!row) return null

  const isMentor = row.mentor_id === viewerId
  const status = asStatus(row.status)
  const counterpart = await loadProfile(env.DB, isMentor ? row.mentee_id : row.mentor_id)

  return {
    id: row.id,
    direction: isMentor ? 'incoming' : 'outgoing',
    status,
    message: row.message,
    response: row.response,
    matchScore: row.match_score,
    goalTitle: await goalTitle(env.DB, row.goal_id),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    // A mentor never receives the mentee's private profile fields through this
    // endpoint: only the minimum the relationship needs.
    mentor: isMentor ? null : counterpart && counterpart.role === 'mentor' ? await mentorBrief(counterpart) : null,
    mentee: isMentor && counterpart ? menteeSummary(counterpart) : null,
    can: {
      accept: isMentor && status === 'pending',
      decline: isMentor && status === 'pending',
      withdraw: !isMentor && status === 'pending',
    },
  }
}

export async function listRequests(env: Env, userId: string, role: 'mentor' | 'mentee'): Promise<RequestView[]> {
  const column = role === 'mentor' ? 'mentor_id' : 'mentee_id'
  const { results } = await env.DB
    .prepare(`SELECT id FROM mentorship_requests WHERE ${column} = ? ORDER BY created_at DESC LIMIT 50`)
    .bind(userId)
    .all<{ id: string }>()

  const views: RequestView[] = []
  for (const { id } of results ?? []) {
    const view = await loadRequestView(env, id, userId)
    if (view) views.push(view)
  }
  return views
}

/**
 * Applies a transition.
 *
 * The UPDATE carries the ownership predicate, so two concurrent calls resolve to
 * one state change and a caller can never move a request they do not own: even
 * if they guessed the id.
 */
export async function transition(
  env: Env,
  actorId: string,
  requestId: string,
  action: 'accept' | 'decline' | 'withdraw',
  response = '',
): Promise<RequestView> {
  const rule = TRANSITIONS[action]
  const ownerColumn = rule.by === 'mentor' ? 'mentor_id' : 'mentee_id'

  const row = await env.DB
    .prepare(`SELECT * FROM mentorship_requests WHERE id = ? AND ${ownerColumn} = ?`)
    .bind(requestId, actorId)
    .first<RequestRow>()
  if (!row) throw new RequestError('That request does not exist, or is not yours.', 404)

  const current = asStatus(row.status)
  if (current !== rule.from) {
    throw new RequestError(
      `A ${current} request cannot be ${action === 'withdraw' ? 'withdrawn' : `${action}ed`}. Only pending requests can change.`,
      409,
    )
  }

  const now = new Date().toISOString()
  const changed = await env.DB
    .prepare(
      `UPDATE mentorship_requests SET status = ?, response = ?, updated_at = ?
       WHERE id = ? AND status = 'pending' AND ${ownerColumn} = ?`,
    )
    .bind(rule.to, response.trim().slice(0, MAX_MESSAGE), now, requestId, actorId)
    .run()

  if (!changed.success) throw new RequestError('The request could not be updated.', 500)

  await recordEvent(
    env.DB,
    rule.by === 'mentor' ? row.mentee_id : row.mentor_id,
    'request',
    action === 'accept' ? 'Request accepted' : action === 'decline' ? 'Request declined' : 'Request withdrawn',
    response.trim().slice(0, 160) || 'No note attached.',
  )

  const view = await loadRequestView(env, requestId, actorId)
  if (!view) throw new RequestError('The request could not be read back.', 500)
  return view
}

/**
 * The mentors a student is currently working with.
 *
 * Accepted requests only: a pending request grants no access to anybody's
 * details beyond the minimum profile the directory already shows.
 */
export async function listAcceptedMentors(env: Env, menteeId: string) {
  const { results } = await env.DB
    .prepare("SELECT mentor_id FROM mentorship_requests WHERE mentee_id = ? AND status = 'accepted'")
    .bind(menteeId)
    .all<{ mentor_id: string }>()
  const mentors = []
  for (const { mentor_id } of results ?? []) {
    const profile = await loadProfile(env.DB, mentor_id)
    if (profile) mentors.push(await mentorBrief(profile))
  }
  return mentors
}

/**
 * A mentor's accepted mentees, with the goals they agreed to help with.
 *
 * Only accepted requests appear: a declined or withdrawn request leaves no
 * visible trace in this list, and a pending one exposes nothing.
 */
export async function listMentees(env: Env, mentorId: string) {
  const { results } = await env.DB
    .prepare(
      "SELECT r.id, r.goal_id, r.created_at, r.mentee_id FROM mentorship_requests r WHERE r.mentor_id = ? AND r.status = 'accepted' ORDER BY r.updated_at DESC LIMIT 50",
    )
    .bind(mentorId)
    .all<{ id: string; goal_id: string | null; created_at: string; mentee_id: string }>()

  const mentees = []
  for (const row of results ?? []) {
    const profile = await loadProfile(env.DB, row.mentee_id)
    if (!profile) continue
    const goals = await env.DB
      .prepare("SELECT id, title, status FROM goals WHERE user_id = ? AND status IN ('active','paused') ORDER BY updated_at DESC LIMIT 5")
      .bind(row.mentee_id)
      .all<{ id: string; title: string; status: string }>()
    mentees.push({
      requestId: row.id,
      ...menteeSummary(profile),
      goals: goals.results ?? [],
      since: row.created_at,
    })
  }
  return mentees
}
