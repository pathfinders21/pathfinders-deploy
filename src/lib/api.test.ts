// @vitest-environment jsdom
/**
 * The client's contract with the server, driven by stubbed responses. These pin the two
 * things that matter: a failure keeps its meaning, and nothing invents a user.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiError, api, request } from './api.ts'

const respond = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })

let calls: Array<{ url: string; init?: RequestInit }>

beforeEach(() => {
  calls = []
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

const stub = (body: unknown, status = 200) => {
  vi.stubGlobal('fetch', async (url: unknown, init?: RequestInit) => {
    calls.push({ url: String(url), init })
    return respond(body, status)
  })
}

describe('api client', () => {
  it('sends same origin credentials on every call', async () => {
    stub({ ok: true })
    await request('/api/profile')
    expect(calls[0]!.init?.credentials).toBe('same-origin')
  })

  it('reads a 401 as signed out, not as a generic error', async () => {
    stub({ ok: false, error: 'Sign in required' }, 401)
    const error = (await request('/api/profile').catch((e) => e as ApiError)) as ApiError
    expect(error).toBeInstanceOf(ApiError)
    expect(error.kind).toBe('signed_out')
    expect(error.userMessage).toMatch(/sign in/i)
  })

  it('keeps a provider failure identifiable and retryable', async () => {
    stub(
      { ok: false, error: 'The model returned something that was not JSON. Nothing was saved.', code: 'ai_invalid_output', retryable: false },
      502,
    )
    const error = (await request('/api/assessment', { method: 'POST', body: {} }).catch((e) => e as ApiError)) as ApiError
    expect(error.kind).toBe('ai')
    expect(error.code).toBe('ai_invalid_output')
    expect(error.retryable).toBe(false)
    expect(error.message).toMatch(/nothing was saved/i)
  })

  it('tells the user which variable an unconfigured provider needs', async () => {
    stub({ ok: false, error: 'No AI provider key is configured.', code: 'ai_unconfigured', requiredEnv: ['AI_API_KEY'] }, 503)
    const error = (await request('/api/assessment', { method: 'POST', body: {} }).catch((e) => e as ApiError)) as ApiError
    expect(error.userMessage).toContain('AI_API_KEY')
  })

  it('keeps a rate limit distinct, with the wait', async () => {
    stub({ ok: false, error: 'You have used your 40 AI requests for this hour.', code: 'ai_rate_limited', retryable: true, retryAfter: 1800 }, 429)
    const error = (await request('/api/assessment', { method: 'POST', body: {} }).catch((e) => e as ApiError)) as ApiError
    expect(error.kind).toBe('ai')
    expect(error.retryAfter).toBe(1800)
    expect(error.retryable).toBe(true)
  })

  it('calls an unreachable server a network error rather than a signed out user', async () => {
    vi.stubGlobal('fetch', async () => {
      throw new TypeError('Failed to fetch')
    })
    const error = (await request('/api/profile').catch((e) => e as ApiError)) as ApiError
    expect(error.kind).toBe('network')
  })

  it('does not believe a body that claims a user', async () => {
    // The client has no way to assert identity: it sends no id and reads none back as
    // authoritative. A body that includes a foreign user is simply data.
    stub({ ok: true, profile: { userId: 'someone-else', role: 'mentor' } })
    const result = await api.profile()
    expect(calls[0]!.url).toBe('/api/profile')
    expect(JSON.stringify(calls[0]!.init?.body ?? '')).toBe('""')
    expect(result.profile.userId).toBe('someone-else')
  })

  it('refuses to read a static host fallback as an answer', async () => {
    // A static host with a single page fallback answers `/api/profile` with the site
    // itself and a 200. Reading that as success handed the screens a record whose every
    // collection was undefined, and the first screen that called `.filter` on one of them
    // took the whole app down to a blank page. A 200 that is not JSON is a server
    // failure, so the callers fall back to their labelled sample data instead.
    vi.stubGlobal('fetch', async () =>
      new Response('<!doctype html><html><body><div id="root"></div></body></html>', {
        status: 200,
        headers: { 'content-type': 'text/html; charset=utf-8' },
      }),
    )
    const error = (await request('/api/profile').catch((e) => e as ApiError)) as ApiError
    expect(error).toBeInstanceOf(ApiError)
    expect(error.kind).toBe('server')
    expect(error.userMessage).toMatch(/could not read/i)
  })
})
