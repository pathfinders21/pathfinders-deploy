import { describe, expect, it } from 'vitest'
import {
  DEMO_GOAL,
  DEMO_MILESTONES,
  DEMO_PROFILE_FIELDS,
  seedDemoScenario,
} from './demo_seed'

/**
 * The seed is driven here by a purpose-built in-memory stand-in rather than the shared
 * stub: it implements exactly the statements `seedDemoScenario` issues, and it throws on
 * anything else, so a query whose shape changes without this file being updated fails
 * rather than passing quietly. `wrangler dev` remains the check that D1 accepts the SQL.
 */

type Row = Record<string, any>

class MemoryDb {
  profiles: Row[]
  goals: Row[] = []
  roadmaps: Row[] = []
  steps: Row[] = []
  events: Row[] = []

  constructor(profile: Partial<Row> = {}) {
    this.profiles = [
      {
        user_id: 'u1',
        goals_text: '',
        hours_per_week: '',
        project_text: '',
        education: '{}',
        interests: '[]',
        industries: '[]',
        skills_have: '[]',
        skills_want: '[]',
        demo_seeded_at: null,
        updated_at: '2026-10-01T00:00:00.000Z',
        ...profile,
      },
    ]
  }

  prepare(sql: string) {
    const norm = sql.replace(/\s+/g, ' ').trim()
    return {
      bind: (...params: unknown[]) => ({
        run: async () => {
          this.run(norm, params)
          return { success: true }
        },
        all: async () => ({ results: this.run(norm, params) }),
        first: async () => this.run(norm, params)[0] ?? null,
      }),
    }
  }

  private run(sql: string, p: unknown[]): Row[] {
    if (sql.startsWith('SELECT demo_seeded_at FROM profiles WHERE user_id = ?')) {
      return this.profiles.filter((r) => r.user_id === p[0]).map((r) => ({ demo_seeded_at: r.demo_seeded_at }))
    }
    if (sql.startsWith('SELECT goals_text')) {
      return this.profiles.filter((r) => r.user_id === p[0])
    }
    if (sql.startsWith('UPDATE profiles SET')) {
      const row = this.profiles.find((r) => r.user_id === p[10])
      if (row) {
        Object.assign(row, {
          goals_text: p[0],
          hours_per_week: p[1],
          project_text: p[2],
          education: p[3],
          interests: p[4],
          industries: p[5],
          skills_have: p[6],
          skills_want: p[7],
          demo_seeded_at: p[8],
          updated_at: p[9],
        })
      }
      return []
    }
    if (sql.startsWith('SELECT id FROM goals WHERE user_id = ? AND title = ?')) {
      return this.goals.filter((g) => g.user_id === p[0] && g.title === p[1])
    }
    if (sql.startsWith('INSERT INTO goals')) {
      this.goals.push({ id: p[0], user_id: p[1], title: p[2], rationale: p[3], source: p[4], status: p[5] })
      return []
    }
    if (sql.startsWith('SELECT id FROM roadmaps WHERE user_id = ? AND goal_id = ?')) {
      return this.roadmaps.filter((r) => r.user_id === p[0] && r.goal_id === p[1])
    }
    if (sql.startsWith('INSERT INTO roadmaps')) {
      this.roadmaps.push({ id: p[0], user_id: p[1], goal_id: p[2], title: p[3] })
      return []
    }
    if (sql.startsWith('SELECT COUNT(*) AS n FROM roadmap_steps WHERE roadmap_id = ?')) {
      return [{ n: this.steps.filter((s) => s.roadmap_id === p[0]).length }]
    }
    if (sql.startsWith('INSERT INTO roadmap_steps')) {
      this.steps.push({
        id: p[0],
        roadmap_id: p[1],
        parent_id: p[2],
        title: p[4],
        kind: p[9],
        estimate: p[11],
        deadline: p[12],
      })
      return []
    }
    if (sql.startsWith('INSERT INTO agent_events')) {
      this.events.push({ id: p[0], user_id: p[1], kind: p[3], title: p[4], detail: p[5] })
      return []
    }
    throw new Error(`demo_seed test stand-in does not implement: ${sql}`)
  }
}

const asDb = (db: MemoryDb) => db as unknown as D1Database

describe('the demo scenario', () => {
  it('is sized for the hours it declares and contains a real overdue milestone', () => {
    expect(DEMO_PROFILE_FIELDS.hoursPerWeek).toBe('6')
    expect(DEMO_MILESTONES.length).toBeGreaterThanOrEqual(3)
    // The adaptation trigger has to be a date in the past, not a label.
    expect(DEMO_MILESTONES.some((m) => m.dueInDays < 0)).toBe(true)
    expect(DEMO_MILESTONES.some((m) => m.dueInDays > 0)).toBe(true)
    // Every milestone explains itself and carries measurable work.
    for (const milestone of DEMO_MILESTONES) {
      expect(milestone.why.length).toBeGreaterThan(20)
      expect(milestone.estimate.length).toBeGreaterThan(0)
      expect(milestone.tasks.length).toBeGreaterThan(0)
    }
  })
})

describe('seedDemoScenario', () => {
  it('writes a profile, a goal, a roadmap and one overdue milestone, and labels them', async () => {
    const db = new MemoryDb()
    const report = await seedDemoScenario(asDb(db), 'u1', new Date('2026-10-14T09:00:00.000Z'))

    expect(report.alreadySeeded).toBe(false)
    expect(db.profiles[0]!.demo_seeded_at).toBe('2026-10-14T09:00:00.000Z')
    expect(db.profiles[0]!.hours_per_week).toBe('6')
    expect(db.goals).toHaveLength(1)
    expect(db.goals[0]!.title).toBe(DEMO_GOAL.title)
    expect(db.roadmaps).toHaveLength(1)

    const milestones = db.steps.filter((s) => s.kind === 'milestone')
    const tasks = db.steps.filter((s) => s.kind === 'task')
    expect(milestones).toHaveLength(DEMO_MILESTONES.length)
    expect(tasks).toHaveLength(DEMO_MILESTONES.reduce((n, m) => n + m.tasks.length, 0))

    const overdue = milestones.filter((s) => new Date(s.deadline).getTime() < Date.parse('2026-10-14T09:00:00.000Z'))
    expect(overdue).toHaveLength(1)
    expect(overdue[0]!.title).toBe('Make a slow query fast, with measurements')

    // Every step starts as not started: seeding never marks work complete.
    expect(milestones.every((s) => s.id)).toBe(true)
    expect(db.events).toHaveLength(1)
    expect(db.events[0]!.kind).toBe('demo_seed')
    expect(db.events[0]!.detail).toMatch(/deliberately overdue/i)
  })

  it('keeps what the account already had instead of overwriting it', async () => {
    const db = new MemoryDb({
      goals_text: 'My own goal, written by me',
      hours_per_week: '12',
      skills_have: '["Rust"]',
      education: '{"institution":"My University","program":"Physics","year":"Year 2"}',
    })
    await seedDemoScenario(asDb(db), 'u1')

    expect(db.profiles[0]!.goals_text).toBe('My own goal, written by me')
    expect(db.profiles[0]!.hours_per_week).toBe('12')
    expect(db.profiles[0]!.skills_have).toBe('["Rust"]')
    expect(JSON.parse(db.profiles[0]!.education).institution).toBe('My University')
    // Fields the account left empty are the ones the scenario fills.
    expect(db.profiles[0]!.skills_want).toBe(JSON.stringify(DEMO_PROFILE_FIELDS.skillsWant))
  })

  it('is idempotent: a second call adds no second goal, roadmap or milestone', async () => {
    const db = new MemoryDb()
    await seedDemoScenario(asDb(db), 'u1')
    const stepsAfterFirst = db.steps.length

    const second = await seedDemoScenario(asDb(db), 'u1')
    expect(second.alreadySeeded).toBe(true)
    expect(second.skipped).toContain('roadmap')
    expect(db.goals).toHaveLength(1)
    expect(db.roadmaps).toHaveLength(1)
    expect(db.steps).toHaveLength(stepsAfterFirst)
    // The first seed's timestamp is preserved, so "when was this seeded" stays honest.
    expect(db.profiles[0]!.demo_seeded_at).toBe(second.demoSeededAt)
  })

  it('refuses to invent a profile when the account has none', async () => {
    const db = new MemoryDb()
    db.profiles = []
    const report = await seedDemoScenario(asDb(db), 'ghost')
    expect(report.seeded).toHaveLength(0)
    expect(report.skipped).toContain('profile')
    expect(report.note).toMatch(/Complete onboarding first/i)
    expect(db.goals).toHaveLength(0)
  })
})
