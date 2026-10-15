import { describe, expect, it } from 'vitest'
import {
  FACTOR_LABELS,
  MATCH_WEIGHTS,
  SCORE_DISCLAIMER,
  coverage,
  eligibility,
  overlap,
  rankMentors,
  scoreMentor,
  textSimilarity,
  type MatchProfile,
  type MentorCandidate,
} from './engine'

/**
 * These tests pin the *rules* of the matching engine: what is excluded, how
 * missing data is handled, and that the order is reproducible. The engine is
 * pure, so nothing here needs a database.
 */

const mentor = (over: Partial<MentorCandidate> = {}): MentorCandidate => ({
  id: 'm-01',
  name: 'Aarav Mehta',
  headline: 'Final year · Computer Science',
  expertise: ['Distributed systems', 'Databases', 'Data structures'],
  interests: ['open source'],
  careers: ['swe'],
  industries: ['software'],
  mentorGoals: ['internship', 'placement'],
  availability: ['Tue', 'Thu'],
  mentoringStyle: 'structured and direct',
  bio: 'Backend engineer who enjoys debugging sessions and internship preparation.',
  sessions: null,
  rating: null,
  active: true,
  ready: true,
  missing: [],
  verification: 'verified',
  account: true,
  ...over,
})

const mentee = (over: Partial<MatchProfile> = {}): MatchProfile => ({
  userId: 'u-1',
  goalTitle: 'Land a backend internship',
  career: 'swe',
  skillsHave: ['Python'],
  skillsWant: ['Databases', 'Distributed systems'],
  interests: ['open source'],
  industries: ['software'],
  mentoringStyle: 'structured',
  availability: ['Tue'],
  ...over,
})

const noContext = { excludedMentorIds: new Set<string>() }

describe('overlap helpers', () => {
  it('is case-insensitive, order-preserving and de-duplicated', () => {
    expect(overlap(['Databases', 'databases', 'Go'], ['databases', 'GO'])).toEqual(['Databases', 'Go'])
  })

  it('reports "no data" as null rather than zero', () => {
    expect(coverage([], ['x'])).toBeNull()
    expect(coverage(['x'], [])).toBeNull()
    expect(coverage(['x', 'y'], ['x'])).toBe(0.5)
  })

  it('compares free text only when both sides have words', () => {
    expect(textSimilarity('', 'anything')).toBeNull()
    expect(textSimilarity('structured direct', 'direct and structured')).toBe(1)
  })
})

describe('stage A: eligibility', () => {
  it('excludes the caller, inactive, incomplete, blocked and already-requested mentors', () => {
    expect(eligibility(mentee({ userId: 'm-01' }), mentor(), noContext).reason).toBe('self')
    expect(eligibility(mentee(), mentor({ active: false }), noContext).reason).toBe('inactive')
    expect(eligibility(mentee(), mentor({ ready: false }), noContext).reason).toBe('incomplete_profile')
    expect(
      eligibility(mentee(), mentor(), { excludedMentorIds: new Set(['m-01']), blockedMentorIds: new Set() }).reason,
    ).toBe('already_requested')
    expect(
      eligibility(mentee(), mentor(), { excludedMentorIds: new Set(), blockedMentorIds: new Set(['m-01']) }).reason,
    ).toBe('blocked')
  })

  it('treats an unstated schedule as missing data, not as a conflict', () => {
    // Both sides stated days and there is no overlap: a real conflict.
    expect(eligibility(mentee({ availability: ['Mon'] }), mentor({ availability: ['Fri'] }), noContext).reason).toBe(
      'no_shared_availability',
    )
    // The mentor never set availability: nothing to conflict with.
    expect(eligibility(mentee({ availability: ['Mon'] }), mentor({ availability: [] }), noContext).eligible).toBe(true)
    // The student never set days: nothing was requested, so nothing to reject.
    expect(eligibility(mentee({ availability: [] }), mentor({ availability: ['Fri'] }), noContext).eligible).toBe(true)
  })
})

describe('stage B: scoring', () => {
  it('renormalises instead of punishing missing data', () => {
    const full = scoreMentor(mentee(), mentor())
    const partial = scoreMentor(mentee({ industries: [] }), mentor({ industries: [] }))

    expect(partial.missing).toContain(FACTOR_LABELS.industry)
    expect(partial.confidence).toBe('medium')
    // Dropping a factor does not push the score to zero or below a "bad" score:
    // it is renormalised over the factors that could actually be compared.
    expect(partial.score).toBeGreaterThan(0)
    expect(full.missing).toHaveLength(0)
    expect(full.confidence).toBe('high')
  })

  it('reports low confidence when two or more factors cannot be compared', () => {
    const scored = scoreMentor(mentee({ industries: [], availability: [], mentoringStyle: '' }), mentor({ industries: [] }))
    expect(scored.confidence).toBe('low')
    expect(scored.missing.length).toBeGreaterThanOrEqual(2)
  })

  it('prefers the mentor with the stronger overlap on the stated goal and skills', () => {
    const strong = scoreMentor(mentee(), mentor())
    const weak = scoreMentor(
      mentee(),
      mentor({ id: 'm-09', careers: ['research'], mentorGoals: ['research'], expertise: ['Machine learning'], industries: ['academia'], availability: ['Mon'], mentoringStyle: 'peer' }),
    )
    expect(strong.score).toBeGreaterThan(weak.score)
  })

  it('keeps the documented weights and states 100 of them', () => {
    const total = Object.values(MATCH_WEIGHTS).reduce((sum, w) => sum + w, 0)
    expect(total).toBe(100)
    expect(MATCH_WEIGHTS.goal).toBe(25)
    expect(MATCH_WEIGHTS.skills).toBe(25)
  })

  it('never describes itself as a probability of success', () => {
    // The disclaimer exists precisely to deny the reading a percentage invites.
    expect(SCORE_DISCLAIMER).toContain('not a probability of success')
    const scored = scoreMentor(mentee(), mentor())
    const text = `${scored.explanation.headline} ${scored.explanation.summary}`
    expect(text.toLowerCase()).not.toContain('likely')
    expect(text.toLowerCase()).not.toContain('chance of')
    expect(text.toLowerCase()).not.toContain('success rate')
  })

  it('explains with the real factors and lists what could not be assessed', () => {
    const scored = scoreMentor(mentee(), mentor())
    // The skill overlap is real, so it appears in the summary.
    expect(scored.explanation.summary).toContain('Databases')

    const thin = scoreMentor(mentee(), mentor({ expertise: [] }))
    expect(thin.missing).toContain(FACTOR_LABELS.expertise)
    expect(thin.explanation.caveats.join(' ')).toContain('no data')
  })

  it('flags an example profile with no account in the caveats', () => {
    const scored = scoreMentor(mentee(), mentor({ account: false }))
    expect(scored.explanation.caveats.join(' ')).toContain('no account attached')
  })
})

describe('ranking', () => {
  it('orders by score and breaks ties on id, so the list never reshuffles', () => {
    const candidates = [
      mentor({ id: 'm-02', expertise: [], careers: ['research'], mentorGoals: [] }),
      mentor({ id: 'm-01' }),
      mentor({ id: 'm-03' }),
    ]
    const first = rankMentors(mentee(), candidates, noContext)
    const second = rankMentors(mentee(), [...candidates].reverse(), noContext)
    expect(first.matches.map((m) => m.mentor.id)).toEqual(second.matches.map((m) => m.mentor.id))
    expect(first.matches.map((m) => m.rank)).toEqual([1, 2, 3])
  })

  it('counts the excluded instead of silently dropping them', () => {
    const run = rankMentors(
      mentee({ availability: ['Tue'] }),
      [
        mentor({ id: 'm-01' }), // Tue & Thu: shares Tue, eligible
        mentor({ id: 'm-02', availability: ['Fri'] }), // no shared day
        mentor({ id: 'm-03', active: false }), // inactive
        mentor({ id: 'm-04', ready: false }), // incomplete profile
        mentor({ id: 'm-05' }), // already has a request with this student
      ],
      { excludedMentorIds: new Set(['m-05']) },
    )
    expect(run.matches.map((m) => m.mentor.id)).toEqual(['m-01'])
    expect(run.excluded.no_shared_availability).toBe(1)
    expect(run.excluded.inactive).toBe(1)
    expect(run.excluded.incomplete_profile).toBe(1)
    expect(run.excluded.already_requested).toBe(1)
  })

  it('returns an empty run rather than throwing when there is nothing to rank', () => {
    const run = rankMentors(mentee(), [], noContext)
    expect(run.matches).toEqual([])
    expect(run.excluded).toEqual({})
  })
})

describe('stage A: verification gates', () => {
  it('excludes a rejected or suspended mentor even when verification does not gate matching', () => {
    expect(eligibility(mentee(), mentor({ verification: 'rejected' }), noContext)).toEqual({
      eligible: false,
      reason: 'verification_rejected',
    })
    expect(eligibility(mentee(), mentor({ verification: 'suspended' }), noContext)).toEqual({
      eligible: false,
      reason: 'verification_suspended',
    })
  })

  it('does not treat "no evidence reviewed yet" as a negative finding by default', () => {
    expect(eligibility(mentee(), mentor({ verification: 'unverified' }), noContext).eligible).toBe(true)
    expect(eligibility(mentee(), mentor({ verification: 'pending' }), noContext).eligible).toBe(true)
  })

  it('requires a verified mentor when the deployment asks for it', () => {
    const gated = { ...noContext, verificationRequired: true }
    expect(eligibility(mentee(), mentor({ verification: 'unverified' }), gated)).toEqual({
      eligible: false,
      reason: 'verification_required',
    })
    expect(eligibility(mentee(), mentor({ verification: 'pending' }), gated).eligible).toBe(false)
    expect(eligibility(mentee(), mentor({ verification: 'verified' }), gated).eligible).toBe(true)
  })

  it('still excludes a suspended mentor under a gated deployment', () => {
    const gated = { ...noContext, verificationRequired: true }
    expect(eligibility(mentee(), mentor({ verification: 'suspended' }), gated).reason).toBe('verification_suspended')
  })
})
