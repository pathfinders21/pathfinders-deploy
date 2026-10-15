/**
 * Stage A→C orchestration: read the real profiles, run the pure engine, store
 * what it produced, and optionally let a model rephrase the explanation.
 *
 * The important boundary is here. The engine decides the order; the model is
 * handed the already-computed factors and is allowed to rewrite *sentences*
 * only. If the model is unavailable the deterministic explanation is returned: * a match is never withheld because a phrasing call failed.
 */

import { AiError } from '../ai/errors'
import { aiConfig, type AiEnv } from '../ai/config'
import { generateJson } from '../ai/provider'
import { arr, obj, spec, str, type Spec } from '../ai/schema'
import type { Engine } from '../demo'
import { getActiveGoal } from '../roadmap'
import { listMentorProfiles, mentorReadiness, type Profile } from '../profile'
import { verificationStatusesFor, type VerificationStatus } from '../verification'
import {
  MATCH_WEIGHTS,
  SCORE_DISCLAIMER,
  WEIGHTS_NOTE,
  rankMentors,
  type MatchProfile,
  type MentorCandidate,
  type RankedMentor,
} from './engine'

export type MatchEnv = AiEnv & { DB: D1Database; MENTOR_VERIFICATION_REQUIRED?: string }

/** Human-readable reasons an otherwise-suitable mentor was left out. */
export const EXCLUSION_COPY: Record<string, string> = {
  self: 'You cannot request yourself.',
  inactive: 'Not currently taking requests.',
  incomplete_profile: 'Profile is not complete enough to be matched.',
  blocked: 'Excluded by a safety rule.',
  verification_rejected: 'Their mentor verification was not accepted.',
  verification_suspended: 'This account is suspended and cannot take new requests.',
  verification_required: 'Not verified yet, and this deployment only recommends verified mentors.',
  already_requested: 'You already have a request or a declined request with them.',
  no_shared_availability: 'No free days in common with the days you picked.',
}

export function mentorCandidateFrom(
  profile: Profile,
  verification: VerificationStatus = 'unverified',
): MentorCandidate {
  const readiness = mentorReadiness(profile)
  return {
    id: profile.userId,
    name: profile.displayName || 'A mentor',
    headline: [profile.education.program, profile.education.year].filter(Boolean).join(' · '),
    expertise: profile.expertise,
    interests: profile.interests,
    careers: profile.careers,
    industries: profile.industries,
    mentorGoals: profile.mentorGoals,
    availability: profile.availability,
    mentoringStyle: profile.mentoringStyle,
    bio: profile.bio,
    // No session history exists yet, so this is honestly unknown rather than
    // an invented zero (which would read as "no experience").
    sessions: null,
    rating: null,
    active: profile.active,
    ready: readiness.ready,
    missing: readiness.missing,
    verification,
    account: true,
  }
}

export function matchProfileFrom(
  userId: string,
  profile: Profile,
  goalTitle: string,
): MatchProfile {
  return {
    userId,
    goalTitle: goalTitle || profile.goalsText,
    career: profile.careers[0] ?? '',
    skillsHave: profile.skillsHave,
    skillsWant: profile.skillsWant,
    interests: profile.interests,
    industries: profile.industries,
    mentoringStyle: profile.mentoringStyle,
    availability: profile.availability,
  }
}

/** Mentors whose request relationship already exists in any terminal-but-one state. */
async function excludedMentors(db: D1Database, menteeId: string): Promise<Set<string>> {
  const { results } = await db
    .prepare(
      "SELECT mentor_id FROM mentorship_requests WHERE mentee_id = ? AND status IN ('pending','accepted','declined')",
    )
    .bind(menteeId)
    .all<{ mentor_id: string }>()
  return new Set((results ?? []).map((r) => r.mentor_id))
}

const PHRASE_SPEC: Spec = spec(
  {
    phrasings: arr(
      obj({ mentorId: str(), summary: str('One or two sentences, using only the supplied factors') }, [
        'mentorId',
        'summary',
      ]),
      { max: 6 },
    ),
  },
  ['phrasings'],
)

export type MatchOutput = {
  matches: Array<RankedMentor & { summary: string; phrasedBy: Engine }>
  excluded: Record<string, number>
  excludedReasonText: string[]
  note: string
  weights: typeof MATCH_WEIGHTS
  weightsNote: string
  disclaimer: string
  goalsConsidered: string | null
  candidatePool: number
  engine: Engine
}

/**
 * Produces the ranked, explained recommendations for one student.
 *
 * `phrase` asks the model to rewrite the summaries. It is opt-in because it
 * costs a model call, and it can only succeed at rewording: the ids, the order
 * and the numbers all come from the engine.
 */
export async function recommendMentors(
  env: MatchEnv,
  userId: string,
  profile: Profile,
  opts: { phrase?: boolean; limit?: number } = {},
): Promise<MatchOutput> {
  const goal = await getActiveGoal(env.DB, userId)
  const mentee = matchProfileFrom(userId, profile, goal?.title ?? '')
  const [mentors, excluded] = await Promise.all([listMentorProfiles(env.DB), excludedMentors(env.DB, userId)])
  // One extra query for the whole directory, not one per candidate.
  const statuses = await verificationStatusesFor(env.DB, mentors.map((m) => m.userId))
  const candidates = mentors.map((m) => mentorCandidateFrom(m, statuses.get(m.userId) ?? 'unverified'))

  const run = rankMentors(mentee, candidates, {
    excludedMentorIds: excluded,
    verificationRequired: (env.MENTOR_VERIFICATION_REQUIRED ?? '').trim().toLowerCase() === 'true',
  })
  const limit = opts.limit ?? 12
  const top = run.matches.slice(0, limit)

  let engine: Engine = 'gemini'
  const summaries = new Map<string, string>()

  if (opts.phrase && top.length > 0 && aiConfig(env).apiKey) {
    try {
      const brief = top
        .map((m) => {
          const factors = m.factors
            .filter((f) => f.normalized !== null)
            .map((f) => `${f.label}=${Math.round((f.normalized ?? 0) * 100)}%`)
            .join(', ')
          return `id=${m.mentor.id}: ${m.mentor.name}. ${factors}. Overlap: ${[
            ...m.overlaps.skills,
            ...m.overlaps.goals,
            ...m.overlaps.interests,
          ].join(', ') || 'none recorded'}.`
        })
        .join('\n')
      const out = await generateJson<{ phrasings: Array<{ mentorId: string; summary: string }> }>(
        env,
        { userId, feature: 'match_explain' },
        {
          parts: [
            {
              text: `Here are match factors that have already been computed and ordered. Write one short, plain sentence per mentor explaining the fit, using only these factors. Do not change the order, do not add information, and never state a probability of success.\n\n${brief}`,
            },
          ],
          spec: PHRASE_SPEC,
          system:
            'You rephrase computed facts. You never add facts, never reorder, and never claim an outcome is likely.',
          temperature: 0.4,
          dedupeMaterial: `explain:${top.map((m) => `${m.mentor.id}:${m.score}`).join('|')}`,
        },
      )
      for (const p of out.value.phrasings) summaries.set(p.mentorId, String(p.summary).slice(0, 400))
    } catch (error) {
      if (!(error instanceof AiError)) throw error
      engine = 'demo'
    }
  }

  const matches = top.map((match) => ({
    ...match,
    // The deterministic summary is the fallback, never a placeholder.
    summary: summaries.get(match.mentor.id) ?? match.explanation.summary,
    phrasedBy: (summaries.has(match.mentor.id) ? 'gemini' : 'demo') as Engine,
  }))

  const excludedReasonText = Object.entries(run.excluded)
    .filter(([reason]) => EXCLUSION_COPY[reason])
    .map(([reason, count]) => `${count} mentor${count === 1 ? '' : 's'}: ${EXCLUSION_COPY[reason]}`)

  return {
    matches,
    excluded: run.excluded,
    excludedReasonText,
    note: goal
      ? `Ranked against your goal “${goal.title}” and your stored profile.`
      : 'Ranked against your stored profile. Set a goal to sharpen the goal alignment factor.',
    weights: MATCH_WEIGHTS,
    weightsNote: WEIGHTS_NOTE,
    disclaimer: SCORE_DISCLAIMER,
    goalsConsidered: goal?.title ?? null,
    candidatePool: candidates.length,
    engine: summaries.size > 0 ? 'gemini' : engine,
  }
}

/**
 * Persists the score for a mentor/mentee pair.
 *
 * A request stores the score it was made against, so the mentor sees the same
 * number the student saw, and the pair can be re-scored later without losing the
 * original. Upsert rather than insert: re-running the match refreshes the row.
 */
export async function saveSnapshot(
  db: D1Database,
  menteeId: string,
  scored: { mentor: MentorCandidate; score: number; confidence: string; factors: unknown; missing: string[] },
): Promise<void> {
  await db
    .prepare(
      `INSERT INTO match_snapshots (mentee_id, mentor_id, score, confidence, factors, missing, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(mentee_id, mentor_id) DO UPDATE SET
         score = excluded.score,
         confidence = excluded.confidence,
         factors = excluded.factors,
         missing = excluded.missing,
         updated_at = excluded.updated_at`,
    )
    .bind(
      menteeId,
      scored.mentor.id,
      Math.round(scored.score),
      scored.confidence,
      JSON.stringify(scored.factors),
      JSON.stringify(scored.missing),
      new Date().toISOString(),
    )
    .run()
}

export async function readSnapshot(
  db: D1Database,
  menteeId: string,
  mentorId: string,
): Promise<{ score: number; factors: unknown; missing: string[] } | null> {
  const row = await db
    .prepare('SELECT score, factors, missing FROM match_snapshots WHERE mentee_id = ? AND mentor_id = ?')
    .bind(menteeId, mentorId)
    .first<{ score: number; factors: string; missing: string }>()
  if (!row) return null
  const parse = <T>(raw: string, fallback: T): T => {
    try {
      return JSON.parse(raw) as T
    } catch {
      return fallback
    }
  }
  return { score: row.score, factors: parse(row.factors, []), missing: parse(row.missing, []) }
}

export { SCORE_DISCLAIMER, WEIGHTS_NOTE }
