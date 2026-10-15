/**
 * One definition per model response, used twice.
 *
 * The same `Spec` produces (a) the `responseSchema` the provider is constrained
 * by and (b) the validator that runs on the way back in. Keeping them in one
 * place is the whole point: a schema the model is held to and a schema the code
 * enforces cannot drift apart.
 *
 * `parseStructured` never invents a value. Missing required data fails; a value
 * of the wrong type fails; extra keys are dropped; out-of-range numbers are
 * clamped. Everything else is a rejected response, and the caller surfaces a
 * truthful error instead of writing a half-formed object to the database.
 */

/** JSON Schema subset the providers accept. */
export type JsonSchema = {
  type: string
  properties?: Record<string, JsonSchema>
  items?: JsonSchema
  required?: string[]
  enum?: string[]
  description?: string
}

export type Field =
  | { kind: 'string'; description?: string; enum?: string[]; max?: number }
  | { kind: 'number'; description?: string; min?: number; max?: number; integer?: boolean }
  | { kind: 'boolean'; description?: string }
  | { kind: 'array'; description?: string; items: Field; min?: number; max?: number }
  | { kind: 'object'; description?: string; fields: Record<string, Field>; required: string[] }

export type Spec = { fields: Record<string, Field>; required: string[] }

/* ---------------- builders (keep call sites readable) ---------------- */

export const str = (description?: string, opts: { enum?: string[]; max?: number } = {}): Field => ({
  kind: 'string',
  ...(description ? { description } : {}),
  ...opts,
})
export const num = (description?: string, opts: { min?: number; max?: number; integer?: boolean } = {}): Field => ({
  kind: 'number',
  ...(description ? { description } : {}),
  ...opts,
})
export const bool = (description?: string): Field => ({ kind: 'boolean', ...(description ? { description } : {}) })
export const arr = (items: Field, opts: { description?: string; min?: number; max?: number } = {}): Field => ({
  kind: 'array',
  items,
  ...opts,
})
export const obj = (fields: Record<string, Field>, required: string[]): Field => ({ kind: 'object', fields, required })

export const spec = (fields: Record<string, Field>, required = Object.keys(fields)): Spec => ({ fields, required })

/* ---------------- spec -> provider schema ---------------- */

function fieldToJson(field: Field): JsonSchema {
  switch (field.kind) {
    case 'string':
      return { type: 'STRING', ...(field.description ? { description: field.description } : {}), ...(field.enum ? { enum: field.enum } : {}) }
    case 'number':
      return { type: field.integer ? 'INTEGER' : 'NUMBER', ...(field.description ? { description: field.description } : {}) }
    case 'boolean':
      return { type: 'BOOLEAN', ...(field.description ? { description: field.description } : {}) }
    case 'array':
      return { type: 'ARRAY', items: fieldToJson(field.items), ...(field.description ? { description: field.description } : {}) }
    case 'object':
      return {
        type: 'OBJECT',
        properties: Object.fromEntries(Object.entries(field.fields).map(([k, v]) => [k, fieldToJson(v)])),
        required: field.required,
        ...(field.description ? { description: field.description } : {}),
      }
  }
}

export function specToJson(s: Spec): JsonSchema {
  return {
    type: 'OBJECT',
    properties: Object.fromEntries(Object.entries(s.fields).map(([k, v]) => [k, fieldToJson(v)])),
    required: s.required,
  }
}

/* ---------------- response -> validated value ---------------- */

export class SchemaError extends Error {
  problems: string[]
  constructor(problems: string[]) {
    super(`Model output did not match the required schema: ${problems.slice(0, 5).join('; ')}`)
    this.name = 'SchemaError'
    this.problems = problems
  }
}

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)

function coerceNumber(raw: unknown): number | null {
  if (typeof raw === 'number' && Number.isFinite(raw)) return raw
  // Models occasionally quote numbers. Accept that, reject anything else.
  if (typeof raw === 'string' && raw.trim() !== '' && Number.isFinite(Number(raw))) return Number(raw)
  return null
}

function coerceString(raw: unknown): string | null {
  if (typeof raw === 'string') return raw
  if (typeof raw === 'number' || typeof raw === 'boolean') return String(raw)
  return null
}

function walk(field: Field, raw: unknown, path: string, problems: string[]): unknown {
  switch (field.kind) {
    case 'string': {
      const value = coerceString(raw)
      if (value === null) {
        problems.push(`${path}: expected a string`)
        return undefined
      }
      const trimmed = field.max ? value.slice(0, field.max) : value
      if (field.enum && !field.enum.includes(trimmed)) {
        problems.push(`${path}: "${trimmed.slice(0, 40)}" is not one of ${field.enum.join(' | ')}`)
        return undefined
      }
      return trimmed
    }
    case 'number': {
      const value = coerceNumber(raw)
      if (value === null) {
        problems.push(`${path}: expected a number`)
        return undefined
      }
      let out = field.integer ? Math.round(value) : value
      if (field.min !== undefined && out < field.min) out = field.min
      if (field.max !== undefined && out > field.max) out = field.max
      return out
    }
    case 'boolean': {
      if (typeof raw === 'boolean') return raw
      if (raw === 'true' || raw === 'false') return raw === 'true'
      problems.push(`${path}: expected a boolean`)
      return undefined
    }
    case 'array': {
      if (!Array.isArray(raw)) {
        problems.push(`${path}: expected an array`)
        return undefined
      }
      const out: unknown[] = []
      raw.slice(0, field.max ?? raw.length).forEach((item, i) => {
        const value = walk(field.items, item, `${path}[${i}]`, problems)
        if (value !== undefined) out.push(value)
      })
      if (field.min !== undefined && out.length < field.min) {
        problems.push(`${path}: expected at least ${field.min} items, got ${out.length}`)
        return undefined
      }
      return out
    }
    case 'object': {
      if (!isObject(raw)) {
        problems.push(`${path}: expected an object`)
        return undefined
      }
      const out: Record<string, unknown> = {}
      for (const [key, child] of Object.entries(field.fields)) {
        const present = raw[key]
        if (present === undefined || present === null) {
          if (field.required.includes(key)) problems.push(`${path}.${key}: required`)
          continue
        }
        const value = walk(child, present, `${path}.${key}`, problems)
        if (value !== undefined) out[key] = value
      }
      return out
    }
  }
}

/**
 * Validates a parsed model response against a spec.
 *
 * Throws `SchemaError` (carrying every problem found, not just the first): a
 * caller must never write a partially valid object to D1.
 */
export function parseStructured<T>(s: Spec, raw: unknown): T {
  const problems: string[] = []
  const value = walk({ kind: 'object', fields: s.fields, required: s.required }, raw, '$', problems)
  if (problems.length > 0 || value === undefined) throw new SchemaError(problems)
  return value as T
}
