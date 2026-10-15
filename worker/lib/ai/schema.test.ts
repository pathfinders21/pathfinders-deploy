import { describe, expect, it } from 'vitest'
import { SchemaError, arr, num, parseStructured, spec, str } from './schema'

const S = spec({
  title: str('short', { max: 10 }),
  score: num('0..100', { min: 0, max: 100, integer: true }),
  tags: arr(str(), { max: 2 }),
})

describe('parseStructured', () => {
  it('accepts a well-formed response and drops unknown keys', () => {
    const out = parseStructured<{ title: string; score: number; tags: string[] }>(S, {
      title: 'ok',
      score: 50,
      tags: ['a'],
      injected: 'ignore me',
    })
    expect(out).toEqual({ title: 'ok', score: 50, tags: ['a'] })
    expect('injected' in out).toBe(false)
  })

  it('clamps out-of-range numbers instead of trusting them', () => {
    const out = parseStructured<{ score: number }>(S, { title: 'ok', score: 180, tags: [] })
    expect(out.score).toBe(100)
  })

  it('rounds and truncates within the declared bounds', () => {
    const out = parseStructured<{ score: number; title: string; tags: string[] }>(S, {
      title: 'a-very-long-title-indeed',
      score: 50.6,
      tags: ['a', 'b', 'c'],
    })
    expect(out.score).toBe(51)
    expect(out.title).toBe('a-very-lon')
    expect(out.tags).toEqual(['a', 'b'])
  })

  it('rejects a missing required field', () => {
    expect(() => parseStructured(S, { title: 'ok', tags: [] })).toThrow(SchemaError)
  })

  it('rejects a value of the wrong type rather than coercing it', () => {
    expect(() => parseStructured(S, { title: 'ok', score: 'not a number', tags: [] })).toThrow(SchemaError)
  })

  it('rejects a non-object response', () => {
    expect(() => parseStructured(S, 'a string')).toThrow(SchemaError)
  })

  it('reports every problem, not just the first', () => {
    try {
      parseStructured(spec({ a: str(), b: str(), c: str() }), {})
      throw new Error('should have thrown')
    } catch (error) {
      expect(error).toBeInstanceOf(SchemaError)
      expect((error as SchemaError).problems).toHaveLength(3)
    }
  })

  it('rejects a value outside a closed enum', () => {
    const E = spec({ severity: str('level', { enum: ['high', 'low'] }) })
    expect(() => parseStructured(E, { severity: 'catastrophic' })).toThrow(SchemaError)
    expect(parseStructured<{ severity: string }>(E, { severity: 'low' })).toEqual({ severity: 'low' })
  })
})
