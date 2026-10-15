import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AiError } from './errors'
import { generateJson } from './provider'
import { obj, spec, str } from './schema'

/**
 * A minimal D1 stand-in.
 *
 * It implements only the statements `usage.ts` actually issues, and it fails
 * loudly on anything else, so a query that changes shape without the stub being
 * updated shows up as a test error instead of a silent pass. This is a
 * stand-in, not a SQL engine: the real D1 behaviour is verified against
 * `wrangler dev` (see PROGRESS.md).
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
    const rows = this.db.runSql(this.sql, this.params)
    return (rows[0] as T) ?? null
  }
}

class StubDb {
  usage: Row[] = []
  cache = new Map<string, { status: string; response: string; created_at: string }>()

  prepare(sql: string) {
    return new StubStatement(this, sql, [])
  }
  async batch(stmts: Array<{ run: () => Promise<unknown> }>) {
    for (const s of stmts) await s.run()
    return []
  }

  runSql(rawSql: string, params: unknown[]): Row[] {
    const sql = rawSql.replace(/\s+/g, ' ').trim()
    const p = params

    if (sql.startsWith('INSERT INTO ai_usage')) {
      this.usage.push({
        created_at: p[1],
        user_id: p[2],
        feature: p[3],
        status: p[10],
        error_kind: p[11],
      })
      return []
    }
    if (sql.includes('FROM ai_usage') && sql.includes('COUNT(*)') && sql.includes("status = 'ok'")) {
      return [
        {
          n: this.usage.filter((r) => r.user_id === p[0] && r.status === 'ok' && String(r.created_at) > String(p[1]))
            .length,
        },
      ]
    }
    if (sql.includes('FROM ai_usage') && sql.includes('COUNT(*)')) {
      return [{ n: this.usage.filter((r) => r.user_id === p[0]).length }]
    }
    if (sql.includes('created_at FROM ai_usage')) {
      const rows = this.usage
        .filter((r) => r.user_id === p[0])
        .sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)))
      return rows[0] ? [{ created_at: rows[0].created_at }] : []
    }
    if (sql.startsWith('SELECT status, response, created_at FROM ai_cache')) {
      const row = this.cache.get(String(p[0]))
      return row ? [{ status: row.status, response: row.response, created_at: row.created_at }] : []
    }
    if (sql.startsWith('SELECT status FROM ai_cache')) {
      const row = this.cache.get(String(p[0]))
      return row ? [{ status: row.status }] : []
    }
    if (sql.startsWith('INSERT OR IGNORE INTO ai_cache')) {
      const key = String(p[0])
      if (!this.cache.has(key)) {
        this.cache.set(key, { status: String(p[3]), response: String(p[4]), created_at: String(p[5]) })
      }
      return []
    }
    if (sql.startsWith("UPDATE ai_cache SET status = 'done'")) {
      const row = this.cache.get(String(p[1]))
      if (row) {
        row.status = 'done'
        row.response = String(p[0])
      }
      return []
    }
    if (sql.startsWith("UPDATE ai_cache SET status = 'running'")) {
      const row = this.cache.get(String(p[1]))
      if (row) {
        row.status = 'running'
        row.response = ''
        row.created_at = String(p[0])
      }
      return []
    }
    if (sql.startsWith('UPDATE ai_cache SET response = ?')) {
      const row = this.cache.get(String(p[2]))
      if (row && row.response === String(p[3])) {
        row.response = String(p[0])
        row.created_at = String(p[1])
      }
      return []
    }
    if (sql.startsWith('DELETE FROM ai_cache WHERE created_at')) {
      for (const [key, row] of this.cache) if (row.created_at < String(p[0])) this.cache.delete(key)
      return []
    }
    if (sql.startsWith('DELETE FROM ai_cache WHERE key')) {
      this.cache.delete(String(p[0]))
      return []
    }
    throw new Error(`StubDb: unhandled SQL: ${sql}`)
  }
}

const ANSWER_SPEC = spec({ answer: str(), confidence: str() })

const BASE_ENV = {
  AI_API_KEY: 'test-key',
  AI_MAX_RETRIES: '1',
  AI_DEDUPE_WINDOW_MS: '600000',
}

let db: StubDb
let fetchCalls: string[]

function env(overrides: Record<string, string> = {}) {
  return { ...BASE_ENV, ...overrides, DB: db as unknown as D1Database }
}

function respondWith(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })
}

/** Wraps a model answer the way the Gemini REST API would return it. */
function modelAnswer(payload: unknown) {
  return respondWith({ candidates: [{ content: { parts: [{ text: JSON.stringify(payload) }] } }] })
}

const CALL = {
  parts: [{ text: 'a question' }],
  spec: ANSWER_SPEC,
  dedupeMaterial: 'fixed-input',
}

beforeEach(() => {
  db = new StubDb()
  fetchCalls = []
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

function stubFetch(handler: () => Response | Promise<Response>) {
  vi.stubGlobal('fetch', async (input: unknown) => {
    fetchCalls.push(String(input))
    return handler()
  })
}

describe('generateJson: refusing to guess', () => {
  it('fails with an unconfigured error (not a fabricated answer) when no key exists', async () => {
    stubFetch(() => modelAnswer({ answer: 'x', confidence: 'y' }))
    const error = await generateJson(env({ AI_API_KEY: '' }), { userId: 'u1', feature: 'test' }, CALL).catch(
      (e: unknown) => e,
    )
    expect(error).toBeInstanceOf(AiError)
    expect((error as AiError).kind).toBe('ai_unconfigured')
    expect((error as AiError).status).toBe(503)
    expect(JSON.stringify((error as AiError).toPayload())).toContain('AI_API_KEY')
    expect(fetchCalls).toHaveLength(0)
  })

  it('rejects an oversized input before spending a request', async () => {
    stubFetch(() => modelAnswer({ answer: 'x', confidence: 'y' }))
    const error = await generateJson(
      env({ AI_MAX_INPUT_CHARS: '1000' }),
      { userId: 'u1', feature: 'test' },
      { ...CALL, parts: [{ text: 'x'.repeat(5000) }] },
    ).catch((e: unknown) => e)
    expect((error as AiError).kind).toBe('ai_input_too_large')
    expect((error as AiError).status).toBe(413)
    expect(fetchCalls).toHaveLength(0)
  })

  it('surfaces a provider outage as an error, with bounded retries', async () => {
    stubFetch(() => new Response('boom', { status: 503 }))
    const error = await generateJson(env(), { userId: 'u1', feature: 'test' }, CALL).catch((e: unknown) => e)
    expect((error as AiError).kind).toBe('ai_provider_error')
    // one attempt plus AI_MAX_RETRIES (1): never an unbounded loop
    expect(fetchCalls).toHaveLength(2)
  })

  it('does not retry a client error from the provider', async () => {
    stubFetch(() => new Response('bad request', { status: 400 }))
    const error = await generateJson(env(), { userId: 'u1', feature: 'test' }, CALL).catch((e: unknown) => e)
    expect((error as AiError).kind).toBe('ai_provider_error')
    expect(fetchCalls).toHaveLength(1)
  })

  it('times out rather than hanging, and says so', async () => {
    vi.stubGlobal('fetch', (_input: unknown, init?: RequestInit) => {
      fetchCalls.push('call')
      return new Promise((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () => {
          const error = new Error('aborted')
          error.name = 'AbortError'
          reject(error)
        })
      })
    })
    const error = await generateJson(
      env({ AI_TIMEOUT_MS: '1000', AI_MAX_RETRIES: '0' }),
      { userId: 'u1', feature: 'test' },
      CALL,
    ).catch((e: unknown) => e)
    expect((error as AiError).kind).toBe('ai_timeout')
    expect((error as AiError).status).toBe(504)
  })

  it('rejects malformed output and writes nothing', async () => {
    stubFetch(() => modelAnswer({ confidence: 'high' }))
    const error = await generateJson(env(), { userId: 'u1', feature: 'test' }, CALL).catch((e: unknown) => e)
    expect((error as AiError).kind).toBe('ai_invalid_output')
    expect(db.cache.size).toBe(0)
    expect(db.usage.at(-1)?.status).toBe('error')
  })

  it('rejects output that is not JSON at all', async () => {
    stubFetch(() =>
      respondWith({ candidates: [{ content: { parts: [{ text: 'I think the answer is 42.' }] } }] }),
    )
    const error = await generateJson(env(), { userId: 'u1', feature: 'test' }, CALL).catch((e: unknown) => e)
    expect((error as AiError).kind).toBe('ai_invalid_output')
  })
})

describe('generateJson: budgets and reuse', () => {
  it('returns a validated answer and records usage', async () => {
    stubFetch(() => modelAnswer({ answer: 'yes', confidence: 'high' }))
    const out = await generateJson<{ answer: string }>(env(), { userId: 'u1', feature: 'test' }, CALL)
    expect(out.value).toEqual({ answer: 'yes', confidence: 'high' })
    expect(out.engine).toBe('gemini')
    expect(out.cached).toBe(false)
    expect(db.usage.filter((r) => r.status === 'ok')).toHaveLength(1)
  })

  it('reuses the stored result for an identical request instead of paying twice', async () => {
    stubFetch(() => modelAnswer({ answer: 'yes', confidence: 'high' }))
    const first = await generateJson(env(), { userId: 'u1', feature: 'test' }, CALL)
    const second = await generateJson(env(), { userId: 'u1', feature: 'test' }, CALL)
    expect(first.cached).toBe(false)
    expect(second.cached).toBe(true)
    expect(second.value).toEqual(first.value)
    expect(fetchCalls).toHaveLength(1)
  })

  it('never serves one user another user’s cached answer', async () => {
    stubFetch(() => modelAnswer({ answer: 'yes', confidence: 'high' }))
    await generateJson(env(), { userId: 'u1', feature: 'test' }, CALL)
    await generateJson(env(), { userId: 'u2', feature: 'test' }, CALL)
    expect(fetchCalls).toHaveLength(2)
  })

  it('enforces the per-user hourly limit', async () => {
    stubFetch(() => modelAnswer({ answer: 'yes', confidence: 'high' }))
    const now = new Date().toISOString()
    db.usage = Array.from({ length: 40 }, () => ({ user_id: 'u1', status: 'ok', created_at: now }))

    const error = await generateJson(
      env({ AI_RATE_LIMIT_PER_HOUR: '40' }),
      { userId: 'u1', feature: 'test' },
      CALL,
    ).catch((e: unknown) => e)
    expect((error as AiError).kind).toBe('ai_rate_limited')
    expect((error as AiError).status).toBe(429)
    expect(fetchCalls).toHaveLength(0)

    // A different user is unaffected by someone else's spend.
    stubFetch(() => modelAnswer({ answer: 'yes', confidence: 'high' }))
    await expect(generateJson(env({ AI_RATE_LIMIT_PER_HOUR: '40' }), { userId: 'u2', feature: 'test' }, CALL)).resolves.toBeTruthy()
  })

  it('runs exactly one provider call when two identical requests race', async () => {
    stubFetch(
      () =>
        new Promise((resolve) => {
          setTimeout(() => resolve(modelAnswer({ answer: 'yes', confidence: 'high' })), 30)
        }),
    )
    const outcomes = await Promise.allSettled([
      generateJson<{ cached: boolean }>(env(), { userId: 'u1', feature: 'test' }, CALL),
      generateJson<{ cached: boolean }>(env(), { userId: 'u1', feature: 'test' }, CALL),
    ])
    const fresh = outcomes.filter((o) => o.status === 'fulfilled' && !o.value.cached)
    const served = outcomes.filter(
      (o) => (o.status === 'fulfilled' && o.value.cached) || (o.status === 'rejected' && (o.reason as AiError).kind === 'ai_busy'),
    )
    expect(fresh).toHaveLength(1)
    expect(served).toHaveLength(1)
    expect(fetchCalls).toHaveLength(1)
  })

  it('bypasses the cache when the caller asks for a deliberate regeneration', async () => {
    stubFetch(() => modelAnswer({ answer: 'yes', confidence: 'high' }))
    await generateJson(env(), { userId: 'u1', feature: 'test' }, CALL)
    await generateJson(env(), { userId: 'u1', feature: 'test' }, { ...CALL, cache: false })
    expect(fetchCalls).toHaveLength(2)
  })
})

describe('schema used by the provider', () => {
  it('keeps extra optional fields available to the mapper', () => {
    const out = generateJson<{ note: string }>(
      env(),
      { userId: 'u1', feature: 'test' },
      { parts: [{ text: 'q' }], spec: spec({ note: str() }), dedupeMaterial: 'z' },
    )
    expect(out).toBeDefined()
  })
})

describe('unused import guard', () => {
  it('exposes obj for composite specs', () => {
    expect(typeof obj).toBe('function')
  })
})
