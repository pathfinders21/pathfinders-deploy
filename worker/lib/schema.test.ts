import { describe, expect, it } from 'vitest'
import { ADDITIVE_COLUMNS, SCHEMA_SQL, TRUST_SCHEMA_SQL, UPGRADE_SCHEMA_SQL, schemaSqlForExec } from './db'

/**
 * `D1Database.exec` runs its input as one statement per line, so the schema strings must be
 * flattened before they are handed to it. This suite exists because that is exactly how a
 * `-- comment` in the middle of a script silently turned the whole batch into a comment:
 * `wrangler dev` answered 500 to every route, including `/api/health`.
 */

const PARTS: Array<[string, string]> = [
  ['SCHEMA_SQL', SCHEMA_SQL],
  ['UPGRADE_SCHEMA_SQL', UPGRADE_SCHEMA_SQL],
  ['TRUST_SCHEMA_SQL', TRUST_SCHEMA_SQL],
]

describe('schema SQL preparation', () => {
  it('leaves no line comments or newlines for exec to trip over', () => {
    for (const [name, sql] of PARTS) {
      const prepared = schemaSqlForExec(sql)
      expect(prepared, name).not.toContain('--')
      expect(prepared, name).not.toContain('\n')
      // A comment-only batch is what "SQL code did not contain a statement" means.
      expect(prepared.length, name).toBeGreaterThan(100)
    }
  })

  it('keeps every statement it started with', () => {
    for (const [name, sql] of PARTS) {
      const before = (sql.match(/CREATE (TABLE|INDEX|UNIQUE INDEX) IF NOT EXISTS/g) ?? []).length
      const after = (schemaSqlForExec(sql).match(/CREATE (TABLE|INDEX|UNIQUE INDEX) IF NOT EXISTS/g) ?? []).length
      expect(after, name).toBe(before)
      expect(after, name).toBeGreaterThan(0)
    }
  })

  it('still creates the tables the AI upgrade depends on', () => {
    const all = PARTS.map(([, sql]) => schemaSqlForExec(sql)).join(' ')
    for (const table of ['profiles', 'goals', 'roadmaps', 'roadmap_steps', 'assessments', 'agent_proposals', 'mentorship_requests']) {
      expect(all, table).toContain(`CREATE TABLE IF NOT EXISTS ${table} `)
    }
  })

  it('adds the demo seed marker as an additive column, never a rewrite', () => {
    // The column is what lets the interface label seeded data. It is additive on purpose:
    // a database that predates it keeps every row it already had.
    expect(Object.keys(ADDITIVE_COLUMNS.profiles ?? {})).toContain('demo_seeded_at')
    expect(ADDITIVE_COLUMNS.profiles!.demo_seeded_at).toBe('TEXT')
  })
})
