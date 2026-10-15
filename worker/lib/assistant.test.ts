/**
 * The assistant's rules, not the model's prose.
 *
 * The provider is MOCKED (a stubbed fetch) and so is the matching engine (its output is
 * handed in), which is what lets these tests pin the two promises that matter: the model
 * may only choose mentors the engine already ranked, and a deterministic answer is never
 * passed off as a model answer. Nothing here calls a real model.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AiError } from './ai/errors'
import { StubDb, asD1 } from './test-db'
import { ASSISTANT_NOTE, CHAT_MAX_TURNS, askAssistant } from './assistant'
import type { MatchOutput } from './matching'
import type { Profile } from './profile'

const { recommendMentors } = vi.hoisted(() => ({ recommendMentors: vi.fn() }))
vi.mock('./matching', () => ({ recommendMentors }))

let db: StubDb
let prompts: string[]

const BASE_ENV = { AI_API_KEY: 'test-key', AI_MAX_RETRIES: '1', AI_DEDUPE_WINDOW_MS: '0' }

function env(overrides: Record<string, string> = {}) {
  return { ...BASE_ENV, ...overrides, DB: asD1(db) }
}

/** Only the fields the assistant reads; the rest of a stored profile is not its business. */
const PROFILE = {
  userId: 'u1',
  displayName: 'Avik',
  goalsText: 'Become a backend engineer on payments systems',
  skillsHave: ['TypeScript'],
  skillsWant: ['Kafka'],
  interests: [],
  industries: [],
  hoursPerWeek: '6',
} as unknown as Profile

/**
 * A ranked mentor as the engine produces it. The scoring internals are covered by the
 * engine's own tests; here only the fields the assistant projects matter.
 */
function ranked(id: string, name: string, score: number, expertise: string[] = ['queues', 'Kafka']) {
  return {
    rank: 1,
    mentor: { id, name, headline: `${name} at Acme`, expertise },
    score,
    confidence: 'high',
    factors: [],
    missing: [],
    overlaps: { goals: [], skills: [], interests: [], days: [], industries: [] },
    explanation: { headline: '', summary: '', caveats: [] },
    summary: `${name} works on queues and Kafka.`,
    phrasedBy: 'demo',
  } as unknown as MatchOutput['matches'][number]
}

function shortlist(matches: MatchOutput['matches']) {
  recommendMentors.mockResolvedValue({
    matches,
    excluded: {},
    excludedReasonText: [],
    note: '',
    engine: 'demo',
    candidatePool: matches.length,
  } as unknown as MatchOutput)
}

function respondWith(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })
}

function modelAnswer(payload: unknown) {
  return respondWith({ candidates: [{ content: { parts: [{ text: JSON.stringify(payload) }] } }] })
}

const REPLY = {
  reply: 'Two paragraphs of advice. Bring the failing request to them.',
  mentorIds: ['m-1'],
  followUps: ['What have you tried?'],
}

beforeEach(() => {
  db = new StubDb()
  prompts = []
  recommendMentors.mockReset()
  shortlist([ranked('m-1', 'Dana Reyes', 87), ranked('m-2', 'Sam Okafor', 71, ['indexes'])])
  vi.stubGlobal('fetch', async (_input: unknown, init?: RequestInit) => {
    prompts.push(String(init?.body ?? ''))
    return modelAnswer(REPLY)
  })
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('mentors come from the engine, never from the model', () => {
  it('drops an id the model invented and keeps the one the engine ranked', async () => {
    vi.stubGlobal('fetch', async (_input: unknown, init?: RequestInit) => {
      prompts.push(String(init?.body ?? ''))
      return modelAnswer({ ...REPLY, mentorIds: ['m-1', 'made-up-id'] })
    })

    const answer = await askAssistant(env(), 'u1', PROFILE, 'Why does my queue duplicate charges?')

    expect(answer.engine).toBe('gemini')
    expect(answer.mentors.map((mentor) => mentor.id)).toEqual(['m-1'])
  })

  it('reports the engine’s own fit score rather than anything the model wrote', async () => {
    const answer = await askAssistant(env(), 'u1', PROFILE, 'Why does my queue duplicate charges?')
    expect(answer.mentors[0]!.score).toBe(87)
    expect(answer.mentors[0]!.name).toBe('Dana Reyes')
    expect(answer.note).toBe(ASSISTANT_NOTE)
  })

  it('still offers the engine’s top mentors when the model offered none', async () => {
    vi.stubGlobal('fetch', async () => modelAnswer({ ...REPLY, mentorIds: [] }))

    const answer = await askAssistant(env(), 'u1', PROFILE, 'Something unrelated to their expertise?')

    expect(answer.engine).toBe('gemini')
    expect(answer.mentors.map((mentor) => mentor.id)).toEqual(['m-1', 'm-2'])
    expect(answer.considered).toBe(2)
  })

  it('hands the model only the finished shortlist, with the ids it may choose from', async () => {
    await askAssistant(env(), 'u1', PROFILE, 'Why does my queue duplicate charges?')
    const prompt = prompts.join('\n')
    expect(prompt).toContain('id=m-1')
    expect(prompt).toContain('id=m-2')
    expect(prompt).toMatch(/only mentors you may offer/i)
  })
})

describe('a deterministic answer is never passed off as a model answer', () => {
  it('falls back to the demo engine only when demo mode is on, and labels it', async () => {
    vi.stubGlobal('fetch', async () => respondWith({ error: 'provider down' }, 500))

    const answer = await askAssistant(
      env({ AI_DEMO_MODE: 'true' }),
      'u1',
      PROFILE,
      'Why does my queue duplicate charges?',
    )

    expect(answer.engine).toBe('demo')
    expect(answer.reply).toMatch(/demo engine/i)
    expect(answer.mentors.map((mentor) => mentor.id)).toEqual(['m-1', 'm-2'])
    expect(answer.mentors[0]!.score).toBe(87)
  })

  it('fails loudly without a provider key instead of inventing an answer', async () => {
    vi.stubGlobal('fetch', async () => respondWith({ error: 'provider down' }, 500))

    await expect(askAssistant(env(), 'u1', PROFILE, 'Why does my queue duplicate charges?')).rejects.toBeInstanceOf(
      AiError,
    )
  })
})

describe('the transcript the server accepts is bounded', () => {
  it('sends only the tail of a long conversation', async () => {
    const history = Array.from({ length: CHAT_MAX_TURNS + 4 }, (_, index) => ({
      role: 'user' as const,
      text: `turn-marker-${index}`,
    }))

    await askAssistant(env(), 'u1', PROFILE, 'And what about retries?', history)

    const prompt = prompts.join('\n')
    expect(prompt).toContain(`turn-marker-${history.length - 1}`)
    expect(prompt).not.toContain('turn-marker-0')
  })
})
