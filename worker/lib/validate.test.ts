import { describe, expect, it } from 'vitest'
import { InputError, boolean, object, optional, string, stringArray, withDefault } from './validate'
import { ROLES } from './profile'

/**
 * The validator is the boundary that stops a client from writing its own
 * permissions, so these tests are about what it *refuses*, not what it accepts.
 */

const roleBody = object({ role: optional(string({ values: ROLES })) })

describe('string', () => {
  it('trims and enforces bounds', () => {
    expect(string({ max: 5 })('  hello  ', 'f')).toBe('hello')
    expect(() => string({ max: 3 })('toolong', 'f')).toThrow(InputError)
    expect(() => string({ min: 3 })('ab', 'f')).toThrow(InputError)
  })

  it('refuses a non-string rather than coercing it', () => {
    expect(() => string()(42, 'f')).toThrow(/expected a string/)
    expect(() => string()(null, 'f')).toThrow(/expected a string/)
  })

  it('names the offending field', () => {
    try {
      object({ title: string({ max: 3 }) })({ title: 'too long' }, 'body')
      throw new Error('should have thrown')
    } catch (error) {
      expect(error).toBeInstanceOf(InputError)
      expect((error as InputError).field).toBe('body.title')
    }
  })
})

describe('stringArray', () => {
  it('drops blanks and de-duplicates', () => {
    expect(stringArray({ max: 4 })(['a', '', 'a', 'b'], 'f')).toEqual(['a', 'b'])
  })

  it('caps the submitted list before de-duplicating it', () => {
    // The bound is on what the caller sent, not on what survives de-duplication:
    // otherwise a thousand copies of one value would sail through.
    expect(() => stringArray({ max: 2 })(['a', 'b', 'c'], 'f')).toThrow(/at most 2/)
    expect(() => stringArray({ max: 2 })(['a', 'a', 'a'], 'f')).toThrow(/at most 2/)
  })

  it('refuses a scalar where a list is required', () => {
    expect(() => stringArray()('not a list', 'f')).toThrow(/expected an array/)
  })
})

describe('optional and withDefault', () => {
  it('keeps a missing value missing', () => {
    expect(optional(string())(undefined, 'f')).toBeUndefined()
    expect(optional(string())(null, 'f')).toBeUndefined()
  })

  it('supplies a default only for a missing value', () => {
    expect(withDefault(boolean(), false)(undefined, 'f')).toBe(false)
    expect(withDefault(boolean(), false)(true, 'f')).toBe(true)
    expect(() => withDefault(boolean(), false)('true', 'f')).toThrow(/expected a boolean/)
  })
})

describe('the role field is a closed set', () => {
  it('accepts the two selectable roles', () => {
    expect(parse(roleBody, { role: 'mentee' }).role).toBe('mentee')
    expect(parse(roleBody, { role: 'mentor' }).role).toBe('mentor')
  })

  it('refuses admin, case variants and unknown values', () => {
    for (const role of ['admin', 'ADMIN', 'Mentor', 'moderator', '', 'root']) {
      expect(() => parse(roleBody, { role })).toThrow(InputError)
    }
  })
})

function parse<T>(validator: (value: unknown, field: string) => T, value: unknown): T {
  return validator(value, 'body')
}
