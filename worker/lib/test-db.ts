/**
 * A focused D1 stand-in for the trust/messaging/rate tests.
 *
 * It implements only the statements those modules issue, and throws on anything
 * else, so a query whose shape changes without this file being updated fails the
 * suite instead of silently passing. `wrangler dev` remains the check that real
 * D1 accepts the SQL (see PROGRESS.md).
 */

export type Row = Record<string, any>

class StubStatement {
  constructor(private db: StubDb, private sql: string, private params: unknown[] = []) {}
  bind(...params: unknown[]) {
    return new StubStatement(this.db, this.sql, params)
  }
  async run() {
    this.db.runSql(this.sql, this.params)
    return { success: true, meta: { changes: this.db.lastChanges } }
  }
  async all<T>() {
    return { results: this.db.runSql(this.sql, this.params) as T[] }
  }
  async first<T>() {
    return (this.db.runSql(this.sql, this.params)[0] as T) ?? null
  }
}

export class StubDb {
  /** Monotonic insert order: the stand-in for SQLite rowid. */
  private seq = 0
  profiles: Row[] = []
  verifications: Row[] = []
  messages: Row[] = []
  actions: Row[] = []
  requests: Row[] = []
  goals: Row[] = []
  standups: Row[] = []
  assessments: Row[] = []
  proposals: Row[] = []
  roadmaps: Row[] = []
  steps: Row[] = []
  aiUsage: Row[] = []
  mentors: Row[] = []
  aiCache = new Map<string, Row>()
  lastChanges = 0
  unsupported: string[] = []

  prepare(sql: string) {
    return new StubStatement(this, sql)
  }
  async batch(stmts: Array<{ run: () => Promise<unknown> }>) {
    for (const s of stmts) await s.run()
    return []
  }

  runSql(rawSql: string, p: unknown[]): Row[] {
    const sql = rawSql.replace(/\s+/g, ' ').trim()
    this.lastChanges = 0
    const has = (fragment: string) => sql.includes(fragment)

    /* ---- verification ---- */
    if (has('FROM mentor_verifications WHERE user_id = ?') && has('LIMIT 1')) {
      return this.verifications
        .filter((r) => r.user_id === p[0])
        .sort((a, b) => String(b.submitted_at).localeCompare(String(a.submitted_at)) || b._seq - a._seq)
        .slice(0, 1)
    }
    if (has('FROM mentor_verifications WHERE user_id = ?') && has('LIMIT 20')) {
      return this.verifications
        .filter((r) => r.user_id === p[0])
        .sort((a, b) => String(b.submitted_at).localeCompare(String(a.submitted_at)) || b._seq - a._seq)
        .slice(0, 20)
    }
    if (has('SELECT user_id, status FROM mentor_verifications WHERE id IN')) {
      const ids = p.map(String)
      return this.verifications
        .filter((r) => ids.includes(String(r.user_id)))
        .sort((a, b) => String(a.submitted_at).localeCompare(String(b.submitted_at)) || a._seq - b._seq)
        .map((r) => ({ user_id: r.user_id, status: r.status }))
    }
    if (has('INSERT INTO mentor_verifications')) {
      this.verifications.push({
        id: p[0], user_id: p[1], status: 'pending', kind: p[2], statement: p[3],
        links: p[4], submitted_at: p[5], reviewed_at: null, reviewer_id: null, decision_note: '',
        _seq: ++this.seq,
      })
      this.lastChanges = 1
      return []
    }
    if (has('FROM mentor_verifications v') && has("v.status = 'pending'")) {
      const limit = Number(p[0] ?? 50)
      return this.verifications
        .filter((r) => r.status === 'pending')
        .sort((a, b) => String(a.submitted_at).localeCompare(String(b.submitted_at)))
        .slice(0, limit)
        .map((r) => ({ ...r, display_name: this.profiles.find((x) => x.user_id === r.user_id)?.display_name ?? '' }))
    }
    if (has('FROM mentor_verifications WHERE id = ?')) {
      return this.verifications.filter((r) => r.id === p[0])
    }
    if (has('UPDATE mentor_verifications SET status = ?')) {
      const row = this.verifications.find((r) => r.id === p[4] && r.status === 'pending')
      if (!row) return []
      row.status = p[0]
      row.reviewed_at = p[1]
      row.reviewer_id = p[2]
      row.decision_note = p[3]
      this.lastChanges = 1
      return []
    }

    /* ---- messaging ---- */
    if (has('FROM mentorship_requests WHERE id = ?')) {
      return this.requests.filter((r) => r.id === p[0])
    }
    if (has('FROM mentorship_requests r') && has("r.status = 'accepted'") && has('r.mentee_id = ? OR r.mentor_id = ?')) {
      return this.requests
        .filter((r) => r.status === 'accepted' && (r.mentee_id === p[0] || r.mentor_id === p[1]))
        .sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)))
        .map((r) => ({ ...r, goal_title: this.goals.find((g) => g.id === r.goal_id)?.title ?? null }))
    }
    if (has('FROM messages WHERE request_id IN')) {
      const ids = p.map(String)
      return this.messages
        .filter((m) => ids.includes(String(m.request_id)))
        .sort((a, b) => String(a.created_at).localeCompare(String(b.created_at)))
    }
    if (has('INSERT INTO messages')) {
      const row = {
        id: p[0], request_id: p[1], sender_id: p[2], recipient_id: p[3], body: p[4], created_at: p[5], read_at: null,
      }
      this.messages.push(row)
      this.lastChanges = 1
      return [row]
    }
    if (has('UPDATE messages SET read_at = ?')) {
      let n = 0
      for (const m of this.messages) {
        if (m.request_id === p[1] && m.recipient_id === p[2] && !m.read_at) {
          m.read_at = p[0]
          n++
        }
      }
      this.lastChanges = n
      return []
    }

    /* ---- profiles ---- */
    if (has('SELECT user_id, display_name FROM profiles WHERE user_id IN')) {
      const ids = p.map(String)
      return this.profiles.filter((r) => ids.includes(String(r.user_id)))
    }

    /* ---- action limits ---- */
    if (has('SELECT COUNT(*) AS n FROM action_events')) {
      const [userId, action, since] = p
      return [
        {
          n: this.actions.filter(
            (r) => r.user_id === userId && r.action === action && String(r.created_at) >= String(since),
          ).length,
        },
      ]
    }
    if (has('INSERT INTO action_events')) {
      this.actions.push({ id: p[0], user_id: p[1], action: p[2], created_at: p[3] })
      this.lastChanges = 1
      return []
    }
    if (has('DELETE FROM action_events')) {
      const [userId, action, cutoff] = p
      const before = this.actions.length
      this.actions = this.actions.filter(
        (r) => !(r.user_id === userId && r.action === action && String(r.created_at) < String(cutoff)),
      )
      this.lastChanges = before - this.actions.length
      return []
    }

    /* ---- assessments ---- */
    if (has('INSERT INTO assessments')) {
      this.assessments.push({
        id: p[0],
        user_id: p[1],
        created_at: p[2],
        target_role: p[3],
        provisional: p[4],
        input_hash: p[5],
        payload: p[6],
        engine: p[7],
        _seq: ++this.seq,
      })
      this.lastChanges = 1
      return []
    }
    if (has('SELECT * FROM assessments WHERE user_id = ?')) {
      return this.assessments
        .filter((r) => r.user_id === p[0])
        .sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)) || b._seq - a._seq)
        .slice(0, Number(p[1] ?? 5))
    }
    if (has('SELECT input_hash FROM assessments')) {
      const rows = this.assessments
        .filter((r) => r.user_id === p[0])
        .sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)) || b._seq - a._seq)
      return rows[0] ? [{ input_hash: rows[0].input_hash }] : []
    }

    /* ---- agent proposals ---- */
    if (has('INSERT INTO agent_proposals')) {
      const key = String(p[10])
      if (this.proposals.some((r) => r.idempotency_key === key)) {
        // Mirrors the unique index: a second identical proposal is refused by the database.
        throw new Error('UNIQUE constraint failed: agent_proposals.idempotency_key')
      }
      this.proposals.push({
        id: p[0],
        user_id: p[1],
        created_at: p[2],
        trigger_kind: p[3],
        trigger_ref: p[4],
        reasoning: p[5],
        evidence: p[6],
        action_kind: p[7],
        action_payload: p[8],
        status: p[9],
        idempotency_key: key,
        engine: p[11],
        decided_at: null,
        executed_at: null,
        result: null,
        _seq: ++this.seq,
      })
      this.lastChanges = 1
      return []
    }
    if (has('SELECT * FROM agent_proposals WHERE user_id = ?') && has('idempotency_key')) {
      const row = this.proposals.find((r) => r.user_id === p[0] && r.idempotency_key === p[1])
      return row ? [row] : []
    }
    if (has('SELECT * FROM agent_proposals WHERE id = ?')) {
      const row = this.proposals.find((r) => r.id === p[0])
      return row ? [row] : []
    }
    if (has('SELECT * FROM agent_proposals WHERE user_id = ?')) {
      return this.proposals
        .filter((r) => r.user_id === p[0])
        .sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)) || b._seq - a._seq)
        .slice(0, Number(p[1] ?? 20))
    }
    if (has('UPDATE agent_proposals SET')) {
      const row = this.proposals.find((r) => r.id === p[p.length - 1])
      if (!row) {
        this.lastChanges = 0
        return []
      }
      // Statement shape: SET status = ?, decided_at = ?, executed_at = ?, result = ? WHERE id = ?
      if (sql.includes('result = ?')) {
        row.status = p[0]
        row.decided_at = p[1]
        row.executed_at = p[2]
        row.result = p[3]
      } else {
        row.status = p[0]
        row.decided_at = p[1]
      }
      this.lastChanges = 1
      return []
    }

    /* ---- roadmaps and steps (the agent touches these) ---- */
    if (has('INSERT INTO roadmap_steps')) {
      // Two callers, two parameter lists. The agent's insert leaves parent_id NULL in the
      // statement, so the two are distinguishable and each is mapped to its real columns.
      const agentInsert = sql.includes('NULL, ?') && sql.includes("'agent'")
      const row = agentInsert
        ? {
            id: p[0],
            roadmap_id: p[1],
            parent_id: null,
            position: p[2],
            title: p[3],
            detail: p[4],
            status: 'pending',
            ai_generated: 1,
            source: 'agent',
            kind: p[5],
            origin: 'agent',
            estimate: p[6],
            deadline: p[7],
            created_at: p[8],
            updated_at: p[9],
            last_touched_at: p[10],
          }
        : {
            id: p[0],
            roadmap_id: p[1],
            parent_id: p[2],
            position: p[3],
            title: p[4],
            detail: p[5],
            status: 'pending',
            ai_generated: 0,
            source: 'user',
            kind: 'task',
            origin: 'user',
            estimate: p[6],
            deadline: p[7],
            created_at: p[8],
            updated_at: p[9],
            last_touched_at: p[10],
          }
      this.steps.push({ ...row, _seq: ++this.seq })
      this.lastChanges = 1
      return []
    }
    if (has('SELECT * FROM roadmap_steps WHERE roadmap_id = ?')) {
      return this.steps
        .filter((r) => r.roadmap_id === p[0])
        .sort((a, b) => Number(a.position) - Number(b.position) || a._seq - b._seq)
    }
    if (has('SELECT id FROM roadmap_steps WHERE roadmap_id = ?')) {
      return this.steps.filter((r) => r.roadmap_id === p[0]).map((r) => ({ id: r.id }))
    }
    if (has("UPDATE roadmap_steps SET status = ?") || has('UPDATE roadmap_steps SET title = ?')) {
      const row = this.steps.find((r) => r.id === p[p.length - 1])
      if (row) {
        row.status = sql.includes('status = ?') ? p[0] : row.status
        row.title = sql.includes('title = ?') ? p[0] : row.title
      }
      this.lastChanges = row ? 1 : 0
      return []
    }
    if (has('SELECT * FROM roadmaps WHERE id = ?')) {
      const row = this.roadmaps.find((r) => r.id === p[0])
      return row ? [row] : []
    }
    if (has('SELECT * FROM roadmaps WHERE user_id = ?')) {
      return this.roadmaps
        .filter((r) => r.user_id === p[0])
        .sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)))
    }
    if (has('MAX(position)')) {
      const rows = this.steps.filter((r) => r.roadmap_id === p[0])
      return [{ max_position: rows.length ? Math.max(...rows.map((r) => Number(r.position))) : null }]
    }
    if (has('COUNT(*) AS n FROM roadmap_steps')) {
      return [{ n: this.steps.filter((r) => r.roadmap_id === p[0]).length }]
    }

    /* ---- ai usage and cache (what generateJson writes) ---- */
    if (has('INSERT INTO ai_usage')) {
      this.aiUsage.push({
        id: p[0],
        created_at: p[1],
        user_id: p[2],
        feature: p[3],
        provider: p[4],
        model: p[5],
        engine: p[6],
        latency_ms: p[7],
        input_chars: p[8],
        output_chars: p[9],
        status: p[10],
        error_kind: p[11],
        cache_key: p[12],
      })
      this.lastChanges = 1
      return []
    }
    if (has('FROM ai_usage') && has("status = 'ok'")) {
      return [
        {
          n: this.aiUsage.filter(
            (r) => r.user_id === p[0] && r.status === 'ok' && String(r.created_at) > String(p[1]),
          ).length,
        },
      ]
    }
    if (has('FROM ai_usage') && has('COUNT(*)')) {
      return [{ n: this.aiUsage.filter((r) => r.user_id === p[0]).length }]
    }
    if (has('created_at FROM ai_usage')) {
      const rows = this.aiUsage
        .filter((r) => r.user_id === p[0])
        .sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)))
      return rows[0] ? [{ created_at: rows[0].created_at }] : []
    }
    if (has('INSERT INTO ai_cache')) {
      const key = String(p[0])
      const existing = this.aiCache.get(key)
      if (!existing) {
        // Columns: key, user_id, feature, created_at, status, response, slot_id
        this.aiCache.set(key, {
          cache_key: key,
          user_id: p[1],
          feature: p[2],
          created_at: p[3],
          status: 'running',
          response: '',
          slot_id: p[4],
        })
        this.lastChanges = 1
      }
      return []
    }
    if (has('FROM ai_cache')) {
      const row = this.aiCache.get(String(p[0]))
      return row ? [row] : []
    }
    if (has('UPDATE ai_cache SET')) {
      const row = this.aiCache.get(String(p[p.length - 1]))
      if (row) {
        row.status = sql.includes("status = 'done'") ? 'done' : row.status
        if (sql.includes('response = ?')) row.response = String(p[0])
      }
      this.lastChanges = row ? 1 : 0
      return []
    }
    if (has('DELETE FROM ai_cache')) {
      this.aiCache.clear()
      return []
    }

    /* ---- the adaptation agent's reads ---- */
    if (has("FROM goals WHERE user_id = ? AND status = 'active'")) {
      const rows = this.goals
        .filter((r) => r.user_id === p[0] && (r.status ?? 'active') === 'active')
        .sort((a, b) => String(b.updated_at ?? '').localeCompare(String(a.updated_at ?? '')))
      return rows.slice(0, 1).map((r) => ({ id: r.id, title: r.title }))
    }
    if (has('FROM roadmaps WHERE user_id = ?') && has('goal_id = ?')) {
      const rows = this.roadmaps.filter((r) => r.user_id === p[0] && r.goal_id === p[1] && (r.status ?? 'active') === 'active')
      return rows.slice(0, 1).map((r) => ({ id: r.id }))
    }
    if (has('FROM roadmaps WHERE user_id = ?') && has("status = 'active'")) {
      const rows = this.roadmaps.filter((r) => r.user_id === p[0] && (r.status ?? 'active') === 'active')
      return rows.slice(0, 1).map((r) => ({ id: r.id }))
    }
    if (has('SELECT id, title, status, kind, deadline, last_touched_at FROM roadmap_steps')) {
      return this.steps
        .filter((r) => r.roadmap_id === p[0])
        .sort((a, b) => Number(a.position) - Number(b.position) || a._seq - b._seq)
    }
    if (has('SELECT display_name FROM profiles WHERE user_id = ?')) {
      const row = this.profiles.find((r) => r.user_id === p[0])
      return row ? [{ display_name: row.display_name }] : []
    }
    if (has('SELECT id, name, role, domain FROM mentors')) {
      return this.mentors.slice(0, 12)
    }
    if (has('JOIN roadmaps r ON r.id = s.roadmap_id')) {
      const step = this.steps.find((r) => r.id === p[0])
      const roadmap = step ? this.roadmaps.find((r) => r.id === step.roadmap_id && r.user_id === p[1]) : null
      return step && roadmap ? [{ id: step.id }] : []
    }
    if (has('SELECT title, detail, deadline FROM roadmap_steps WHERE id = ?')) {
      const row = this.steps.find((r) => r.id === p[0])
      return row ? [{ title: row.title, detail: row.detail, deadline: row.deadline ?? null }] : []
    }
    if (has('SELECT * FROM roadmap_steps WHERE id = ?')) {
      const row = this.steps.find((r) => r.id === p[0])
      return row ? [row] : []
    }

    this.unsupported.push(sql)
    throw new Error(`StubDb: unsupported SQL → ${sql}`)
  }
}

export function asD1(db: StubDb): D1Database {
  return db as unknown as D1Database
}
