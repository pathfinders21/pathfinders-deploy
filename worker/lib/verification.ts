/**
 * Mentor verification: an explicit review workflow, kept separate from
 * authentication and from profile completion.
 *
 * Signing in proves an identity at the provider. It proves nothing about
 * experience or suitability, so it is *not* treated as verification here. A
 * mentor submits a written claim plus optional public links; a moderator
 * decides. Status is derived from the latest row in `mentor_verifications`,
 * which is append-only, so history is preserved and a decision is never
 * overwritten in place.
 *
 * A moderator is identified by `MODERATOR_SUBS` (a comma-separated list of
 * Freebuff `sub` values). That is a server side variable; it is never read from
 * the client and there is no route that lets a user grant it to themselves.
 *
 * Nothing in this module claims that a mentor is institutionally affiliated.
 * `evidence` is a claim by the applicant, reviewed by a human; the UI is
 * required to describe it that way.
 */

import { RequestError } from './requests'
import type { Env } from '../env'
import type { Profile } from './profile'

export type VerificationStatus = 'unverified' | 'pending' | 'verified' | 'rejected' | 'suspended'
export const VERIFICATION_STATUSES: readonly VerificationStatus[] = [
  'unverified',
  'pending',
  'verified',
  'rejected',
  'suspended',
]

export type VerificationKind = 'project' | 'portfolio' | 'experience' | 'reference'
export const VERIFICATION_KINDS: readonly VerificationKind[] = ['project', 'portfolio', 'experience', 'reference']

export type VerificationDecision = 'verified' | 'rejected' | 'suspended'
export const VERIFICATION_DECISIONS: readonly VerificationDecision[] = ['verified', 'rejected', 'suspended']

/** What each status means, phrased for the person reading it. */
export const VERIFICATION_COPY: Record<VerificationStatus, { label: string; detail: string; tone: 'neutral' | 'wait' | 'good' | 'bad' }> = {
  unverified: {
    label: 'Not verified',
    detail: 'No evidence has been reviewed yet. Matching does not treat this as a claim about experience.',
    tone: 'neutral',
  },
  pending: {
    label: 'Verification pending',
    detail: 'Your submission is in the review queue. Nothing is public until a reviewer decides.',
    tone: 'wait',
  },
  verified: {
    label: 'Verified',
    detail: 'A reviewer accepted the evidence you supplied. This confirms the submission was reviewed: not an academic affiliation.',
    tone: 'good',
  },
  rejected: {
    label: 'Not accepted',
    detail: 'A reviewer could not accept the evidence as submitted. You can correct it and submit again.',
    tone: 'bad',
  },
  suspended: {
    label: 'Suspended',
    detail: 'This account cannot take new mentorship requests. Contact support if you believe this is a mistake.',
    tone: 'bad',
  },
}

export type VerificationRow = {
  id: string
  user_id: string
  status: string
  kind: string
  statement: string
  links: string
  submitted_at: string
  reviewed_at: string | null
  reviewer_id: string | null
  decision_note: string
}

export type VerificationSubmission = {
  id: string
  status: VerificationStatus
  kind: string
  statement: string
  links: string[]
  submittedAt: string
  reviewedAt: string | null
  decisionNote: string
}

export type VerificationSummary = {
  status: VerificationStatus
  copy: (typeof VERIFICATION_COPY)[VerificationStatus]
  latest: VerificationSubmission | null
  history: VerificationSubmission[]
  canSubmit: boolean
  blockedReason: string | null
  /** True only for a moderator account; the UI uses it to reveal the queue, never to grant access. */
  isModerator: boolean
}

const MAX_STATEMENT = 1200
const MIN_STATEMENT = 40
const MAX_LINKS = 5
const MAX_LINK = 300

const asStatus = (value: string): VerificationStatus =>
  (VERIFICATION_STATUSES as readonly string[]).includes(value) ? (value as VerificationStatus) : 'unverified'

const asKind = (value: string): VerificationKind =>
  (VERIFICATION_KINDS as readonly string[]).includes(value) ? (value as VerificationKind) : 'project'

function parseLinks(raw: string): string[] {
  try {
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed.filter((v): v is string => typeof v === 'string') : []
  } catch {
    return []
  }
}

function toSubmission(row: VerificationRow): VerificationSubmission {
  return {
    id: row.id,
    status: asStatus(row.status),
    kind: row.kind,
    statement: row.statement,
    links: parseLinks(row.links),
    submittedAt: row.submitted_at,
    reviewedAt: row.reviewed_at,
    decisionNote: row.decision_note,
  }
}

/** The moderator allowlist, as configured on the server. */
export function moderatorSubs(env: Pick<Env, 'MODERATOR_SUBS'>): string[] {
  return (env.MODERATOR_SUBS ?? '')
    .split(',')
    .map((v) => v.trim())
    .filter(Boolean)
}

export function isModerator(env: Pick<Env, 'MODERATOR_SUBS'>, userId: string): boolean {
  return moderatorSubs(env).includes(userId)
}

/**
 * Normalises a public link. Only http(s) is accepted, and a bare host is
 * upgraded to https so a mentor cannot submit `javascript:` or a scheme-relative
 * value that a later renderer might treat as markup.
 */
export function normaliseLink(value: string): string | null {
  const trimmed = value.trim()
  if (!trimmed || trimmed.length > MAX_LINK) return null
  const candidate = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`
  let url: URL
  try {
    url = new URL(candidate)
  } catch {
    return null
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return null
  if (!url.hostname.includes('.')) return null
  return url.toString()
}

export async function latestVerification(db: D1Database, userId: string): Promise<VerificationRow | null> {
  return await db
    .prepare('SELECT * FROM mentor_verifications WHERE user_id = ? ORDER BY submitted_at DESC, rowid DESC LIMIT 1')
    .bind(userId)
    .first<VerificationRow>()
}

export async function verificationStatus(db: D1Database, userId: string): Promise<VerificationStatus> {
  const row = await latestVerification(db, userId)
  return row ? asStatus(row.status) : 'unverified'
}

/** Bulk status lookup for the matching engine, in one query. */
export async function verificationStatusesFor(
  db: D1Database,
  userIds: readonly string[],
): Promise<Map<string, VerificationStatus>> {
  const out = new Map<string, VerificationStatus>()
  const ids = [...new Set(userIds.filter(Boolean))]
  if (ids.length === 0) return out
  const placeholders = ids.map(() => '?').join(',')
  const { results } = await db
    .prepare(
      `SELECT user_id, status FROM mentor_verifications
       WHERE id IN (SELECT id FROM mentor_verifications WHERE user_id IN (${placeholders}))
       ORDER BY submitted_at ASC, rowid ASC`,
    )
    .bind(...ids)
    .all<{ user_id: string; status: string }>()
  // Ascending order means the last write per user wins, mirroring "latest row".
  for (const row of results ?? []) out.set(row.user_id, asStatus(row.status))
  return out
}

export async function verificationSummary(
  env: Pick<Env, 'MODERATOR_SUBS'>,
  db: D1Database,
  userId: string,
): Promise<VerificationSummary> {
  const { results } = await db
    .prepare('SELECT * FROM mentor_verifications WHERE user_id = ? ORDER BY submitted_at DESC, rowid DESC LIMIT 20')
    .bind(userId)
    .all<VerificationRow>()

  const history = (results ?? []).map(toSubmission)
  const latest = history[0] ?? null
  const status = latest ? latest.status : 'unverified'

  let canSubmit = true
  let blockedReason: string | null = null
  if (status === 'pending') {
    canSubmit = false
    blockedReason = 'You already have a submission waiting for review.'
  } else if (status === 'suspended') {
    canSubmit = false
    blockedReason = 'A suspended account cannot submit new verification evidence.'
  }

  return {
    status,
    copy: VERIFICATION_COPY[status],
    latest,
    history,
    canSubmit,
    blockedReason,
    isModerator: isModerator(env, userId),
  }
}

export type SubmitInput = { kind?: string; statement?: string; links?: unknown }

/**
 * Records a verification submission as `pending`.
 *
 * The actor must already hold the mentor role on their server side profile, so
 * a mentee cannot enter the review queue by calling the endpoint directly.
 */
export async function submitVerification(
  env: Pick<Env, 'MODERATOR_SUBS'>,
  db: D1Database,
  userId: string,
  profile: Profile,
  input: SubmitInput,
): Promise<VerificationSummary> {
  if (profile.role !== 'mentor') {
    throw new RequestError('Only a mentor account can submit verification evidence.', 403)
  }

  const statement = (input.statement ?? '').trim()
  if (statement.length < MIN_STATEMENT) {
    throw new RequestError(
      `Describe what you would like reviewed in at least ${MIN_STATEMENT} characters.`,
      400,
    )
  }
  if (statement.length > MAX_STATEMENT) {
    throw new RequestError(`Keep the description under ${MAX_STATEMENT} characters.`, 400)
  }

  const rawLinks = Array.isArray(input.links) ? input.links : []
  if (rawLinks.length > MAX_LINKS) {
    throw new RequestError(`Add at most ${MAX_LINKS} links.`, 400)
  }
  const links: string[] = []
  for (const raw of rawLinks) {
    if (typeof raw !== 'string' || raw.trim() === '') continue
    const normalised = normaliseLink(raw)
    if (!normalised) throw new RequestError(`"${raw.slice(0, 60)}" is not a usable public link.`, 400)
    links.push(normalised)
  }

  const current = await verificationStatus(db, userId)
  if (current === 'pending') {
    throw new RequestError('You already have a submission waiting for review.', 409)
  }
  if (current === 'suspended') {
    throw new RequestError('A suspended account cannot submit new verification evidence.', 409)
  }

  const now = new Date().toISOString()
  await db
    .prepare(
      `INSERT INTO mentor_verifications (id, user_id, status, kind, statement, links, submitted_at, reviewed_at, reviewer_id, decision_note)
       VALUES (?, ?, 'pending', ?, ?, ?, ?, NULL, NULL, '')`,
    )
    .bind(crypto.randomUUID(), userId, asKind(input.kind ?? 'project'), statement, JSON.stringify(links), now)
    .run()

  return verificationSummary(env, db, userId)
}

/** The review queue. Moderator-only; the caller is checked in the router. */
export async function pendingVerifications(
  db: D1Database,
  limit = 50,
): Promise<Array<VerificationSubmission & { userId: string; displayName: string }>> {
  const { results } = await db
    .prepare(
      `SELECT v.*, COALESCE(p.display_name, '') AS display_name
       FROM mentor_verifications v
       LEFT JOIN profiles p ON p.user_id = v.user_id
       WHERE v.status = 'pending'
       ORDER BY v.submitted_at ASC
       LIMIT ?`,
    )
    .bind(limit)
    .all<VerificationRow & { display_name: string }>()

  return (results ?? []).map((row) => ({
    ...toSubmission(row),
    userId: row.user_id,
    displayName: row.display_name || 'Unnamed mentor',
  }))
}

/**
 * Records a moderator decision. Only a `pending` row can move, so two reviewers
 * racing on the same submission cannot both finalise it.
 */
export async function decideVerification(
  db: D1Database,
  verificationId: string,
  reviewerId: string,
  decision: string,
  note = '',
): Promise<VerificationSubmission> {
  if (!(VERIFICATION_DECISIONS as readonly string[]).includes(decision)) {
    throw new RequestError('decision must be one of: verified, rejected, suspended.', 400)
  }
  if (note.length > 800) throw new RequestError('Keep the review note under 800 characters.', 400)

  const row = await db
    .prepare('SELECT * FROM mentor_verifications WHERE id = ?')
    .bind(verificationId)
    .first<VerificationRow>()
  if (!row) throw new RequestError('No such verification submission.', 404)

  const result = await db
    .prepare(
      `UPDATE mentor_verifications
       SET status = ?, reviewed_at = ?, reviewer_id = ?, decision_note = ?
       WHERE id = ? AND status = 'pending'`,
    )
    .bind(decision, new Date().toISOString(), reviewerId, note.trim(), verificationId)
    .run()

  if (!result.meta?.changes) {
    throw new RequestError(`That submission is already ${asStatus(row.status)}.`, 409)
  }

  const updated = await db
    .prepare('SELECT * FROM mentor_verifications WHERE id = ?')
    .bind(verificationId)
    .first<VerificationRow>()
  return toSubmission(updated ?? row)
}
