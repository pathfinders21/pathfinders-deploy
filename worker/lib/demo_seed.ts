/**
 * The demo scenario, seeded into a signed-in account on purpose.
 *
 * A judge cannot evaluate gap analysis, roadmap generation or the adaptation agent on an
 * empty account, and the agent's adaptation trigger is an *overdue milestone*, which only
 * exists once a roadmap has real dates. So this module writes a labeled scenario: a
 * student profile, one goal sized for six hours a week, and a roadmap whose second
 * milestone is deliberately past its date.
 *
 * Two rules it keeps:
 *  1. It is opt-in and labeled. The account is marked `demo_seeded_at`, the UI shows a
 *     "seeded demo scenario" chip, and an event recording the seed is written to the
 *     agent history, so seeded data is never mistaken for the person's own.
 *  2. It is additive and idempotent. It fills fields rather than overwriting what is
 *     already there, it never deletes a roadmap, and a second call reports that the
 *     scenario is already seeded instead of duplicating it.
 *
 * It only runs when `AI_DEMO_MODE` is on, which is the same switch that serves the
 * deterministic engine. A deployment with a provider key returns 403 from the route.
 */

export const DEMO_SEED_ENV = 'AI_DEMO_MODE'

const newId = () => crypto.randomUUID()

export type DemoMilestone = {
  title: string
  detail: string
  why: string
  estimate: string
  /** Days from the moment of seeding. Negative means already overdue. */
  dueInDays: number
  tasks: Array<{ title: string; detail: string; estimate: string; dueInDays: number }>
}

/** The scenario itself, as data, so the tests read the same thing the seed writes. */
export const DEMO_GOAL = {
  title: 'Move from frontend work into a backend engineering role',
  rationale:
    'You wrote that you already ship React features and want to own services. The plan below assumes six hours a week, so it is sized in weeks rather than days.',
}

export const DEMO_PROFILE_FIELDS = {
  goalsText: DEMO_GOAL.title,
  hoursPerWeek: '6',
  projectText:
    'A typed React dashboard with a Node API and Postgres behind it. I wrote the schema and the migrations myself.',
  interests: ['Distributed systems', 'Databases'],
  industries: ['Fintech'],
  skillsHave: ['TypeScript', 'React', 'SQL'],
  skillsWant: ['Kafka', 'Database indexing', 'System design'],
  education: { institution: 'State University', program: 'Computer Science', year: 'Year 3' },
  learningPrefs: ['Project first', 'Written feedback'],
}

export const DEMO_MILESTONES: DemoMilestone[] = [
  {
    title: 'Own one service end to end',
    detail: 'Take a small backend service from endpoint to deployment without help.',
    why: 'Backend interviews and code review both start from a service you can explain line by line.',
    estimate: 'about 3 weeks',
    dueInDays: 21,
    tasks: [
      { title: 'Write the service skeleton and one real endpoint', detail: 'Routing, validation, and an error shape.', estimate: '4h', dueInDays: 7 },
      { title: 'Add migrations and a seeded local database', detail: '', estimate: '3h', dueInDays: 12 },
    ],
  },
  {
    title: 'Make a slow query fast, with measurements',
    detail: 'Find a query that is slow on real data volume, index it, and record before and after timings.',
    why: 'Database indexing is the gap the assessment flags as high priority, and numbers are what make the fix credible.',
    estimate: 'about 2 weeks',
    // Deliberately in the past: this is the adaptation trigger the agent reacts to.
    dueInDays: -2,
    tasks: [
      { title: 'Generate 100k rows and time the slowest query', detail: '', estimate: '3h', dueInDays: -4 },
      { title: 'Add the index and measure again', detail: 'Record both timings in your own notes.', estimate: '2h', dueInDays: -1 },
    ],
  },
  {
    title: 'Design a system on paper, then defend it',
    detail: 'Write a two page design for a payments style flow and list the three tradeoffs you accepted.',
    why: 'This is the artifact a mentor can review, and the shape of a system design interview.',
    estimate: 'about 2 weeks',
    dueInDays: 35,
    tasks: [
      { title: 'Draft the design and the failure modes', detail: '', estimate: '4h', dueInDays: 30 },
      { title: 'Bring it to a session for review', detail: 'Request mentorship from a match you agree with.', estimate: '1h', dueInDays: 34 },
    ],
  },
]

export type SeedReport = {
  ok: true
  alreadySeeded: boolean
  seeded: string[]
  skipped: string[]
  note: string
  demoSeededAt: string | null
}

type GoalRow = { id: string }

/**
 * Writes the scenario for one user.
 *
 * `DB` is passed separately from `env` so the tests can drive it with an in-memory
 * stand-in without constructing a full Worker environment.
 */
export async function seedDemoScenario(db: D1Database, userId: string, now = new Date()): Promise<SeedReport> {
  const at = now.toISOString()
  const seeded: string[] = []
  const skipped: string[] = []

  const existing = await db
    .prepare('SELECT demo_seeded_at FROM profiles WHERE user_id = ?')
    .bind(userId)
    .first<{ demo_seeded_at: string | null } | null>()

  const profile = await db
    .prepare(
      'SELECT goals_text, hours_per_week, project_text, education, interests, industries, skills_have, skills_want FROM profiles WHERE user_id = ?',
    )
    .bind(userId)
    .first<Record<string, string> | null>()

  if (!profile) {
    return {
      ok: true,
      alreadySeeded: false,
      seeded,
      skipped: ['profile'],
      note: 'No profile row exists for this account yet, so nothing was seeded. Complete onboarding first.',
      demoSeededAt: null,
    }
  }

  // Fields are filled, never overwritten: a person who already wrote their own skills
  // keeps them, and the scenario adds what is missing.
  const merged = {
    goals_text: profile.goals_text || DEMO_PROFILE_FIELDS.goalsText,
    hours_per_week: profile.hours_per_week || DEMO_PROFILE_FIELDS.hoursPerWeek,
    project_text: profile.project_text || DEMO_PROFILE_FIELDS.projectText,
    education: profile.education && profile.education !== '{}' ? profile.education : JSON.stringify(DEMO_PROFILE_FIELDS.education),
    interests: profile.interests && profile.interests !== '[]' ? profile.interests : JSON.stringify(DEMO_PROFILE_FIELDS.interests),
    industries: profile.industries && profile.industries !== '[]' ? profile.industries : JSON.stringify(DEMO_PROFILE_FIELDS.industries),
    skills_have: profile.skills_have && profile.skills_have !== '[]' ? profile.skills_have : JSON.stringify(DEMO_PROFILE_FIELDS.skillsHave),
    skills_want: profile.skills_want && profile.skills_want !== '[]' ? profile.skills_want : JSON.stringify(DEMO_PROFILE_FIELDS.skillsWant),
  }

  await db
    .prepare(
      `UPDATE profiles SET
         goals_text = ?, hours_per_week = ?, project_text = ?, education = ?, interests = ?,
         industries = ?, skills_have = ?, skills_want = ?, demo_seeded_at = ?, updated_at = ?
       WHERE user_id = ?`,
    )
    .bind(
      merged.goals_text,
      merged.hours_per_week,
      merged.project_text,
      merged.education,
      merged.interests,
      merged.industries,
      merged.skills_have,
      merged.skills_want,
      existing?.demo_seeded_at ?? at,
      at,
      userId,
    )
    .run()
  seeded.push('the profile fields the scenario needs')

  if (existing?.demo_seeded_at) {
    return {
      ok: true,
      alreadySeeded: true,
      seeded,
      skipped: ['goal', 'roadmap', 'milestones'],
      note: 'The demo scenario was already seeded on this account, so no second goal or roadmap was created.',
      demoSeededAt: existing.demo_seeded_at,
    }
  }

  const goal = await db
    .prepare('SELECT id FROM goals WHERE user_id = ? AND title = ?')
    .bind(userId, DEMO_GOAL.title)
    .first<GoalRow | null>()
  const goalId = goal?.id ?? newId()
  if (goal) {
    skipped.push('goal')
  } else {
    await db
      .prepare('INSERT INTO goals (id, user_id, title, rationale, source, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
      .bind(goalId, userId, DEMO_GOAL.title, DEMO_GOAL.rationale, 'user', 'active', at, at)
      .run()
    seeded.push('one goal')
  }

  const roadmap = await db
    .prepare('SELECT id FROM roadmaps WHERE user_id = ? AND goal_id = ?')
    .bind(userId, goalId)
    .first<{ id: string } | null>()
  const roadmapId = roadmap?.id ?? newId()
  if (roadmap) {
    skipped.push('roadmap')
  } else {
    await db
      .prepare('INSERT INTO roadmaps (id, user_id, goal_id, title, rationale, status, revision, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)')
      .bind(
        roadmapId,
        userId,
        goalId,
        'Backend ownership, six hours a week',
        'Three phases, ordered so each one produces something you can show.',
        'active',
        1,
        at,
        at,
      )
      .run()
    seeded.push('one roadmap with three milestones')
  }

  const existingSteps = await db
    .prepare('SELECT COUNT(*) AS n FROM roadmap_steps WHERE roadmap_id = ?')
    .bind(roadmapId)
    .first<{ n: number }>()

  if ((existingSteps?.n ?? 0) > 0) {
    skipped.push('milestones')
  } else {
    let position = 0
    for (const milestone of DEMO_MILESTONES) {
      const milestoneId = newId()
      await db
        .prepare(
          `INSERT INTO roadmap_steps
             (id, roadmap_id, parent_id, position, title, detail, status, ai_generated, source, kind, origin, estimate, deadline, created_at, updated_at, last_touched_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .bind(
          milestoneId,
          roadmapId,
          null,
          position++,
          milestone.title,
          `${milestone.detail} Why it matters: ${milestone.why}`,
          'pending',
          0,
          'seed',
          'milestone',
          'seed',
          milestone.estimate,
          isoDaysFrom(now, milestone.dueInDays),
          at,
          at,
          at,
        )
        .run()

      for (const task of milestone.tasks) {
        await db
          .prepare(
            `INSERT INTO roadmap_steps
               (id, roadmap_id, parent_id, position, title, detail, status, ai_generated, source, kind, origin, estimate, deadline, created_at, updated_at, last_touched_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          )
          .bind(
            taskId(milestone.title, task.title),
            roadmapId,
            milestoneId,
            position++,
            task.title,
            task.detail,
            'pending',
            0,
            'seed',
            'task',
            'seed',
            task.estimate,
            isoDaysFrom(now, task.dueInDays),
            at,
            at,
            at,
          )
          .run()
      }
    }
  }

  await db
    .prepare('INSERT INTO agent_events (id, user_id, created_at, kind, title, detail) VALUES (?, ?, ?, ?, ?, ?)')
    .bind(
      newId(),
      userId,
      at,
      'demo_seed',
      'Demo scenario seeded',
      'A labeled sample profile, goal and roadmap were added so the agent has real state to react to. One milestone is deliberately overdue. Everything introduced by this is marked as seeded.',
    )
    .run()
  seeded.push('a labeled history entry')

  return {
    ok: true,
    alreadySeeded: false,
    seeded,
    skipped,
    note: 'Seeded demo data. Fields you had already filled were left alone, and one milestone is deliberately overdue so the adaptation agent has something real to react to.',
    demoSeededAt: at,
  }
}

const isoDaysFrom = (now: Date, days: number) => new Date(now.getTime() + days * 86_400_000).toISOString()

/** Stable task ids, so re-running cannot create twins with new ids. */
function taskId(milestoneTitle: string, taskTitle: string): string {
  const slug = `${milestoneTitle}-${taskTitle}`
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')
    .slice(0, 48)
  return `ms-task-${slug}`
}
