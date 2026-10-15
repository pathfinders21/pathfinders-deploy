import { describe, expect, it } from 'vitest'
import { StubDb, asD1 } from './test-db'
import {
  VERIFICATION_COPY,
  decideVerification,
  isModerator,
  moderatorSubs,
  normaliseLink,
  pendingVerifications,
  submitVerification,
  verificationStatus,
  verificationStatusesFor,
  verificationSummary,
} from './verification'
import type { Profile } from './profile'

const profile = (over: Partial<Profile> = {}): Profile => ({
  userId: 'mentor-1',
  role: 'mentor',
  displayName: 'A Mentor',
  email: 'm@example.com',
  education: { institution: '', program: 'Computer Science', year: 'Final year' },
  interests: [],
  goalsText: '',
  skillsHave: [],
  skillsWant: [],
  industries: [],
  learningPrefs: [],
  hoursPerWeek: '',
  mentoringStyle: '',
  formatPref: '',
  constraints: '',
  projectText: '',
  bio: '',
  expertise: ['Databases'],
  mentorGoals: [],
  careers: [],
  availability: ['Tue'],
  active: true,
  completion: 80,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
  ...over,
})

const env = { MODERATOR_SUBS: 'mod-1, mod-2' }

describe('verification: identity is not verification', () => {
  it('starts unverified, with copy that does not overclaim', async () => {
    const db = new StubDb()
    const summary = await verificationSummary(env, asD1(db), 'mentor-1')
    expect(summary.status).toBe('unverified')
    expect(summary.latest).toBeNull()
    expect(summary.canSubmit).toBe(true)
    expect(VERIFICATION_COPY.verified.detail).toContain('not an academic affiliation')
  })

  it('refuses a mentee, validated on the server side role', async () => {
    const db = new StubDb()
    await expect(
      submitVerification(env, asD1(db), 'mentee-1', profile({ role: 'mentee' }), { statement: 'x'.repeat(60) }),
    ).rejects.toThrow(/Only a mentor account/)
  })

  it('requires a real statement length', async () => {
    const db = new StubDb()
    await expect(
      submitVerification(env, asD1(db), 'mentor-1', profile(), { statement: 'too short' }),
    ).rejects.toThrow(/at least/)
  })

  it('rejects a non-public link scheme and accepts a bare host', () => {
    expect(normaliseLink('javascript:alert(1)')).toBeNull()
    expect(normaliseLink('not a url')).toBeNull()
    expect(normaliseLink('github.com/me')).toBe('https://github.com/me')
    expect(normaliseLink('https://example.org/p')).toBe('https://example.org/p')
  })

  it('rejects a javascript: link inside a submission', async () => {
    const db = new StubDb()
    await expect(
      submitVerification(env, asD1(db), 'mentor-1', profile(), {
        statement: 'x'.repeat(60),
        links: ['javascript:alert(1)'],
      }),
    ).rejects.toThrow(/not a usable public link/)
  })

  it('records a pending submission and blocks a second one while pending', async () => {
    const db = new StubDb()
    const first = await submitVerification(env, asD1(db), 'mentor-1', profile(), {
      kind: 'project',
      statement: 'x'.repeat(60),
      links: ['github.com/me'],
    })
    expect(first.status).toBe('pending')
    expect(first.latest?.links).toEqual(['https://github.com/me'])
    expect(first.canSubmit).toBe(false)

    await expect(
      submitVerification(env, asD1(db), 'mentor-1', profile(), { statement: 'y'.repeat(60) }),
    ).rejects.toThrow(/waiting for review/)
  })

  it('only a pending row can be decided, and only once', async () => {
    const db = new StubDb()
    const summary = await submitVerification(env, asD1(db), 'mentor-1', profile(), { statement: 'x'.repeat(60) })
    const id = summary.latest!.id

    const decided = await decideVerification(asD1(db), id, 'mod-1', 'verified', 'looks good')
    expect(decided.status).toBe('verified')
    expect(await verificationStatus(asD1(db), 'mentor-1')).toBe('verified')

    await expect(decideVerification(asD1(db), id, 'mod-2', 'rejected')).rejects.toThrow(/already verified/)
  })

  it('refuses an unknown decision value', async () => {
    const db = new StubDb()
    const summary = await submitVerification(env, asD1(db), 'mentor-1', profile(), { statement: 'x'.repeat(60) })
    await expect(decideVerification(asD1(db), summary.latest!.id, 'mod-1', 'approved')).rejects.toThrow(/decision must be one of/)
  })

  it('a suspended mentor cannot resubmit, and a rejected one can', async () => {
    const db = new StubDb()
    const s1 = await submitVerification(env, asD1(db), 'mentor-1', profile(), { statement: 'x'.repeat(60) })
    await decideVerification(asD1(db), s1.latest!.id, 'mod-1', 'rejected', 'no evidence')
    const again = await submitVerification(env, asD1(db), 'mentor-1', profile(), { statement: 'z'.repeat(60) })
    expect(again.status).toBe('pending')

    await decideVerification(asD1(db), again.latest!.id, 'mod-1', 'suspended', 'abuse')
    await expect(
      submitVerification(env, asD1(db), 'mentor-1', profile(), { statement: 'q'.repeat(60) }),
    ).rejects.toThrow(/suspended/)
  })

  it('the review queue lists pending only, with the applicant name', async () => {
    const db = new StubDb()
    db.profiles.push({ user_id: 'mentor-1', display_name: 'A Mentor' })
    await submitVerification(env, asD1(db), 'mentor-1', profile(), { statement: 'x'.repeat(60) })
    const queue = await pendingVerifications(asD1(db))
    expect(queue).toHaveLength(1)
    expect(queue[0].displayName).toBe('A Mentor')
  })

  it('reads the moderator allowlist from configuration only', () => {
    expect(moderatorSubs({ MODERATOR_SUBS: ' a , b ,, ' })).toEqual(['a', 'b'])
    expect(moderatorSubs({})).toEqual([])
    expect(isModerator(env, 'mod-1')).toBe(true)
    expect(isModerator(env, 'mentor-1')).toBe(false)
    expect(isModerator({}, 'mod-1')).toBe(false)
  })

  it('bulk status lookup returns the latest row per user', async () => {
    const db = new StubDb()
    const s = await submitVerification(env, asD1(db), 'mentor-1', profile(), { statement: 'x'.repeat(60) })
    await decideVerification(asD1(db), s.latest!.id, 'mod-1', 'verified')
    const map = await verificationStatusesFor(asD1(db), ['mentor-1', 'mentor-2'])
    expect(map.get('mentor-1')).toBe('verified')
    expect(map.has('mentor-2')).toBe(false)
  })
})
