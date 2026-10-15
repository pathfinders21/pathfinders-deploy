/**
 * D1 persistence: schema, seed and small query helpers.
 *
 * Schema is created lazily with `CREATE TABLE IF NOT EXISTS`, so the same code
 * path provisions a fresh local database, a preview database and production
 * without a migration step that can drift from the code that reads it.
 */

import type { MentorRecord } from './types'

export const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS mentors (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  initials TEXT NOT NULL,
  year TEXT NOT NULL,
  tagline TEXT NOT NULL,
  skills TEXT NOT NULL,
  goals TEXT NOT NULL,
  careers TEXT NOT NULL,
  days TEXT NOT NULL,
  sessions INTEGER NOT NULL,
  years_ahead INTEGER NOT NULL,
  rating REAL NOT NULL,
  availability_window TEXT NOT NULL,
  vibe_tags TEXT NOT NULL,
  vibe_blurb TEXT NOT NULL,
  embedding TEXT
);
CREATE TABLE IF NOT EXISTS roadmaps (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  title TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS roadmap_steps (
  id TEXT PRIMARY KEY,
  roadmap_id TEXT NOT NULL,
  parent_id TEXT,
  position REAL NOT NULL,
  title TEXT NOT NULL,
  detail TEXT NOT NULL,
  status TEXT NOT NULL,
  ai_generated INTEGER NOT NULL DEFAULT 0,
  source TEXT NOT NULL DEFAULT 'seed',
  created_at TEXT NOT NULL,
  last_touched_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS standups (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  created_at TEXT NOT NULL,
  transcript TEXT NOT NULL,
  summary TEXT NOT NULL,
  blocker TEXT NOT NULL,
  completed_step_ids TEXT NOT NULL,
  mood TEXT NOT NULL,
  engine TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS code_reviews (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  created_at TEXT NOT NULL,
  language TEXT NOT NULL,
  code TEXT NOT NULL,
  score INTEGER NOT NULL,
  approved INTEGER NOT NULL,
  summary TEXT NOT NULL,
  issues TEXT NOT NULL,
  strengths TEXT NOT NULL,
  mentor_note TEXT NOT NULL,
  engine TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS agent_events (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  created_at TEXT NOT NULL,
  kind TEXT NOT NULL,
  title TEXT NOT NULL,
  detail TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS ai_usage (
  id TEXT PRIMARY KEY,
  created_at TEXT NOT NULL,
  user_id TEXT NOT NULL,
  feature TEXT NOT NULL,
  provider TEXT NOT NULL,
  model TEXT NOT NULL,
  engine TEXT NOT NULL,
  latency_ms INTEGER NOT NULL,
  input_chars INTEGER NOT NULL,
  output_chars INTEGER NOT NULL,
  status TEXT NOT NULL,
  error_kind TEXT,
  cache_key TEXT
);
CREATE TABLE IF NOT EXISTS ai_cache (
  key TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  feature TEXT NOT NULL,
  status TEXT NOT NULL,
  response TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_steps_roadmap ON roadmap_steps (roadmap_id);
CREATE INDEX IF NOT EXISTS idx_events_user ON agent_events (user_id, created_at);
CREATE INDEX IF NOT EXISTS idx_ai_usage_user ON ai_usage (user_id, created_at);
CREATE INDEX IF NOT EXISTS idx_ai_cache_user ON ai_cache (user_id, created_at);
`

/**
 * Prepares a schema string for `D1Database.exec`.
 *
 * `exec` splits its input on newlines and runs each non-empty line as its own statement, so
 * the SQL has to arrive as one line. Flattening with `replace(/\n/g, ' ')` alone is not
 * enough: it joins an inline `-- comment` to the statements that follow it, and the whole
 * batch then executes as a comment, which fails with "SQL code did not contain a
 * statement". The comments are documentation for whoever reads this file, not SQL, so they
 * are removed here rather than dropped from the source.
 */
export function schemaSqlForExec(sql: string): string {
  return sql
    .replace(/--[^\n]*/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

/**
 * Columns added after a table already existed in a live database.
 *
 * `CREATE TABLE IF NOT EXISTS` is a no-op on an existing table, so it can never
 * introduce a column. These are applied one at a time, guarded by a pragma read,
 * which is the only additive migration D1 needs here: no column is renamed,
 * retyped or dropped, so a production row written before the upgrade still reads
 * correctly afterwards.
 */
/**
 * Tables added by the AI-first upgrade (Phases 3 to 4).
 *
 * Kept apart from `SCHEMA_SQL` because they are all `CREATE TABLE IF NOT
 * EXISTS`: running them against an existing database is additive and cannot
 * disturb rows written before the upgrade. Nothing here renames or retypes an
 * existing column, so a production row stays readable.
 *
 * `profiles` is the one place a role is stored. It is written by the server from
 * a validated request and is the only thing authorization reads: the browser's
 * remembered role is a display hint and grants nothing.
 */
export const UPGRADE_SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS profiles (
  user_id TEXT PRIMARY KEY,
  role TEXT NOT NULL DEFAULT '',
  display_name TEXT NOT NULL DEFAULT '',
  email TEXT NOT NULL DEFAULT '',
  education TEXT NOT NULL DEFAULT '{}',
  interests TEXT NOT NULL DEFAULT '[]',
  goals_text TEXT NOT NULL DEFAULT '',
  skills_have TEXT NOT NULL DEFAULT '[]',
  skills_want TEXT NOT NULL DEFAULT '[]',
  industries TEXT NOT NULL DEFAULT '[]',
  learning_prefs TEXT NOT NULL DEFAULT '[]',
  hours_per_week TEXT NOT NULL DEFAULT '',
  mentoring_style TEXT NOT NULL DEFAULT '',
  format_pref TEXT NOT NULL DEFAULT '',
  constraints TEXT NOT NULL DEFAULT '',
  bio TEXT NOT NULL DEFAULT '',
  expertise TEXT NOT NULL DEFAULT '[]',
  mentor_goals TEXT NOT NULL DEFAULT '[]',
  careers TEXT NOT NULL DEFAULT '[]',
  availability TEXT NOT NULL DEFAULT '[]',
  active INTEGER NOT NULL DEFAULT 1,
  completion INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS goals (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  title TEXT NOT NULL,
  rationale TEXT NOT NULL DEFAULT '',
  source TEXT NOT NULL DEFAULT 'user',
  status TEXT NOT NULL DEFAULT 'active',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS career_paths (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  title TEXT NOT NULL,
  why TEXT NOT NULL DEFAULT '',
  skills_have TEXT NOT NULL DEFAULT '[]',
  skills_grow TEXT NOT NULL DEFAULT '[]',
  projects TEXT NOT NULL DEFAULT '[]',
  milestones TEXT NOT NULL DEFAULT '[]',
  effort TEXT NOT NULL DEFAULT '',
  assumptions TEXT NOT NULL DEFAULT '[]',
  tradeoffs TEXT NOT NULL DEFAULT '[]',
  next_action TEXT NOT NULL DEFAULT '',
  engine TEXT NOT NULL DEFAULT 'demo',
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS mentorship_requests (
  id TEXT PRIMARY KEY,
  mentee_id TEXT NOT NULL,
  mentor_id TEXT NOT NULL,
  goal_id TEXT,
  message TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'pending',
  response TEXT NOT NULL DEFAULT '',
  match_score INTEGER,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS match_snapshots (
  mentee_id TEXT NOT NULL,
  mentor_id TEXT NOT NULL,
  score INTEGER NOT NULL,
  confidence TEXT NOT NULL,
  factors TEXT NOT NULL,
  missing TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (mentee_id, mentor_id)
);
CREATE TABLE IF NOT EXISTS roadmap_revisions (
  id TEXT PRIMARY KEY,
  roadmap_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  created_at TEXT NOT NULL,
  reason TEXT NOT NULL,
  changes TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_profiles_role ON profiles (role, active);
CREATE INDEX IF NOT EXISTS idx_goals_user ON goals (user_id, created_at);
CREATE INDEX IF NOT EXISTS idx_paths_user ON career_paths (user_id, created_at);
CREATE INDEX IF NOT EXISTS idx_req_mentee ON mentorship_requests (mentee_id, created_at);
CREATE INDEX IF NOT EXISTS idx_req_mentor ON mentorship_requests (mentor_id, status);
CREATE INDEX IF NOT EXISTS idx_rev_roadmap ON roadmap_revisions (roadmap_id, created_at);
`;

/**
 * Tables added by the trust & continuity upgrade (mentor verification and
 * in-app messaging).
 *
 * All three are `CREATE TABLE IF NOT EXISTS`, so applying them to a database
 * that already holds profiles, roadmaps and requests only adds tables. No row
 * written before this upgrade is renamed, retyped or deleted.
 *
 * `mentor_verifications` is append-only history: a resubmission adds a row and
 * the *latest* row decides the status, so an earlier decision is never
 * overwritten in place and the audit trail survives.
 */
export const TRUST_SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS mentor_verifications (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  status TEXT NOT NULL,
  kind TEXT NOT NULL,
  statement TEXT NOT NULL,
  links TEXT NOT NULL DEFAULT '[]',
  submitted_at TEXT NOT NULL,
  reviewed_at TEXT,
  reviewer_id TEXT,
  decision_note TEXT NOT NULL DEFAULT ''
);
CREATE TABLE IF NOT EXISTS messages (
  id TEXT PRIMARY KEY,
  request_id TEXT NOT NULL,
  sender_id TEXT NOT NULL,
  recipient_id TEXT NOT NULL,
  body TEXT NOT NULL,
  created_at TEXT NOT NULL,
  read_at TEXT
);
CREATE TABLE IF NOT EXISTS action_events (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  action TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_verif_user ON mentor_verifications (user_id, submitted_at);
CREATE INDEX IF NOT EXISTS idx_verif_status ON mentor_verifications (status, submitted_at);
CREATE INDEX IF NOT EXISTS idx_msg_thread ON messages (request_id, created_at);
CREATE INDEX IF NOT EXISTS idx_msg_recipient ON messages (recipient_id, read_at);
CREATE INDEX IF NOT EXISTS idx_action_user ON action_events (user_id, action, created_at);

-- Gap analysis: one row per assessment run, kept so a reload does not spend another
-- model call and so the student can see what they were told and when.
CREATE TABLE IF NOT EXISTS assessments (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  created_at TEXT NOT NULL,
  target_role TEXT NOT NULL,
  provisional INTEGER NOT NULL DEFAULT 0,
  input_hash TEXT NOT NULL,
  payload TEXT NOT NULL,
  engine TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_assess_user ON assessments (user_id, created_at);

-- The adaptation agent writes proposals, never silent edits. A proposal is inert until
-- a human approves it, and the unique idempotency key is what makes executing the same
-- approval twice a no-op instead of a duplicate milestone.
CREATE TABLE IF NOT EXISTS agent_proposals (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  created_at TEXT NOT NULL,
  trigger_kind TEXT NOT NULL,
  trigger_ref TEXT NOT NULL,
  reasoning TEXT NOT NULL,
  evidence TEXT NOT NULL,
  action_kind TEXT NOT NULL,
  action_payload TEXT NOT NULL,
  status TEXT NOT NULL,
  idempotency_key TEXT NOT NULL,
  decided_at TEXT,
  executed_at TEXT,
  result TEXT,
  engine TEXT NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_proposal_idem ON agent_proposals (idempotency_key);
CREATE INDEX IF NOT EXISTS idx_proposal_user ON agent_proposals (user_id, created_at);
`;

export const ADDITIVE_COLUMNS: Record<string, Record<string, string>> = {
  roadmaps: {
    goal_id: 'TEXT',
    rationale: 'TEXT',
    status: "TEXT NOT NULL DEFAULT 'active'",
    updated_at: 'TEXT',
    revision: 'INTEGER NOT NULL DEFAULT 1',
  },
  profiles: {
    // Free text: what the student has built. The only field that can support an
    // "evidenced" finding rather than a self-reported one.
    project_text: "TEXT NOT NULL DEFAULT ''",
    // Set only by the explicit demo seed (worker/lib/demo_seed.ts). Its presence is what
    // lets the interface label seeded data as seeded, so a judge is never shown a sample
    // scenario as if it were the person's own record.
    demo_seeded_at: 'TEXT',
  },
  roadmap_steps: {
    deadline: 'TEXT',
    estimate: 'TEXT',
    updated_at: 'TEXT',
    // 'milestone' | 'task': a milestone groups tasks and is never AI-split.
    kind: "TEXT NOT NULL DEFAULT 'task'",
    origin: "TEXT NOT NULL DEFAULT 'system'",
  },
}

async function columnNames(db: D1Database, table: string): Promise<Set<string>> {
  const { results } = await db.prepare(`PRAGMA table_info(${table})`).all<{ name: string }>()
  return new Set((results ?? []).map((row) => row.name))
}

export async function ensureColumns(
  db: D1Database,
  table: string,
  columns: Record<string, string>,
): Promise<void> {
  const existing = await columnNames(db, table)
  for (const [name, ddl] of Object.entries(columns)) {
    if (existing.has(name)) continue
    await db.prepare(`ALTER TABLE ${table} ADD COLUMN ${name} ${ddl}`).run()
  }
}

export async function ensureSchema(db: D1Database): Promise<void> {
  await db.exec(schemaSqlForExec(SCHEMA_SQL))
  await db.exec(schemaSqlForExec(UPGRADE_SCHEMA_SQL))
  await db.exec(schemaSqlForExec(TRUST_SCHEMA_SQL))
  for (const [table, columns] of Object.entries(ADDITIVE_COLUMNS)) {
    await ensureColumns(db, table, columns)
  }
}

/* ------------------------------------------------------------------ *
 *  Mentor catalog
 * ------------------------------------------------------------------ */

type MentorSeed = Omit<MentorRecord, 'embedding'> & { embedding?: number[] }

/**
 * The directory. Kept in code (not a SQL file) so a rename cannot drift from a
 * copy-paste, and inserted with INSERT OR IGNORE so re-running is safe.
 */
export const MENTOR_SEED: MentorSeed[] = [
  {
    id: 'm-01', name: 'Aarav Mehta', initials: 'AM', year: 'Final year · Computer Science',
    tagline: 'Backend intern turned offer for a junior SDE role. Happy to talk systems and internship loops.',
    skills: ['Distributed systems', 'Databases', 'Data structures'],
    goals: ['internship', 'placement', 'projects'], careers: ['swe'],
    sessions: 42, yearsAhead: 3, rating: 4.9, days: ['Tue', 'Thu', 'Sat'],
    availabilityWindow: 'Tue & Thu · 6 to 9 PM',
    vibeTags: ['structured', 'direct', 'systems first'],
    vibeBlurb: 'Direct and methodical: hands you a checklist and expects you to bring attempts, not questions.',
  },
  {
    id: 'm-02', name: 'Sara Iqbal', initials: 'SI', year: 'Final year · Data Science',
    tagline: 'Research assistant. I help people get past the first scary paper.',
    skills: ['Machine learning', 'Technical writing', 'Competitive programming'],
    goals: ['research', 'grades', 'internship'], careers: ['ml', 'research'],
    sessions: 28, yearsAhead: 3, rating: 4.8, days: ['Mon', 'Wed', 'Sun'],
    availabilityWindow: 'Mon & Wed · 6 to 9 PM',
    vibeTags: ['patient', 'encouraging', 'calm'],
    vibeBlurb: 'Patient and encouraging; turns intimidating topics into a run of small wins.',
  },
  {
    id: 'm-03', name: 'Dev Rangan', initials: 'DR', year: 'Third year · Information Systems',
    tagline: 'Product intern. I break down case interviews into something rehearsable.',
    skills: ['Product sense', 'Frontend', 'Technical writing'],
    goals: ['placement', 'internship', 'projects'], careers: ['product', 'swe'],
    sessions: 19, yearsAhead: 2, rating: 4.7, days: ['Tue', 'Wed', 'Fri'],
    availabilityWindow: 'Tue & Wed · 6 to 9 PM',
    vibeTags: ['coaching', 'structured', 'rehearsal'],
    vibeBlurb: 'Coaches with frameworks and rehearsal drills until the answers feel automatic.',
  },
  {
    id: 'm-04', name: 'Nia Fernandes', initials: 'NF', year: 'Final year · Computer Science',
    tagline: 'Two internships, one very messy first year. I know where the gaps are.',
    skills: ['Data structures', 'Competitive programming', 'Frontend'],
    goals: ['grades', 'placement', 'internship'], careers: ['swe'],
    sessions: 35, yearsAhead: 3, rating: 4.9, days: ['Mon', 'Thu', 'Sat'],
    availabilityWindow: 'Mon & Thu · 6 to 9 PM',
    vibeTags: ['warm', 'honest', 'accountability'],
    vibeBlurb: 'Warm but honest: checks in weekly and will notice if you quietly stopped.',
  },
  {
    id: 'm-05', name: 'Rohan Bhatt', initials: 'RB', year: 'Third year · Electrical Engineering',
    tagline: 'Switched into ML from a branch outside computer science. Ask me about that jump.',
    skills: ['Machine learning', 'Databases', 'Technical writing'],
    goals: ['research', 'projects', 'grades'], careers: ['ml', 'research'],
    sessions: 12, yearsAhead: 2, rating: 4.6, days: ['Wed', 'Fri', 'Sun'],
    availabilityWindow: 'Wed & Fri · 6 to 9 PM',
    vibeTags: ['empathetic', 'motivating', 'career changer'],
    vibeBlurb: 'An empathetic motivator who made a big switch himself and remembers how it felt.',
  },
  {
    id: 'm-06', name: 'Ishita Rao', initials: 'IR', year: 'Final year · Computer Science',
    tagline: 'Open source maintainer. I will get you from tutorial to a merged PR.',
    skills: ['Frontend', 'Distributed systems', 'Technical writing'],
    goals: ['projects', 'internship', 'research'], careers: ['swe', 'product'],
    sessions: 51, yearsAhead: 3, rating: 5.0, days: ['Tue', 'Fri', 'Sat'],
    availabilityWindow: 'Tue & Fri · 6 to 9 PM',
    vibeTags: ['hands on', 'fast paced', 'open source'],
    vibeBlurb: 'Hands on and fast paced; prefers pairing on a real issue over abstract advice.',
  },
  {
    id: 'm-07', name: 'Kabir Shah', initials: 'KS', year: 'Fourth year · Computer Science',
    tagline: 'Took two attempts at data structures. The second one worked: ask me why.',
    skills: ['Data structures', 'Competitive programming', 'Databases'],
    goals: ['grades', 'placement', 'internship'], careers: ['swe'],
    sessions: 23, yearsAhead: 3, rating: 4.7, days: ['Mon', 'Tue', 'Thu'],
    availabilityWindow: 'Mon & Tue · 6 to 9 PM',
    vibeTags: ['resilient', 'practical', 'no nonsense'],
    vibeBlurb: 'Practical and no nonsense; treats a failed attempt as data rather than a verdict.',
  },
  {
    id: 'm-08', name: 'Meera Krishnan', initials: 'MK', year: 'Final year · Information Systems',
    tagline: 'Technical writing lead. I help people explain their own projects clearly.',
    skills: ['Technical writing', 'Product sense', 'Frontend'],
    goals: ['projects', 'placement', 'research'], careers: ['product', 'research'],
    sessions: 31, yearsAhead: 3, rating: 4.8, days: ['Wed', 'Thu', 'Sun'],
    availabilityWindow: 'Wed & Thu · 6 to 9 PM',
    vibeTags: ['clear', 'calm', 'reflective'],
    vibeBlurb: 'Calm and clear; helps you find the words for work you already did.',
  },
  {
    id: 'm-09', name: 'Tanvi Deshmukh', initials: 'TD', year: 'Third year · Data Science',
    tagline: 'Halfway through my first research project. Happy to share the map I drew.',
    skills: ['Machine learning', 'Distributed systems', 'Technical writing'],
    goals: ['research', 'projects', 'grades'], careers: ['ml', 'research'],
    sessions: 9, yearsAhead: 2, rating: 4.6, days: ['Mon', 'Wed', 'Sat'],
    availabilityWindow: 'Mon & Wed · 6 to 9 PM',
    vibeTags: ['peer', 'collaborative', 'curious'],
    vibeBlurb: 'A near peer collaborator; happier figuring the problem out alongside you than lecturing.',
  },
]

let seeded = false

export async function ensureSeeded(db: D1Database): Promise<void> {
  if (seeded) return
  const stmts = MENTOR_SEED.map((m) =>
    db
      .prepare(
        `INSERT OR IGNORE INTO mentors
         (id, name, initials, year, tagline, skills, goals, careers, days, sessions, years_ahead, rating, availability_window, vibe_tags, vibe_blurb, embedding)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .bind(
        m.id, m.name, m.initials, m.year, m.tagline,
        JSON.stringify(m.skills), JSON.stringify(m.goals), JSON.stringify(m.careers), JSON.stringify(m.days),
        m.sessions, m.yearsAhead, m.rating, m.availabilityWindow,
        JSON.stringify(m.vibeTags), m.vibeBlurb,
        m.embedding ? JSON.stringify(m.embedding) : null,
      ),
  )
  await db.batch(stmts)
  seeded = true
}

/* ------------------------------------------------------------------ *
 *  Row mapping
 * ------------------------------------------------------------------ */

export type MentorRow = {
  id: string; name: string; initials: string; year: string; tagline: string
  skills: string; goals: string; careers: string; days: string
  sessions: number; years_ahead: number; rating: number
  availability_window: string; vibe_tags: string; vibe_blurb: string
  embedding: string | null
}

export function rowToMentor(row: MentorRow): MentorRecord {
  return {
    id: row.id,
    name: row.name,
    initials: row.initials,
    year: row.year,
    tagline: row.tagline,
    skills: JSON.parse(row.skills) as string[],
    goals: JSON.parse(row.goals) as string[],
    careers: JSON.parse(row.careers) as string[],
    days: JSON.parse(row.days) as string[],
    sessions: row.sessions,
    yearsAhead: row.years_ahead,
    rating: row.rating,
    availabilityWindow: row.availability_window,
    vibeTags: JSON.parse(row.vibe_tags) as string[],
    vibeBlurb: row.vibe_blurb,
    embedding: row.embedding ? (JSON.parse(row.embedding) as number[]) : null,
  }
}

export async function listMentors(db: D1Database): Promise<MentorRecord[]> {
  const { results } = await db.prepare('SELECT * FROM mentors ORDER BY id').all<MentorRow>()
  return (results ?? []).map(rowToMentor)
}

export async function saveMentorEmbedding(db: D1Database, id: string, embedding: number[]): Promise<void> {
  await db.prepare('UPDATE mentors SET embedding = ? WHERE id = ?').bind(JSON.stringify(embedding), id).run()
}

/* ------------------------------------------------------------------ *
 *  Agent events
 * ------------------------------------------------------------------ */

export async function recordEvent(
  db: D1Database,
  userId: string,
  kind: string,
  title: string,
  detail: string,
): Promise<void> {
  await db
    .prepare('INSERT INTO agent_events (id, user_id, created_at, kind, title, detail) VALUES (?, ?, ?, ?, ?, ?)')
    .bind(crypto.randomUUID(), userId, new Date().toISOString(), kind, title, detail)
    .run()
}
