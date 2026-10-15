/**
 * The deterministic mentor-matching engine.
 *
 * Pure functions, no database, no clock, no randomness and no model. An LLM is
 * never allowed to choose or order mentors: it may only rephrase an explanation
 * that was computed here. That rule exists because a model's ordering is not
 * reproducible, not auditable and cannot be defended to a student who asks "why
 * this person?".
 *
 * Three stages, matching the brief:
 *
 *   A. `eligibility`: hard filters. Inactive, incomplete, self, blocked, already
 *      requested, or no shared availability when both sides stated days.
 *   B. `scoreMentor`: six weighted factors. Missing data is NOT a zero: the
 *      factor is dropped, the remaining weights are renormalised, and the
 *      confidence drops. Protected characteristics are never inputs: nothing
 *      about age, gender, nationality, religion or disability exists in the
 *      inputs at all.
 *   C. `explain`: prose built from the computed factors only.
 *
 * The weights are a configurable starting point, not validated science, and the
 * output is a *fit score*, never a probability of success.
 */

export const MATCH_WEIGHTS = {
  goal: 25,
  skills: 25,
  expertise: 20,
  interests: 10,
  availability: 10,
  industry: 10,
} as const

export type FactorKey = keyof typeof MATCH_WEIGHTS

export const FACTOR_LABELS: Record<FactorKey, string> = {
  goal: 'Career goal alignment',
  skills: 'Skills & learning needs',
  expertise: 'Mentor expertise',
  interests: 'Interests & mentoring preferences',
  availability: 'Availability',
  industry: 'Industry & experience relevance',
}

export const WEIGHTS_NOTE =
  'Weights are a configurable starting point for ranking, not validated science.'

export const SCORE_DISCLAIMER =
  'A fit score for ranking, not a probability of success, of a good match, or of any outcome.'

/** A mentor as the engine sees them. Structurally typed so tests need no database. */
import type { VerificationStatus } from '../verification'

export type MentorCandidate = {
  id: string
  name: string
  headline: string
  expertise: string[]
  interests: string[]
  careers: string[]
  industries: string[]
  mentorGoals: string[]
  availability: string[]
  mentoringStyle: string
  bio: string
  /** Completed sessions, when the platform has that history; null otherwise. */
  sessions: number | null
  rating: number | null
  active: boolean
  /** Result of the profile's readiness gate. */
  ready: boolean
  /** Which readiness requirements are unmet, for the "why not matched" note. */
  missing: string[]
  /**
   * Latest reviewed verification status. `unverified` means no evidence has
   * been reviewed yet: it is not a negative finding about the mentor.
   */
  verification: VerificationStatus
  /** Whether a real account backs this profile (seeded examples are not requestable). */
  account: boolean
}

export type MatchProfile = {
  userId: string
  goalTitle: string
  career: string
  skillsHave: string[]
  skillsWant: string[]
  interests: string[]
  industries: string[]
  mentoringStyle: string
  availability: string[]
}

export type MatchContext = {
  /** Pairs with a pending, accepted or declined request: never recommended again. */
  excludedMentorIds: ReadonlySet<string>
  /** Reserved for a future blocking feature; empty today. */
  blockedMentorIds?: ReadonlySet<string>
  /**
   * When true, only a `verified` mentor is recommendable. Off by default, since
   * a deployment whose review queue is empty would otherwise recommend nobody.
   * A rejected or suspended mentor is excluded regardless of this flag.
   */
  verificationRequired?: boolean
}

/* ------------------------------------------------------------------ *
 *  Stage A: eligibility
 * ------------------------------------------------------------------ */

export type Eligibility = { eligible: boolean; reason: string | null }

const ineligible = (reason: string): Eligibility => ({ eligible: false, reason })

/**
 * The hard filters, in the order a reviewer would check them.
 *
 * Every rejection carries a machine-readable reason so the API can explain an
 * empty result honestly ("every mentor who fits is already handling a request")
 * instead of showing a blank grid.
 */
export function eligibility(
  mentee: MatchProfile,
  mentor: MentorCandidate,
  context: MatchContext,
): Eligibility {
  if (mentor.id === mentee.userId) return ineligible('self')
  if (!mentor.active) return ineligible('inactive')
  if (!mentor.ready) return ineligible('incomplete_profile')
  if (context.blockedMentorIds?.has(mentor.id)) return ineligible('blocked')
  // A refused or suspended review is a standing decision about this account,
  // so it is enforced whether or not verification gates matching.
  if (mentor.verification === 'rejected') return ineligible('verification_rejected')
  if (mentor.verification === 'suspended') return ineligible('verification_suspended')
  if (context.verificationRequired && mentor.verification !== 'verified') {
    return ineligible('verification_required')
  }
  if (context.excludedMentorIds.has(mentor.id)) return ineligible('already_requested')

  // "Unavailable for the requested arrangement": only enforced when both sides
  // actually stated availability. An unstated schedule is missing data, not a
  // conflict, so it stays a scoring factor instead of a rejection.
  if (
    mentee.availability.length > 0 &&
    mentor.availability.length > 0 &&
    overlap(mentee.availability, mentor.availability).length === 0
  ) {
    return ineligible('no_shared_availability')
  }

  return { eligible: true, reason: null }
}

/* ------------------------------------------------------------------ *
 *  Stage B: scoring
 * ------------------------------------------------------------------ */

export type Factor = {
  key: FactorKey
  label: string
  weight: number
  /** 0..1 when the data exists on both sides, null when it does not. */
  normalized: number | null
  /** Points added to the 0..100 total. Zero for a dropped factor. */
  contribution: number
  note: string
}

export type Overlaps = {
  goals: string[]
  skills: string[]
  interests: string[]
  days: string[]
  industries: string[]
}

export type ScoredMentor = {
  mentor: MentorCandidate
  score: number
  confidence: 'high' | 'medium' | 'low'
  factors: Factor[]
  /** Factor labels that could not be evaluated because a side was blank. */
  missing: string[]
  overlaps: Overlaps
  explanation: { headline: string; summary: string; caveats: string[] }
}

const clamp01 = (n: number) => Math.min(1, Math.max(0, n))
const norm = (value: string) => value.trim().toLowerCase()

/** Items of `need` that `offer` covers, deduplicated, order-preserving. */
export function overlap(need: readonly string[], offer: readonly string[]): string[] {
  const have = new Set(offer.map(norm).filter(Boolean))
  const seen = new Set<string>()
  const hits: string[] = []
  for (const item of need) {
    const key = norm(item)
    if (!key || seen.has(key) || !have.has(key)) continue
    seen.add(key)
    hits.push(item)
  }
  return hits
}

/** Fraction of `need` present in `offer`; null when either side is blank. */
export function coverage(need: readonly string[], offer: readonly string[]): number | null {
  if (need.length === 0 || offer.length === 0) return null
  return clamp01(overlap(need, offer).length / need.length)
}

const STOP = new Set(['the', 'and', 'for', 'with', 'into', 'your', 'a', 'an', 'of', 'to', 'in', 'on'])

function terms(input: string): Set<string> {
  return new Set(
    input
      .toLowerCase()
      .split(/[^a-z0-9+#.]+/)
      .filter((t) => t.length > 2 && !STOP.has(t)),
  )
}

/**
 * Token overlap between two free-text fields.
 *
 * Used only for goal text and mentoring-style prose, where the values are
 * sentences rather than curated lists. Returns null when either side is blank so
 * the caller can treat it as missing rather than as a zero.
 */
export function textSimilarity(a: string, b: string): number | null {
  const left = terms(a)
  const right = terms(b)
  if (left.size === 0 || right.size === 0) return null
  let hits = 0
  for (const t of left) if (right.has(t)) hits++
  return clamp01(hits / Math.min(left.size, right.size))
}

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`

/**
 * Scores one eligible mentor.
 *
 * The returned `score` is renormalised: a factor with no data on either side is
 * dropped from both the numerator and the denominator, so blank profiles are not
 * punished as mismatches. That is the difference between "we cannot tell" and
 * "this is wrong for you".
 */
export function scoreMentor(mentee: MatchProfile, mentor: MentorCandidate): ScoredMentor {
  const goals = overlap(
    [mentee.goalTitle, mentee.career].filter(Boolean),
    [...mentor.mentorGoals, ...mentor.careers],
  )
  const skills = overlap(mentee.skillsWant, mentor.expertise)
  const interests = overlap(mentee.interests, [...mentor.interests, ...mentor.expertise])
  const days = overlap(mentee.availability, mentor.availability)
  const industries = overlap(mentee.industries, [...mentor.industries, ...mentor.careers])

  const careerMatch = Boolean(mentee.career) && mentor.careers.map(norm).includes(norm(mentee.career))
  const goalSimilarity = textSimilarity(mentee.goalTitle, [...mentor.mentorGoals, ...mentor.careers].join(' '))

  const goalScore =
    careerMatch || goals.length > 0
      ? 1
      : goalSimilarity

  const styleSimilarity = textSimilarity(
    mentee.mentoringStyle,
    [mentor.mentoringStyle, ...mentor.interests].join(' '),
  )

  const interestScore =
    interests.length > 0 || coverage(mentee.interests, mentor.interests) !== null
      ? Math.max(coverage(mentee.interests, mentor.interests) ?? 0, styleSimilarity ?? 0)
      : styleSimilarity

  // Mentor expertise is a depth signal, not an overlap: breadth of listed
  // expertise, blended with a track record when the platform has one.
  const breadth = mentor.expertise.length > 0 ? clamp01(mentor.expertise.length / 6) : null
  const record = mentor.sessions !== null ? clamp01(mentor.sessions / 50) : null
  const expertiseScore =
    breadth === null ? null : record === null ? breadth : clamp01(0.7 * breadth + 0.3 * record)

  const raw: Array<{ key: FactorKey; score: number | null; note: string }> = [
    {
      key: 'goal',
      score: mentee.goalTitle || mentee.career ? goalScore : null,
      note: mentee.goalTitle || mentee.career
        ? careerMatch
          ? `Works in the direction you chose (${mentee.career}).`
          : goals.length > 0
            ? `Mentors for ${goals.join(', ')}, which lines up with your goal.`
            : `Goal text has no clear overlap with their stated focus.`
        : '',
    },
    {
      key: 'skills',
      score: coverage(mentee.skillsWant, mentor.expertise),
      note: skills.length > 0
        ? `Covers ${plural(skills.length, 'skill')} you want to build: ${skills.join(', ')}.`
        : mentor.expertise.length === 0
          ? 'This mentor has not listed expertise yet.'
          : `No overlap with the ${plural(mentee.skillsWant.length, 'skill')} you want to build.`,
    },
    {
      key: 'expertise',
      score: expertiseScore,
      note: mentor.expertise.length === 0
        ? 'No expertise listed, so depth could not be assessed.'
        : `Lists ${plural(mentor.expertise.length, 'area')}${mentor.sessions !== null ? ` and ${mentor.sessions} sessions` : ''}.`,
    },
    {
      key: 'interests',
      score: interestScore,
      note: interests.length > 0
        ? `Shares your interest in ${interests.join(', ')}.`
        : styleSimilarity !== null
          ? 'Mentoring style wording overlaps with your stated preference.'
          : 'Neither interests nor mentoring style could be compared.',
    },
    {
      key: 'availability',
      score: coverage(mentee.availability, mentor.availability),
      note: days.length > 0
        ? `Free on ${days.join(', ')}: the same days as you.`
        : mentor.availability.length === 0
          ? 'This mentor has not set availability.'
          : 'No shared free days.',
    },
    {
      key: 'industry',
      score: coverage(mentee.industries, [...mentor.industries, ...mentor.careers]),
      note: industries.length > 0
        ? `Experience in ${industries.join(', ')}.`
        : mentor.industries.length === 0
          ? 'No industry listed.'
          : 'Different industry focus from yours.',
    },
  ]

  const present = raw.filter((r) => r.score !== null)
  const totalWeight = present.reduce((sum, r) => sum + MATCH_WEIGHTS[r.key], 0)

  const factors: Factor[] = raw.map(({ key, score, note }) => ({
    key,
    label: FACTOR_LABELS[key],
    weight: MATCH_WEIGHTS[key],
    normalized: score,
    contribution: score !== null && totalWeight > 0 ? (score * MATCH_WEIGHTS[key] * 100) / totalWeight : 0,
    note,
  }))

  const score = Math.round(factors.reduce((sum, f) => sum + f.contribution, 0))
  const missing = raw.filter((r) => r.score === null).map((r) => FACTOR_LABELS[r.key])
  const confidence: ScoredMentor['confidence'] = missing.length === 0 ? 'high' : missing.length === 1 ? 'medium' : 'low'

  const overlaps: Overlaps = {
    goals,
    skills,
    interests,
    days,
    industries,
  }

  return {
    mentor,
    score,
    confidence,
    factors,
    missing,
    overlaps,
    explanation: explain(mentee, mentor, { score, confidence, overlaps, missing }),
  }
}

/* ------------------------------------------------------------------ *
 *  Stage C: explanation, from the computed factors only
 * ------------------------------------------------------------------ */

function explain(
  mentee: MatchProfile,
  mentor: MentorCandidate,
  input: Pick<ScoredMentor, 'score' | 'confidence' | 'overlaps' | 'missing'>,
): ScoredMentor['explanation'] {
  const { overlaps, missing, confidence } = input
  const parts: string[] = []

  if (overlaps.skills.length > 0) {
    parts.push(`covers ${overlaps.skills.slice(0, 3).join(', ')}`)
  }
  if (overlaps.goals.length > 0) {
    parts.push(`mentors for ${overlaps.goals[0]}`)
  }
  if (overlaps.days.length > 0) {
    parts.push(`is free on ${overlaps.days.join(' & ')}`)
  }
  if (overlaps.industries.length > 0) {
    parts.push(`brings ${overlaps.industries.join(', ')} experience`)
  }

  const named = mentor.name.split(' ')[0] || mentor.name
  const summary =
    parts.length > 0
      ? `${named} ${parts.join(', ')}.`
      : `${named} matched on the factors that could be compared, with no direct overlap recorded.`

  const caveats: string[] = []
  if (missing.length > 0) {
    caveats.push(`Not assessed (no data): ${missing.join(', ')}.`)
  }
  if (confidence !== 'high') {
    caveats.push('Lower confidence: some factors could not be compared, so this rank is less certain.')
  }
  if (!mentor.account) {
    caveats.push('Example profile with no account attached: you cannot send it a request.')
  }
  if (mentee.availability.length === 0) {
    caveats.push('Add your free days to compare availability.')
  }

  return { headline: `${named} · ${input.score}% fit`, summary, caveats }
}

/* ------------------------------------------------------------------ *
 *  Ranking
 * ------------------------------------------------------------------ */

export type RankedMentor = ScoredMentor & { rank: number }

export type MatchRun = {
  matches: RankedMentor[]
  /** Counts per rejection reason, so the UI can explain an empty list. */
  excluded: Record<string, number>
}

/**
 * Ranks every candidate.
 *
 * Ties break on id so the list never reshuffles between requests: the whole
 * point of a deterministic engine is that the same profile yields the same
 * order. Candidates that fail Stage A are counted, not silently dropped.
 */
export function rankMentors(
  mentee: MatchProfile,
  candidates: readonly MentorCandidate[],
  context: MatchContext,
): MatchRun {
  const excluded: Record<string, number> = {}
  const scored: ScoredMentor[] = []

  for (const mentor of candidates) {
    const verdict = eligibility(mentee, mentor, context)
    if (!verdict.eligible) {
      const reason = verdict.reason ?? 'ineligible'
      excluded[reason] = (excluded[reason] ?? 0) + 1
      continue
    }
    scored.push(scoreMentor(mentee, mentor))
  }

  scored.sort((a, b) => b.score - a.score || a.mentor.id.localeCompare(b.mentor.id))

  return { matches: scored.map((match, i) => ({ ...match, rank: i + 1 })), excluded }
}
