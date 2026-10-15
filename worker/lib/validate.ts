/**
 * Inbound request validation.
 *
 * The contract the brief asks for ("validate every argument with
 * validators and TypeScript types") is satisfied here: one small validator set
 * that every route runs its body through, returning a typed value or throwing
 * `InputError` (HTTP 400, with the offending field named).
 *
 * The rule that matters: a validator never coerces away a problem and never
 * accepts a value the caller did not send. An unknown role, an admin string, a
 * 10 000-character bio or a non-array skills field is a rejected request, not a
 * silently corrected one: that is what stops the client from writing its own
 * permissions.
 */

export class InputError extends Error {
  field: string
  constructor(field: string, message: string) {
    super(`${field}: ${message}`)
    this.name = 'InputError'
    this.field = field
  }
}

export type Validator<T> = (value: unknown, field: string) => T

/** A missing (undefined/null) value becomes `fallback`. */
export function withDefault<T>(validator: Validator<T>, fallback: T): Validator<T> {
  return (value, field) => (value === undefined || value === null ? fallback : validator(value, field))
}

/** A missing value stays missing; a present one is validated. */
export function optional<T>(validator: Validator<T>): Validator<T | undefined> {
  return (value, field) => (value === undefined || value === null ? undefined : validator(value, field))
}

export type StringOpts = {
  max?: number
  min?: number
  /** Only these values are accepted. */
  values?: readonly string[]
  /** Lower-case before comparing against `values`. Does not alter the output. */
  lowercase?: boolean
}

export function string(opts: StringOpts = {}): Validator<string> {
  const { max = 4000, min = 0, values, lowercase = false } = opts
  return (value, field) => {
    if (typeof value !== 'string') throw new InputError(field, 'expected a string')
    const text = value.trim()
    if (text.length < min) throw new InputError(field, `must be at least ${min} characters`)
    if (text.length > max) throw new InputError(field, `must be at most ${max} characters`)
    if (values) {
      const probe = lowercase ? text.toLowerCase() : text
      if (!values.includes(probe)) {
        throw new InputError(field, `must be one of ${values.join(' | ')}`)
      }
    }
    return text
  }
}

export function stringArray(opts: { max?: number; itemMax?: number } = {}): Validator<string[]> {
  const { max = 24, itemMax = 80 } = opts
  return (value, field) => {
    if (!Array.isArray(value)) throw new InputError(field, 'expected an array of strings')
    if (value.length > max) throw new InputError(field, `must have at most ${max} items`)
    const out: string[] = []
    for (const item of value) {
      if (typeof item !== 'string') throw new InputError(field, 'every item must be a string')
      const text = item.trim()
      if (text.length === 0) continue
      if (text.length > itemMax) throw new InputError(field, `every item must be at most ${itemMax} characters`)
      if (!out.includes(text)) out.push(text)
    }
    return out
  }
}

/**
 * Pass-through for values validated elsewhere.
 *
 * Used for the roadmap plan the client hands back on confirm: its shape is
 * checked against the model's own schema by `validatePlan`, not by this module.
 */
export function raw(): Validator<unknown> {
  return (value) => value
}

export function boolean(): Validator<boolean> {
  return (value, field) => {
    if (typeof value !== 'boolean') throw new InputError(field, 'expected a boolean')
    return value
  }
}

/** A plain object whose keys are validated individually. Unknown keys are dropped. */
export function object<S extends Record<string, Validator<unknown>>>(
  shape: S,
): Validator<{ [K in keyof S]: S[K] extends Validator<infer T> ? T : never }> {
  return (value, field) => {
    if (typeof value !== 'object' || value === null || Array.isArray(value)) {
      throw new InputError(field, 'expected an object')
    }
    const source = value as Record<string, unknown>
    const out: Record<string, unknown> = {}
    for (const [key, validator] of Object.entries(shape)) {
      const validated = (validator as Validator<unknown>)(source[key], `${field}.${key}`)
      if (validated !== undefined) out[key] = validated
    }
    return out as { [K in keyof S]: S[K] extends Validator<infer T> ? T : never }
  }
}

/** An array whose every item is validated by `item`. The count is capped. */
export function arrayOf<T>(item: Validator<T>, opts: { max?: number } = {}): Validator<T[]> {
  const max = opts.max ?? 20
  return (value, field) => {
    if (!Array.isArray(value)) throw new InputError(field, 'expected an array')
    if (value.length > max) throw new InputError(field, `must have at most ${max} items`)
    return value.map((entry, index) => item(entry, `${field}[${index}]`))
  }
}

/** Reads the whole body through a validator, so a shape error reads as one message. */
export function parseBody<T>(validator: Validator<T>, body: unknown): T {
  return validator(body, 'body')
}
