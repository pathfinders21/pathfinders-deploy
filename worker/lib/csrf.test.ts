import { describe, expect, it } from 'vitest'
import { csrfVerdict } from './csrf'

const ORIGIN = 'https://pathfinders.example'

const post = (headers: Record<string, string> = {}) =>
  new Request(`${ORIGIN}/api/requests`, { method: 'POST', headers: { 'content-type': 'application/json', ...headers } })

describe('csrfVerdict', () => {
  it('accepts a request that carries the site origin', () => {
    expect(csrfVerdict(post({ origin: ORIGIN }), ORIGIN)).toEqual({ ok: true })
  })

  it('rejects a foreign origin with 403', () => {
    const verdict = csrfVerdict(post({ origin: 'https://evil.example' }), ORIGIN)
    expect(verdict.ok).toBe(false)
    expect(verdict).toMatchObject({ status: 403 })
  })

  it('rejects a literal "null" origin', () => {
    // A sandboxed iframe or a file:// document sends `Origin: null`.
    expect(csrfVerdict(post({ origin: 'null' }), ORIGIN)).toMatchObject({ status: 403 })
  })

  it('rejects a cross site fetch even without an Origin header', () => {
    expect(csrfVerdict(post({ 'sec-fetch-site': 'cross site' }), ORIGIN)).toMatchObject({ status: 403 })
  })

  it('accepts a same-origin fetch that omits Origin', () => {
    expect(csrfVerdict(post({ 'sec-fetch-site': 'same-origin' }), ORIGIN)).toEqual({ ok: true })
  })

  it('fails closed when the deployment has no APP_ORIGIN', () => {
    expect(csrfVerdict(post({ origin: ORIGIN }), undefined)).toMatchObject({ status: 503 })
  })

  it('is not fooled by a lookalike host', () => {
    expect(csrfVerdict(post({ origin: `${ORIGIN}.evil.example` }), ORIGIN)).toMatchObject({ status: 403 })
    expect(csrfVerdict(post({ origin: 'https://pathfinders.example.evil' }), ORIGIN)).toMatchObject({ status: 403 })
  })
})
