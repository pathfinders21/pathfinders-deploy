/**
 * Roadmap generation, at the boundary the brief asks about: the plan must come from the
 * student's goal and weekly hours, it must be a proposal rather than a write, and a bad or
 * missing answer must be refused rather than replaced with something plausible.
 *
 * The provider is MOCKED here (a stubbed fetch). Nothing in this file calls a real model,
 * and no test claims the model obeyed the prompt: what these pin is what the app sends and
 * what the app accepts.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AiError } from './ai/errors'
import { StubDb, asD1 } from './test-db'
import { proposeRoadmap, type Goal } from './roadmap'

let db: StubDb
let prompts: string[]
let calls: string[]

const BASE_ENV = {
  AI_API_KEY: 'test-key',
  AI_MAX_RETRIES: '1',
  AI_DEDUPE_WINDOW_MS: '0',
}

const env = (overrides: Record<string, string> = {}) => ({ ...BASE_ENV, ...overrides, DB: asD1(db) })

const GOAL: Goal = {
  id: 'g1',
  userId: 'u1',
  title: 'Move from frontend work into a backend engineering role',
  rationale: 'I already ship React features and want to own services.',
  source: 'user',
  status: 'active',
  createdAt: '2026-10-01T00:00:00.000Z',
  updatedAt: '2026-10-01T00:00:00.000Z',
}

const CONTEXT = {
  skillsHave: ['TypeScript', 'React'],
  skillsWant: ['Kafka'],
  hoursPerWeek: '6',
  interests: ['Databases'],
}

const PLAN = {
  title: 'Backend ownership, six hours a week',
  rationale: 'Ordered so each phase produces something you can show.',
  milestones: [
    {
      title: 'Own one service end to end',
      why: 'Code review starts from a service you can explain.',
      tasks: [{ title: 'Write one real endpoint', detail: 'Routing and validation.', estimate: '4h' }],
    },
    {
      title: 'Make a slow query fast',
      why: 'Indexing is the gap the assessment flags.',
      tasks: [{ title: 'Time a query, add an index, re-measure', detail: '', estimate: '3h' }],
    },
    {
      title: 'Design a system on paper',
      why: 'The artifact a mentor can review.',
      tasks: [{ title: 'Draft the design and its failure modes', detail: '', estimate: '4h' }],
    },
  ],
}

beforeEach(() => {
  db = new StubDb()
  prompts = []
  calls = []
  vi.stubGlobal('fetch', async (url: unknown, init?: RequestInit) => {
    calls.push(String(url))
    const body = init?.body ? JSON.parse(String(init.body)) : null
    const text = body?.contents?.[0]?.parts?.[0]?.text
    if (typeof text === 'string') prompts.push(text)
    return new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: JSON.stringify(PLAN) }] } }] }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    })
  })
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('the plan is generated from the goal and the hours the student entered', () => {
  it('sends the stored goal, the weekly time and their skills to the model', async () => {
    await proposeRoadmap(env(), 'u1', GOAL, CONTEXT)

    expect(prompts).toHaveLength(1)
    const prompt = prompts[0]!
    expect(prompt).toContain(`Goal: ${GOAL.title}`)
    expect(prompt).toContain('Time available: 6')
    expect(prompt).toContain('Skills they already have: TypeScript, React')
    expect(prompt).toContain('Skills they want to build: Kafka')
    // The rules the app itself states are part of the request, not left to the model.
    expect(prompt).toMatch(/Do not promise jobs, salaries/)
    expect(prompt).toMatch(/Do not repeat work implied by the skills they already have/)
  })

  it('says plainly that no time was given rather than guessing an amount', async () => {
    await proposeRoadmap(env(), 'u1', GOAL, { ...CONTEXT, hoursPerWeek: '' })
    expect(prompts[0]!).toContain('Goal: Move from frontend work')
    expect(prompts[0]!).not.toContain('Time available')
  })

  it('marks a regenerated plan as a replacement of what came before', async () => {
    await proposeRoadmap(env(), 'u1', GOAL, CONTEXT, { regenerate: true })
    expect(prompts[0]!).toMatch(/This replaces earlier steps/)
  })

  it('returns a plan but writes no rows: generation is a proposal', async () => {
    const result = await proposeRoadmap(env(), 'u1', GOAL, CONTEXT)

    expect(result.engine).toBe('gemini')
    expect(result.plan.milestones).toHaveLength(PLAN.milestones.length)
    expect(result.plan.milestones[0]!.tasks[0]!.title).toBe('Write one real endpoint')
    // Nothing was persisted, not even a roadmap shell, so the student has to confirm.
    expect(db.roadmaps).toHaveLength(0)
    expect(db.steps).toHaveLength(0)
    expect(db.actions).toHaveLength(0)
  })

  it('labels the deterministic plan as demo instead of passing it off as the model', async () => {
    vi.stubGlobal('fetch', async () => new Response('upstream is down', { status: 500 }))
    const result = await proposeRoadmap(env({ AI_DEMO_MODE: 'true' }), 'u1', GOAL, CONTEXT)

    expect(result.engine).toBe('demo')
    expect(result.plan.milestones.length).toBeGreaterThan(0)
  })
})

describe('a bad answer is refused rather than papered over', () => {
  it('rejects malformed output instead of saving a partial plan', async () => {
    vi.stubGlobal('fetch', async () =>
      new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: '{"title":"x"}' }] } }] }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    )

    await expect(proposeRoadmap(env(), 'u1', GOAL, CONTEXT)).rejects.toBeInstanceOf(AiError)
    expect(db.roadmaps).toHaveLength(0)
    expect(db.steps).toHaveLength(0)
  })

  it('surfaces a provider outage as an error when there is no key to fall back from', async () => {
    vi.stubGlobal('fetch', async (url: unknown) => {
      calls.push(String(url))
      return new Response('upstream is down', { status: 503 })
    })

    await expect(proposeRoadmap(env(), 'u1', GOAL, CONTEXT)).rejects.toBeInstanceOf(AiError)
    expect(db.steps).toHaveLength(0)
    expect(calls.length).toBeGreaterThan(0)
  })
})
