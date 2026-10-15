/**
 * The adaptation agent's guarantees, with the provider MOCKED.
 *
 * The point of these tests is the loop's safety properties: nothing happens without
 * approval, approval is not repeatable, an invented id is refused, one account cannot
 * decide another's proposal, and a failure is reported rather than dressed up.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AiError } from './ai/errors'
import { StubDb, asD1 } from './test-db'
import {
  ACTION_KINDS,
  analyzeProgress,
  decideProposal,
  insertAgentStep,
  listProposals,
  proposeAction,
  readAgentState,
  validateProposal,
  type AgentState,
  type RawProposal,
} from './agent'

let db: StubDb
let fetchCalls: string[]

const ENV = { AI_API_KEY: 'test-key', AI_MAX_RETRIES: '1', AI_DEDUPE_WINDOW_MS: '0' }
const env = (overrides: Record<string, string> = {}) => ({ ...ENV, ...overrides, DB: asD1(db) })

const respond = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })
const modelAnswer = (payload: unknown) =>
  respond({ candidates: [{ content: { parts: [{ text: JSON.stringify(payload) }] } }] })

const PROPOSAL: RawProposal = {
  actionKind: 'save_action_item',
  title: 'Block an hour for the overdue milestone',
  detail: 'Spend one hour on it and write down what blocked you.',
  reasoning: 'The most overdue item is the one most likely to be abandoned quietly.',
  evidence: [{ ref: 'overdue', detail: 'The milestone was due three days ago and is not done.' }],
  milestoneRef: '',
  estimate: '1 hour',
  deadline: '',
  confidence: 0.6,
  mentorId: '',
}

/** A student with one active roadmap, one overdue step and one mentor to talk to. */
function seed() {
  db.profiles.push({ user_id: 'u1', display_name: 'Avik' })
  db.goals.push({ id: 'g1', user_id: 'u1', title: 'Become a backend engineer', status: 'active', updated_at: '2026-10-01' })
  db.roadmaps.push({ id: 'r1', user_id: 'u1', goal_id: 'g1', status: 'active', created_at: '2026-10-01' })
  db.steps.push({
    id: 's1',
    roadmap_id: 'r1',
    parent_id: null,
    position: 10,
    title: 'Learn Postgres indexing',
    detail: '',
    status: 'pending',
    ai_generated: 0,
    source: 'seed',
    created_at: '2026-10-01',
    last_touched_at: '2026-10-01',
    deadline: '2026-10-05',
    _seq: 1,
  })
  db.mentors.push({ id: 'm1', name: 'Elena', role: 'Staff Engineer', domain: 'AI' })
}

beforeEach(() => {
  db = new StubDb()
  fetchCalls = []
  seed()
  vi.stubGlobal('fetch', async (url: unknown) => {
    fetchCalls.push(String(url))
    return modelAnswer(PROPOSAL)
  })
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('reading real state and the app analysis', () => {
  it('finds the overdue milestone from its stored date, not from inactivity', async () => {
    const state = await readAgentState(asD1(db), 'u1')
    expect(state.roadmapId).toBe('r1')
    expect(state.totalCount).toBe(1)
    expect(state.overdue.map((s) => s.id)).toEqual(['s1'])
  })

  it('turns that into a finding with the id attached', async () => {
    const findings = analyzeProgress(await readAgentState(asD1(db), 'u1'), Date.parse('2026-10-10'))
    expect(findings[0]!.kind).toBe('overdue_milestone')
    expect(findings[0]!.ref).toBe('s1')
    expect(findings[0]!.detail).toMatch(/due \d+ days ago/)
  })

  it('reports a missing roadmap rather than inventing work', async () => {
    db.roadmaps = []
    db.goals = []
    const state = await readAgentState(asD1(db), 'u1')
    const findings = analyzeProgress(state)
    expect(findings[0]!.kind).toBe('no_roadmap')
  })
})

describe('rules a proposal must pass before a human sees it', () => {
  const state = {
    userId: 'u1',
    hasProfile: true,
    goalId: 'g1',
    goalTitle: 'x',
    roadmapId: 'r1',
    steps: [{ id: 's1', title: 'a', status: 'pending' as const, kind: 'task', deadline: null, lastTouchedAt: '' }],
    overdue: [],
    stalled: [],
    doneCount: 0,
    totalCount: 1,
    mentors: [{ id: 'm1', name: 'Elena', role: 'Staff', domain: 'AI' }],
  } satisfies AgentState

  it('accepts a well formed action', () => {
    expect(validateProposal(PROPOSAL, state)).toEqual([])
  })

  it('refuses a milestone that is not in the roadmap', () => {
    const problems = validateProposal({ ...PROPOSAL, actionKind: 'update_milestone', milestoneRef: 'invented-id' }, state)
    expect(problems.join(' ')).toMatch(/not in your roadmap/)
  })

  it('refuses a deadline in the past', () => {
    const problems = validateProposal({ ...PROPOSAL, deadline: '2020-01-01' }, state, Date.parse('2026-10-10'))
    expect(problems.join(' ')).toMatch(/in the past/)
  })

  it('refuses a mentor who is not in the directory', () => {
    const problems = validateProposal({ ...PROPOSAL, actionKind: 'prepare_request', mentorId: 'nobody' }, state)
    expect(problems.join(' ')).toMatch(/not in the directory/)
  })

  it('refuses an action with no evidence', () => {
    expect(validateProposal({ ...PROPOSAL, evidence: [] }, state)).toContain(
      'The action cites no evidence from your profile or roadmap.',
    )
  })

  it('refuses anything outside the fixed action list', () => {
    const problems = validateProposal({ ...PROPOSAL, actionKind: 'delete_everything' as never }, state)
    expect(problems.length).toBe(1)
    expect(problems[0]).toMatch(/not an action this app can perform/)
  })

  it('never offers an action that means "mark it complete"', () => {
    expect(ACTION_KINDS).not.toContain('complete' as never)
    expect(ACTION_KINDS.join(' ')).not.toMatch(/complete|done/i)
  })
})

describe('proposing is inert and idempotent', () => {
  it('stores a pending proposal and changes no roadmap', async () => {
    const out = await proposeAction(env(), 'u1')
    expect(out.proposal!.status).toBe('pending')
    expect(out.proposal!.engine).toBe('gemini')
    expect(db.proposals.length).toBe(1)
    // Nothing was written to the roadmap by proposing.
    expect(db.steps.filter((s) => s.origin === 'agent').length).toBe(0)
  })

  it('returns the same proposal for the same state instead of queueing a second', async () => {
    const first = await proposeAction(env(), 'u1')
    const callsAfterFirst = fetchCalls.length
    const second = await proposeAction(env(), 'u1')
    expect(second.reused).toBe(true)
    expect(second.proposal!.id).toBe(first.proposal!.id)
    expect(db.proposals.length).toBe(1)
    expect(fetchCalls.length).toBe(callsAfterFirst)
  })

  it('refuses a proposal the app will not carry out, and stores nothing', async () => {
    vi.stubGlobal('fetch', async () => modelAnswer({ ...PROPOSAL, actionKind: 'update_milestone', milestoneRef: 'ghost' }))
    const error = await proposeAction(env(), 'u1').then(
      () => null,
      (e: unknown) => e as AiError,
    )
    expect(error).toBeInstanceOf(AiError)
    expect(error!.kind).toBe('ai_invalid_output')
    expect(db.proposals.length).toBe(0)
  })

  it('reports a provider outage instead of faking a proposal, when demo mode is off', async () => {
    vi.stubGlobal('fetch', async () => respond({ error: { message: 'down' } }, 500))
    const error = await proposeAction(env({ AI_DEMO_MODE: 'false' }), 'u1').then(
      () => null,
      (e: unknown) => e as AiError,
    )
    expect(error).toBeInstanceOf(AiError)
    expect(db.proposals.length).toBe(0)
  })

  it('labels the deterministic fallback as demo when there is no key', async () => {
    vi.stubGlobal('fetch', async () => respond({ error: { message: 'down' } }, 500))
    const out = await proposeAction(env({ AI_DEMO_MODE: 'true' }), 'u1')
    expect(out.proposal!.engine).toBe('demo')
  })
})

describe('approval is the only thing that executes', () => {
  it('does nothing while a proposal sits pending', async () => {
    await proposeAction(env(), 'u1')
    expect(db.steps.length).toBe(1)
    expect((await listProposals(asD1(db), 'u1'))[0]!.status).toBe('pending')
  })

  it('executes on approval and records what changed', async () => {
    const { proposal } = await proposeAction(env(), 'u1')
    const decided = await decideProposal(env(), 'u1', proposal!.id, { kind: 'approve' })

    expect(decided.executed).toBe(true)
    expect(decided.changed.length).toBe(1)
    expect(decided.proposal.status).toBe('approved')
    expect(decided.proposal.executedAt).toBeTruthy()

    const agentSteps = db.steps.filter((s) => s.origin === 'agent')
    expect(agentSteps.length).toBe(1)
    expect(agentSteps[0]!.title).toBe(PROPOSAL.title)
    expect(agentSteps[0]!.ai_generated).toBe(1)
  })

  it('does not execute twice when the same approval is replayed', async () => {
    const { proposal } = await proposeAction(env(), 'u1')
    await decideProposal(env(), 'u1', proposal!.id, { kind: 'approve' })
    const replay = await decideProposal(env(), 'u1', proposal!.id, { kind: 'approve' })

    expect(replay.executed).toBe(false)
    expect(replay.proposal.status).toBe('approved')
    expect(db.steps.filter((s) => s.origin === 'agent').length).toBe(1)
  })

  it('applies an edit instead of the original text', async () => {
    const { proposal } = await proposeAction(env(), 'u1')
    const decided = await decideProposal(env(), 'u1', proposal!.id, {
      kind: 'approve',
      edit: { title: 'Rewrite the indexing notes' },
    })
    expect(decided.executed).toBe(true)
    const created = db.steps.find((s) => s.origin === 'agent')!
    expect(created.title).toBe('Rewrite the indexing notes')
  })

  it('rejects without changing anything, and keeps the record', async () => {
    const { proposal } = await proposeAction(env(), 'u1')
    const decided = await decideProposal(env(), 'u1', proposal!.id, { kind: 'reject', note: 'not this week' })

    expect(decided.executed).toBe(false)
    expect(decided.proposal.status).toBe('rejected')
    expect(db.steps.filter((s) => s.origin === 'agent').length).toBe(0)
    // The history is kept rather than deleted.
    expect((await listProposals(asD1(db), 'u1')).length).toBe(1)
  })

  it('refuses to decide a proposal belonging to someone else', async () => {
    const { proposal } = await proposeAction(env(), 'u1')
    const error = await decideProposal(env(), 'u2', proposal!.id, { kind: 'approve' }).then(
      () => null,
      (e: unknown) => e as AiError,
    )
    expect(error).toBeInstanceOf(AiError)
    expect(db.steps.filter((s) => s.origin === 'agent').length).toBe(0)
  })

  it('records a failure instead of claiming success when the change cannot be made', async () => {
    const { proposal } = await proposeAction(env(), 'u1')
    db.roadmaps = [] // the roadmap disappears between proposing and approving
    const decided = await decideProposal(env(), 'u1', proposal!.id, { kind: 'approve' })
    expect(decided.executed).toBe(false)
    expect(decided.proposal.status).toBe('failed')
    expect(decided.message).toMatch(/no active roadmap/i)
  })

  it('will not add a step for a user who owns no roadmap', async () => {
    db.roadmaps = []
    expect(await insertAgentStep(asD1(db), 'u1', 'task', { title: 'x', detail: '' })).toBeNull()
  })
})
