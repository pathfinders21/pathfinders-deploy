/**
 * Gap analysis: the rules around it, not the model's prose.
 *
 * The provider is MOCKED here (a stubbed fetch): these tests pin what the app does with
 * an answer, what it refuses to accept, and what it does when there is no answer at all.
 * Nothing in this file calls a real model.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AiError } from './ai/errors'
import { StubDb, asD1 } from './test-db'
import {
  ASSESSMENT_NOTE,
  EVIDENCE_MIN_CHARS,
  assessReadiness,
  enforceEvidence,
  loadAssessments,
  runAssessment,
  type AssessmentBody,
  type AssessmentInput,
} from './assessment'

let db: StubDb
let fetchCalls: string[]

const BASE_ENV = {
  AI_API_KEY: 'test-key',
  AI_MAX_RETRIES: '1',
  AI_DEDUPE_WINDOW_MS: '0',
}

function env(overrides: Record<string, string> = {}) {
  return { ...BASE_ENV, ...overrides, DB: asD1(db) }
}

function respondWith(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })
}

function modelAnswer(payload: unknown) {
  return respondWith({ candidates: [{ content: { parts: [{ text: JSON.stringify(payload) }] } }] })
}

const GOOD_ANSWER: AssessmentBody = {
  targetRole: 'Backend Engineer',
  summary: 'You have shipped a service and you are missing the data layer.',
  strengths: [
    {
      skill: 'TypeScript',
      evidence: 'You described shipping a typed API.',
      confidence: 0.7,
      source: 'evidenced',
    },
  ],
  gaps: [
    {
      skill: 'Database indexing',
      why: 'The role you named involves query performance.',
      evidence: 'Nothing in your profile mentions a database.',
      priority: 'high',
      confidence: 0.6,
      exercises: ['Add an index to a slow query and measure it.'],
    },
  ],
  assumptions: ['Assumes the project you described is your own work.'],
  questionsToStrengthen: ['What does your slowest query look like?'],
}

const THIN: AssessmentInput = {
  goalText: '',
  skillsHave: [],
  skillsWant: [],
  interests: [],
  industries: [],
  hoursPerWeek: '',
  education: '',
  projectText: '',
}

const RICH: AssessmentInput = {
  goalText: 'Become a backend engineer working on payments systems.',
  skillsHave: ['TypeScript', 'Node', 'Postgres'],
  skillsWant: ['Database indexing', 'Kafka'],
  interests: ['payments'],
  industries: ['fintech'],
  hoursPerWeek: '8',
  education: 'BSc Computer Science, year 2',
  projectText:
    'I built a REST API for a student marketplace with Node and Postgres, deployed it on Fly, and wrote the integration tests for the checkout path.',
}

beforeEach(() => {
  db = new StubDb()
  fetchCalls = []
  vi.stubGlobal('fetch', async (input: unknown) => {
    fetchCalls.push(String(input))
    return modelAnswer(GOOD_ANSWER)
  })
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('readiness: a thin profile never reaches a model', () => {
  it('asks for more information and spends no model call', async () => {
    const out = await runAssessment(env(), 'u1', THIN)
    expect(out.needsMoreInfo).toBe(true)
    if (out.needsMoreInfo !== true) throw new Error('unreachable')
    expect(out.missing.length).toBeGreaterThan(0)
    expect(out.missing.join(' ')).toMatch(/direction or role/i)
    expect(fetchCalls.length).toBe(0)
    expect(db.assessments.length).toBe(0)
  })

  it('names the fields that would make an analysis possible', () => {
    const readiness = assessReadiness(THIN)
    expect(readiness.ready).toBe(false)
    expect(readiness.provisional).toBe(true)
    expect(readiness.improvements.join(' ')).toMatch(/hours a week/i)
    expect(readiness.improvements.join(' ')).toMatch(/something you have built/i)
  })

  it('is ready with a goal and skills, but still provisional without described work', () => {
    const noWork = { ...THIN, goalText: 'Become a backend engineer.', skillsHave: ['Go'] }
    const readiness = assessReadiness(noWork)
    expect(readiness.ready).toBe(true)
    expect(readiness.provisional).toBe(true)
  })

  it('is not provisional once there is work to point at and time available', () => {
    expect(assessReadiness(RICH).provisional).toBe(false)
  })
})

describe('a valid answer is validated, stored and labelled', () => {
  it('stores the analysis and reports the model as the engine', async () => {
    const out = await runAssessment(env(), 'u1', RICH)
    if (out.needsMoreInfo !== false) throw new Error('expected an analysis')
    expect(out.assessment.engine).toBe('gemini')
    expect(out.assessment.targetRole).toBe('Backend Engineer')
    expect(out.assessment.provisional).toBe(false)
    expect(out.note).toBe(ASSESSMENT_NOTE)
    expect(db.assessments.length).toBe(1)
  })

  it('keeps history rather than replacing it', async () => {
    await runAssessment(env(), 'u1', RICH)
    await runAssessment(env(), 'u1', RICH, { refresh: true })
    const all = await loadAssessments(asD1(db), 'u1')
    expect(all.length).toBe(2)
  })

  it('reuses the stored analysis for the same profile instead of paying twice', async () => {
    await runAssessment(env(), 'u1', RICH)
    const callsAfterFirst = fetchCalls.length
    const second = await runAssessment(env(), 'u1', RICH)
    if (second.needsMoreInfo !== false) throw new Error('expected an analysis')
    expect(second.cached).toBe(true)
    expect(fetchCalls.length).toBe(callsAfterFirst)
  })
})

describe('the server decides what counts as evidence', () => {
  it('demotes a claimed-evidenced finding when nothing in the profile shows it in use', async () => {
    const noWork = { ...RICH, projectText: '' }
    const out = await runAssessment(env(), 'u1', noWork)
    if (out.needsMoreInfo !== false) throw new Error('expected an analysis')
    const [strength] = out.assessment.strengths
    expect(strength!.source).toBe('self_reported')
    expect(strength!.confidence).toBeLessThanOrEqual(0.4)
    expect(out.assessment.downgraded).toBe(1)
    expect(strength!.evidence).toMatch(/rests on your own report/i)
  })

  it('keeps an evidenced finding when the student described real work', async () => {
    const out = await runAssessment(env(), 'u1', RICH)
    if (out.needsMoreInfo !== false) throw new Error('expected an analysis')
    expect(out.assessment.strengths[0]!.source).toBe('evidenced')
    expect(out.assessment.downgraded).toBe(0)
  })

  it('never lists the same skill as both a strength and a gap', () => {
    const body: AssessmentBody = {
      ...GOOD_ANSWER,
      strengths: [
        { skill: 'Postgres', evidence: 'listed', confidence: 0.5, source: 'self_reported' },
      ],
      gaps: [
        {
          skill: 'postgres',
          why: 'x',
          evidence: 'y',
          priority: 'high',
          confidence: 0.5,
          exercises: ['z'],
        },
        {
          skill: 'Kafka',
          why: 'x',
          evidence: 'y',
          priority: 'low',
          confidence: 0.5,
          exercises: ['z'],
        },
      ],
    }
    const { body: fixed } = enforceEvidence(body, RICH)
    expect(fixed.gaps.map((g) => g.skill)).toEqual(['Kafka'])
  })

  it('measures evidence by the length of described work', () => {
    expect(EVIDENCE_MIN_CHARS).toBeGreaterThan(0)
    const short = enforceEvidence(GOOD_ANSWER, { ...RICH, projectText: 'shipped a thing' })
    expect(short.downgraded).toBe(1)
  })
})

describe('a bad answer is refused, never papered over', () => {
  it('rejects output that does not match the schema and stores nothing', async () => {
    vi.stubGlobal('fetch', async () =>
      // gaps are the required part; a summary alone is not an analysis
      modelAnswer({ targetRole: 'Backend Engineer', summary: 'looks fine' }),
    )
    const error = await runAssessment(env(), 'u1', RICH).catch((e) => e as AiError)
    expect(error).toBeInstanceOf(AiError)
    expect((error as AiError).kind).toBe('ai_invalid_output')
    expect(db.assessments.length).toBe(0)
  })

  it('surfaces a provider outage as an error when demo mode is off', async () => {
    vi.stubGlobal('fetch', async () => respondWith({ error: { message: 'boom' } }, 500))
    const error = await runAssessment(env({ AI_DEMO_MODE: 'false' }), 'u1', RICH).catch((e) => e as AiError)
    expect(error).toBeInstanceOf(AiError)
    expect(['ai_provider_error', 'ai_timeout']).toContain((error as AiError).kind)
    expect(db.assessments.length).toBe(0)
  })

  it('uses the deterministic stand-in only in demo mode, and labels it as demo', async () => {
    vi.stubGlobal('fetch', async () => respondWith({ error: { message: 'boom' } }, 500))
    const out = await runAssessment(env({ AI_DEMO_MODE: 'true' }), 'u1', RICH)
    if (out.needsMoreInfo !== false) throw new Error('expected an analysis')
    expect(out.assessment.engine).toBe('demo')
    expect(out.assessment.gaps.length).toBeGreaterThan(0)
  })

  it('refuses to run at all with no key configured, rather than inventing an answer', async () => {
    const error = await runAssessment(env({ AI_API_KEY: '' }), 'u1', RICH).catch((e) => e as AiError)
    expect(error).toBeInstanceOf(AiError)
    expect((error as AiError).kind).toBe('ai_unconfigured')
    expect(fetchCalls.length).toBe(0)
  })
})
