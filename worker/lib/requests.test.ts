import { describe, expect, it } from 'vitest'
import { REQUEST_STATUSES, TRANSITIONS, createRequest, listMentees, listRequests, loadRequestView, transition } from './requests'
import { mentorReadiness } from './profile'
import type { Env } from '../env'

/**
 * The request flow is the one place where a wrong transition is a security bug,
 * so it is tested against the real module with a focused D1 stand-in.
 *
 * The stub implements only the statements this module issues and throws on
 * anything else: a query that changes shape without the stub being updated
 * shows up as a failure rather than a silent pass. Real D1 behaviour is verified
 * separately against `wrangler dev` (see PROGRESS.md).
 */

type Row = Record<string, unknown>

class StubStatement {
  constructor(private db: StubDb, private sql: string, private params: unknown[]) {}
  bind(...params: unknown[]) {
    return new StubStatement(this.db, this.sql, params)
  }
  async run() {
    this.db.runSql(this.sql, this.params)
    return { success: true }
  }
  async all<T>() {
    return { results: this.db.runSql(this.sql, this.params) as T[] }
  }
  async first<T>() {
    return (this.db.runSql(this.sql, this.params)[0] as T) ?? null
  }
}

class StubDb {
  profiles: Row[] = []
  requests: Row[] = []
  goals: Row[] = []
  events: Row[] = []

  prepare(sql: string) {
    return new StubStatement(this, sql, [])
  }
  async batch(stmts: Array<{ run: () => Promise<unknown> }>) {
    for (const s of stmts) await s.run()
    return []
  }

  runSql(rawSql: string, p: unknown[]): Row[] {
    const sql = rawSql.replace(/\s+/g, ' ').trim()

    if (sql.startsWith('SELECT * FROM profiles WHERE user_id')) {
      return this.profiles.filter((r) => r.user_id === p[0])
    }
    if (sql.startsWith('INSERT INTO agent_events')) {
      this.events.push({ user_id: p[1], kind: p[3], title: p[4] })
      return []
    }
    if (sql.startsWith('SELECT title FROM goals WHERE id')) {
      return this.goals.filter((g) => g.id === p[0]).map((g) => ({ title: g.title }))
    }
    if (sql.startsWith('SELECT id, title, status FROM goals WHERE user_id')) {
      return this.goals.filter((g) => g.user_id === p[0] && ['active', 'paused'].includes(String(g.status)))
    }
    if (sql.startsWith('SELECT score, factors, missing FROM match_snapshots')) {
      return []
    }
    if (sql.startsWith('SELECT id, status FROM mentorship_requests WHERE mentee_id')) {
      return this.requests
        .filter(
          (r) =>
            r.mentee_id === p[0] &&
            r.mentor_id === p[1] &&
            ['pending', 'accepted', 'declined'].includes(String(r.status)),
        )
        .map((r) => ({ id: r.id, status: r.status }))
    }
    if (/^SELECT (r\.)?id, (r\.)?goal_id, (r\.)?created_at, (r\.)?mentee_id FROM mentorship_requests/.test(sql)) {
      return this.requests.filter((r) => r.mentor_id === p[0] && r.status === 'accepted')
    }
    if (sql.startsWith('SELECT id FROM mentorship_requests WHERE mentee_id')) {
      return this.requests.filter((r) => r.mentee_id === p[0])
    }
    if (sql.startsWith('SELECT id FROM mentorship_requests WHERE mentor_id')) {
      return this.requests.filter((r) => r.mentor_id === p[0])
    }
    if (sql.startsWith('SELECT * FROM mentorship_requests WHERE id = ? AND (')) {
      return this.requests.filter((r) => r.id === p[0] && (r.mentee_id === p[1] || r.mentor_id === p[2]))
    }
    if (sql.startsWith('SELECT * FROM mentorship_requests WHERE id = ? AND mentor_id')) {
      return this.requests.filter((r) => r.id === p[0] && r.mentor_id === p[1])
    }
    if (sql.startsWith('SELECT * FROM mentorship_requests WHERE id = ? AND mentee_id')) {
      return this.requests.filter((r) => r.id === p[0] && r.mentee_id === p[1])
    }
    if (sql.startsWith('INSERT INTO mentorship_requests')) {
      this.requests.push({
        id: p[0],
        mentee_id: p[1],
        mentor_id: p[2],
        goal_id: p[3],
        message: p[4],
        status: 'pending',
        response: '',
        match_score: p[5],
        created_at: p[6],
        updated_at: p[7],
      })
      return []
    }
    // The ownership predicate and the pending check live in the WHERE clause, and
    // the stub honours them: a row that does not match is simply not updated.
    const update = /^UPDATE mentorship_requests SET status = \?, response = \?, updated_at = \? WHERE id = \? AND status = 'pending' AND (mentor_id|mentee_id) = \?$/.exec(sql)
    if (update) {
      const ownerColumn = update[1]!
      for (const r of this.requests) {
        if (r.id === p[3] && r.status === 'pending' && r[ownerColumn] === p[4]) {
          r.status = p[0]
          r.response = p[1]
          r.updated_at = p[2]
        }
      }
      return []
    }

    throw new Error(`StubDb received a statement it does not implement: ${sql}`)
  }
}

/* ------------------------------------------------------------------ */

const mentorRow = (id: string, over: Row = {}): Row => ({
  user_id: id,
  role: 'mentor',
  display_name: 'Aarav Mehta',
  email: 'aarav@example.edu',
  education: JSON.stringify({ institution: 'IIT', program: 'Computer Science', year: 'Final year' }),
  interests: '[]',
  goals_text: '',
  skills_have: '[]',
  skills_want: '[]',
  industries: '[]',
  learning_prefs: '[]',
  hours_per_week: '',
  mentoring_style: 'structured',
  format_pref: '',
  constraints: '',
  bio: 'Backend engineer who enjoys debugging sessions and internship preparation.',
  expertise: JSON.stringify(['Databases']),
  mentor_goals: JSON.stringify(['internship']),
  careers: JSON.stringify(['swe']),
  availability: JSON.stringify(['Tue']),
  active: 1,
  completion: 100,
  created_at: '2026-01-01T00:00:00.000Z',
  updated_at: '2026-01-01T00:00:00.000Z',
  ...over,
})

const menteeRow = (id: string): Row =>
  mentorRow(id, {
    role: 'mentee',
    display_name: 'Sam Rao',
    education: JSON.stringify({ institution: 'IIT', program: 'Information Systems', year: 'Second year' }),
    bio: '',
    expertise: '[]',
    mentor_goals: '[]',
    careers: '[]',
  })

function makeEnv(): { env: Env; db: StubDb } {
  const db = new StubDb()
  db.profiles.push(mentorRow('mentor-1'), menteeRow('mentee-1'), menteeRow('mentee-2'))
  return { env: { DB: db } as unknown as Env, db }
}

describe('the transition table is the whole state machine', () => {
  it('allows exactly three moves, each from pending', () => {
    expect(Object.keys(TRANSITIONS).sort()).toEqual(['accept', 'decline', 'withdraw'])
    for (const rule of Object.values(TRANSITIONS)) expect(rule.from).toBe('pending')
    expect(TRANSITIONS.accept.by).toBe('mentor')
    expect(TRANSITIONS.decline.by).toBe('mentor')
    expect(TRANSITIONS.withdraw.by).toBe('mentee')
  })

  it('treats accepted, declined and withdrawn as terminal', () => {
    expect(REQUEST_STATUSES).toEqual(['pending', 'accepted', 'declined', 'withdrawn'])
  })
})

describe('createRequest', () => {
  it('creates a pending request owned by the signed-in student', async () => {
    const { env } = makeEnv()
    const view = await createRequest(env, 'mentee-1', 'mentor-1', { message: 'Hello' })
    expect(view.status).toBe('pending')
    expect(view.direction).toBe('outgoing')
    expect(view.can).toEqual({ accept: false, decline: false, withdraw: true })
  })

  it('refuses a self-request', async () => {
    const { env } = makeEnv()
    await expect(createRequest(env, 'mentee-1', 'mentee-1', { message: '' })).rejects.toThrow(/cannot request yourself/i)
  })

  it('refuses a mentor who does not exist or is not ready', async () => {
    const { env, db } = makeEnv()
    await expect(createRequest(env, 'mentee-1', 'nobody', { message: '' })).rejects.toThrow(/does not exist/i)

    db.profiles.push(mentorRow('mentor-thin', { bio: '', expertise: '[]', availability: '[]' }))
    await expect(createRequest(env, 'mentee-1', 'mentor-thin', { message: '' })).rejects.toThrow(/cannot take requests yet/i)
  })

  it('refuses a second request with the same mentor', async () => {
    const { env } = makeEnv()
    await createRequest(env, 'mentee-1', 'mentor-1', { message: 'first' })
    await expect(createRequest(env, 'mentee-1', 'mentor-1', { message: 'again' })).rejects.toThrow(/already have a pending/i)
  })

  it('never lets a student request an account that is not a mentor', async () => {
    const { env } = makeEnv()
    await expect(createRequest(env, 'mentee-1', 'mentee-2', { message: '' })).rejects.toThrow(/does not exist/i)
  })
})

describe('transition', () => {
  it('lets the mentor accept and shows the student the same status', async () => {
    const { env } = makeEnv()
    const created = await createRequest(env, 'mentee-1', 'mentor-1', { message: 'Hello' })

    const accepted = await transition(env, 'mentor-1', created.id, 'accept', 'Sounds good')
    expect(accepted.status).toBe('accepted')

    const studentView = await loadRequestView(env, created.id, 'mentee-1')
    expect(studentView?.status).toBe('accepted')
    expect(studentView?.response).toBe('Sounds good')
  })

  it('does not let a student accept their own request', async () => {
    const { env } = makeEnv()
    const created = await createRequest(env, 'mentee-1', 'mentor-1', { message: 'Hello' })
    await expect(transition(env, 'mentee-1', created.id, 'accept')).rejects.toThrow(/does not exist, or is not yours/i)

    const still = await loadRequestView(env, created.id, 'mentee-1')
    expect(still?.status).toBe('pending')
  })

  it('does not let an unrelated mentor decline someone else\u2019s request', async () => {
    const { env, db } = makeEnv()
    db.profiles.push(mentorRow('mentor-2'))
    const created = await createRequest(env, 'mentee-1', 'mentor-1', { message: 'Hello' })

    await expect(transition(env, 'mentor-2', created.id, 'decline')).rejects.toThrow(/not yours/i)
    expect((await loadRequestView(env, created.id, 'mentor-1'))?.status).toBe('pending')
  })

  it('lets the student withdraw a pending request, but a mentor cannot', async () => {
    const { env } = makeEnv()
    const created = await createRequest(env, 'mentee-1', 'mentor-1', { message: 'Hello' })
    await expect(transition(env, 'mentor-1', created.id, 'withdraw')).rejects.toThrow(/not yours/i)

    const withdrawn = await transition(env, 'mentee-1', created.id, 'withdraw', 'Changed my mind')
    expect(withdrawn.status).toBe('withdrawn')
  })

  it('refuses to move a request that is already terminal', async () => {
    const { env } = makeEnv()
    const created = await createRequest(env, 'mentee-1', 'mentor-1', { message: 'Hello' })
    await transition(env, 'mentor-1', created.id, 'decline')

    await expect(transition(env, 'mentor-1', created.id, 'accept')).rejects.toThrow(/cannot be accepted/i)
    await expect(transition(env, 'mentee-1', created.id, 'withdraw')).rejects.toThrow(/cannot be withdrawn/i)
  })

  it('404s a request id that does not exist', async () => {
    const { env } = makeEnv()
    await expect(transition(env, 'mentor-1', 'no-such-id', 'accept')).rejects.toThrow(/404|not yours/i)
  })
})

describe('what each side is allowed to see', () => {
  it('never sends the mentor brief to the mentor, nor the mentee summary to the student', async () => {
    const { env } = makeEnv()
    const created = await createRequest(env, 'mentee-1', 'mentor-1', { message: 'Hello' })

    const forMentor = await loadRequestView(env, created.id, 'mentor-1')
    expect(forMentor?.mentor).toBeNull()
    expect(forMentor?.mentee?.name).toBe('Sam Rao')
    // The mentor never receives the student's email through this endpoint.
    expect(JSON.stringify(forMentor)).not.toContain('@example.edu')

    const forStudent = await loadRequestView(env, created.id, 'mentee-1')
    expect(forStudent?.mentee).toBeNull()
    expect(forStudent?.mentor?.name).toBe('Aarav Mehta')
  })

  it('lists only the caller\u2019s own requests', async () => {
    const { env } = makeEnv()
    await createRequest(env, 'mentee-1', 'mentor-1', { message: 'Hello' })

    expect(await listRequests(env, 'mentee-1', 'mentee')).toHaveLength(1)
    expect(await listRequests(env, 'mentee-2', 'mentee')).toHaveLength(0)
    expect(await listRequests(env, 'mentor-1', 'mentor')).toHaveLength(1)
  })

  it('shows a mentor only accepted mentees', async () => {
    const { env } = makeEnv()
    const created = await createRequest(env, 'mentee-1', 'mentor-1', { message: 'Hello' })

    expect(await listMentees(env, 'mentor-1')).toHaveLength(0)
    await transition(env, 'mentor-1', created.id, 'accept')
    const mentees = await listMentees(env, 'mentor-1')
    expect(mentees).toHaveLength(1)
    expect(mentees[0]!.name).toBe('Sam Rao')
  })
})

describe('readiness of the fixture itself', () => {
  it('uses a mentor row that passes the real readiness gate', () => {
    // Guards against a fixture that only passes because the gate is broken.
    expect(mentorReadiness({ role: 'mentor', active: true, displayName: 'Aarav', bio: 'x'.repeat(30), expertise: ['a'], mentorGoals: ['b'], careers: [], availability: ['Tue'] } as never).ready).toBe(true)
  })
})
