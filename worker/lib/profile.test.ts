import { describe, expect, it } from 'vitest'
import { computeCompletion, mentorReadiness, type Profile } from './profile'

/**
 * Completion and readiness drive what the UI claims and what matching will
 * accept, so both are computed from stored fields and tested directly.
 */

const profile = (over: Partial<Profile> = {}): Profile => ({
  userId: 'u-1',
  role: 'mentee',
  displayName: '',
  email: '',
  education: { institution: '', program: '', year: '' },
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
  expertise: [],
  mentorGoals: [],
  careers: [],
  availability: [],
  active: true,
  completion: 0,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
  ...over,
})

const fullMentor = profile({
  role: 'mentor',
  displayName: 'Aarav Mehta',
  education: { institution: 'IIT', program: 'Computer Science', year: 'Final year' },
  projectText: '',
    bio: 'Backend engineer who enjoys debugging sessions and internship preparation.',
  expertise: ['Databases'],
  mentorGoals: ['internship'],
  careers: ['swe'],
  availability: ['Tue'],
  mentoringStyle: 'structured',
})

describe('computeCompletion', () => {
  it('is zero for an empty profile and complete for a full one', () => {
    expect(computeCompletion(profile())).toBe(0)
    expect(computeCompletion(fullMentor)).toBe(100)
  })

  it('does not count a blank string as filled', () => {
    const partial = profile({ displayName: '   ', goalsText: 'x' })
    expect(computeCompletion(partial)).toBeLessThan(50)
  })

  it('weights mentors on the fields a mentor actually needs', () => {
    const mentorWithoutAvailability = { ...fullMentor, availability: [] }
    expect(computeCompletion(mentorWithoutAvailability)).toBeLessThan(100)
    // A mentee's bio is irrelevant, so it cannot move their number.
    const mentee = profile({ displayName: 'Sam', projectText: '',
    bio: '' })
    expect(computeCompletion(mentee)).toBe(computeCompletion({ ...mentee, projectText: '',
    bio: 'irrelevant' }))
  })
})

describe('mentorReadiness', () => {
  it('passes only a real, complete, active mentor profile', () => {
    expect(mentorReadiness(fullMentor)).toEqual({ ready: true, missing: [] })
  })

  it('names every unmet requirement', () => {
    const result = mentorReadiness(profile({ role: 'mentor' }))
    expect(result.ready).toBe(false)
    expect(result.missing).toEqual(
      expect.arrayContaining(['name', 'bio', 'expertise', 'focus', 'availability']),
    )
  })

  it('refuses a mentee account even with mentor-shaped fields', () => {
    const result = mentorReadiness({ ...fullMentor, role: 'mentee' })
    expect(result.ready).toBe(false)
    expect(result.missing).toContain('role')
  })

  it('refuses an inactive mentor and a too-short bio', () => {
    expect(mentorReadiness({ ...fullMentor, active: false }).missing).toContain('active')
    expect(mentorReadiness({ ...fullMentor, projectText: '',
    bio: 'short' }).missing).toContain('bio')
  })
})
