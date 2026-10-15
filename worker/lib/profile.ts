/**
 * User profiles and the server side role.
 *
 * This module is the one authority on what a user *is*. `profiles.role` is
 * written only from a validated onboarding request, is never echoed from a
 * client field, and is what every authorization check reads:
 *
 *  - `role === 'mentor'` is the only way to enter the mentor pool, see incoming
 *    requests, or answer one.
 *  - an unset role ('') has mentee privileges and nothing more, so a new account
 *    cannot sign up as an admin or promote itself by editing a request body.
 *  - the browser's remembered role (`localStorage`) is a display hint and is
 *    deliberately not consulted here.
 *
 * Completion is computed from stored fields only, so the "profile is 60% done"
 * number the UI shows is a fact about the row rather than a claim.
 */

export const ROLES = ['mentee', 'mentor'] as const
export type Role = (typeof ROLES)[number]

/** A day name the availability fields accept. Mirrors the frontend's Day type. */
export const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'] as const

export type Education = { institution: string; program: string; year: string }

export type Profile = {
  userId: string
  role: Role | ''
  displayName: string
  email: string
  education: Education
  interests: string[]
  goalsText: string
  skillsHave: string[]
  skillsWant: string[]
  industries: string[]
  learningPrefs: string[]
  hoursPerWeek: string
  mentoringStyle: string
  formatPref: string
  constraints: string
  bio: string
  /** What they have built, in their own words. Feeds evidence based gap analysis. */
  projectText: string
  /**
   * Set when the labeled demo scenario was seeded into this account, never by a client.
   * Absent and null both mean the same thing: this account holds no seeded sample data.
   */
  demoSeededAt?: string | null
  expertise: string[]
  mentorGoals: string[]
  careers: string[]
  availability: string[]
  active: boolean
  completion: number
  createdAt: string
  updatedAt: string
}

export type ProfilePatch = Partial<
  Omit<Profile, 'userId' | 'completion' | 'createdAt' | 'updatedAt' | 'demoSeededAt'>
>

type ProfileRow = {
  user_id: string
  role: string
  display_name: string
  email: string
  education: string
  interests: string
  goals_text: string
  skills_have: string
  skills_want: string
  industries: string
  learning_prefs: string
  hours_per_week: string
  mentoring_style: string
  format_pref: string
  constraints: string
  bio: string
  project_text: string
  demo_seeded_at?: string | null
  expertise: string
  mentor_goals: string
  careers: string
  availability: string
  active: number
  completion: number
  created_at: string
  updated_at: string
}

const isRole = (value: string): value is Role => (ROLES as readonly string[]).includes(value)

/**
 * A malformed JSON column reads as its empty value.
 *
 * The columns are written by this module only, but a hand-edited row must not be
 * able to crash a page: an empty list is a smaller lie than an exception.
 */
function json<T>(raw: string, fallback: T): T {
  try {
    const parsed = JSON.parse(raw)
    return (parsed ?? fallback) as T
  } catch {
    return fallback
  }
}

function rowToProfile(row: ProfileRow): Profile {
  return {
    userId: row.user_id,
    role: isRole(row.role) ? row.role : '',
    displayName: row.display_name,
    email: row.email,
    education: json<Education>(row.education, { institution: '', program: '', year: '' }),
    interests: json<string[]>(row.interests, []),
    goalsText: row.goals_text,
    skillsHave: json<string[]>(row.skills_have, []),
    skillsWant: json<string[]>(row.skills_want, []),
    industries: json<string[]>(row.industries, []),
    learningPrefs: json<string[]>(row.learning_prefs, []),
    hoursPerWeek: row.hours_per_week,
    mentoringStyle: row.mentoring_style,
    formatPref: row.format_pref,
    constraints: row.constraints,
    bio: row.bio,
    projectText: row.project_text ?? '',
    demoSeededAt: row.demo_seeded_at ?? null,
    expertise: json<string[]>(row.expertise, []),
    mentorGoals: json<string[]>(row.mentor_goals, []),
    careers: json<string[]>(row.careers, []),
    availability: json<string[]>(row.availability, []),
    active: row.active === 1,
    completion: row.completion,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

export async function loadProfile(db: D1Database, userId: string): Promise<Profile | null> {
  const row = await db.prepare('SELECT * FROM profiles WHERE user_id = ?').bind(userId).first<ProfileRow>()
  return row ? rowToProfile(row) : null
}

/**
 * Reads the caller's profile, creating an empty one on first contact.
 *
 * A missing row is not an error: it means "has not onboarded", and the app needs
 * a stable object to render that state from. It is created with an unset role,
 * so it confers nothing.
 */
export async function ensureProfile(
  db: D1Database,
  userId: string,
  identity: { email?: string; name?: string } = {},
): Promise<Profile> {
  const existing = await loadProfile(db, userId)
  if (existing) return existing

  const now = new Date().toISOString()
  await db
    .prepare(
      `INSERT OR IGNORE INTO profiles
       (user_id, role, display_name, email, created_at, updated_at)
       VALUES (?, '', ?, ?, ?, ?)`,
    )
    .bind(userId, identity.name?.trim() ?? '', identity.email?.trim() ?? '', now, now)
    .run()

  const created = await loadProfile(db, userId)
  if (created) return created
  // A read that follows a successful insert cannot reasonably be empty; if it
  // is, surface it rather than inventing a profile object.
  throw new Error('profile row could not be created')
}

/**
 * Applies a validated patch.
 *
 * The role is special-cased: it may be set once, from an unset value, and never
 * changed afterwards. That is what makes "role cannot be escalated from the
 * client" true even for a caller who owns the account: a mentee account stays a
 * mentee account unless a future moderator workflow says otherwise.
 */
export async function saveProfile(
  db: D1Database,
  profile: Profile,
  patch: ProfilePatch,
): Promise<{ profile: Profile; roleChange: 'set' | 'unchanged' | 'rejected' | 'none' }> {
  const next: Profile = { ...profile, ...patch }
  let roleChange: 'set' | 'unchanged' | 'rejected' | 'none' = 'none'

  if (patch.role !== undefined) {
    if (profile.role === '') {
      next.role = patch.role
      roleChange = 'set'
    } else if (profile.role === patch.role) {
      roleChange = 'unchanged'
    } else {
      roleChange = 'rejected'
      next.role = profile.role
    }
  } else {
    next.role = profile.role
  }

  next.completion = computeCompletion(next)
  next.updatedAt = new Date().toISOString()

  await db
    .prepare(
      `UPDATE profiles SET
         role = ?, display_name = ?, email = ?, education = ?, interests = ?, goals_text = ?,
         skills_have = ?, skills_want = ?, industries = ?, learning_prefs = ?, hours_per_week = ?,
         mentoring_style = ?, format_pref = ?, constraints = ?, bio = ?, expertise = ?,
         mentor_goals = ?, careers = ?, availability = ?, active = ?, completion = ?,
         project_text = ?, updated_at = ?
       WHERE user_id = ?`,
    )
    .bind(
      next.role,
      next.displayName,
      next.email,
      JSON.stringify(next.education),
      JSON.stringify(next.interests),
      next.goalsText,
      JSON.stringify(next.skillsHave),
      JSON.stringify(next.skillsWant),
      JSON.stringify(next.industries),
      JSON.stringify(next.learningPrefs),
      next.hoursPerWeek,
      next.mentoringStyle,
      next.formatPref,
      next.constraints,
      next.bio,
      JSON.stringify(next.expertise),
      JSON.stringify(next.mentorGoals),
      JSON.stringify(next.careers),
      JSON.stringify(next.availability),
      next.active ? 1 : 0,
      next.completion,
      next.projectText,
      next.updatedAt,
      next.userId,
    )
    .run()

  return { profile: next, roleChange }
}

/* ------------------------------------------------------------------ *
 *  Completion: computed, never claimed
 * ------------------------------------------------------------------ */

/** A field counts as filled when it is a non-empty string or a non-empty list. */
const filled = (value: string | string[]): boolean =>
  Array.isArray(value) ? value.length > 0 : value.trim().length > 0

const pct = (have: number, total: number) => (total === 0 ? 0 : Math.round((have / total) * 100))

/**
 * Share of the fields that matter for this role.
 *
 * Mentee and mentor are weighted differently on purpose: a mentor without
 * expertise or availability is not a usable mentor, while a mentee without a bio
 * is perfectly fine. The percentages drive the *UI's* progress bar; eligibility
 * for matching is the stricter `mentorReadiness` below.
 */
export function computeCompletion(profile: Profile): number {
  if (profile.role === 'mentor') {
    const fields = [
      profile.displayName,
      profile.education.program,
      profile.bio,
      profile.expertise,
      profile.mentorGoals,
      profile.careers,
      profile.availability,
      profile.mentoringStyle,
    ]
    return pct(fields.filter(filled).length, fields.length)
  }

  const fields = [
    profile.displayName,
    profile.education.program,
    profile.goalsText,
    profile.interests,
    profile.skillsHave,
    profile.skillsWant,
    profile.industries,
    profile.hoursPerWeek,
    profile.mentoringStyle,
    profile.learningPrefs,
  ]
  return pct(fields.filter(filled).length, fields.length)
}

/**
 * Whether a mentor profile is complete enough to be matched and requested.
 *
 * This is the hard gate for Stage A eligibility, and it is stricter than
 * `completion` on purpose: a "80% complete" mentor with no listed expertise or
 * availability would produce a match nobody can act on. Both numbers are derived
 * from stored fields, so neither can be inflated from the client.
 */
export function mentorReadiness(profile: Profile): { ready: boolean; missing: string[] } {
  const missing: string[] = []
  if (profile.role !== 'mentor') missing.push('role')
  if (!profile.active) missing.push('active')
  if (!filled(profile.displayName)) missing.push('name')
  if (!filled(profile.bio) || profile.bio.trim().length < 20) missing.push('bio')
  if (profile.expertise.length === 0) missing.push('expertise')
  if (profile.mentorGoals.length === 0 && profile.careers.length === 0) missing.push('focus')
  if (profile.availability.length === 0) missing.push('availability')
  return { ready: missing.length === 0, missing }
}

/** The mentor pool: real accounts, mentors only, active only. */
export async function listMentorProfiles(db: D1Database): Promise<Profile[]> {
  const { results } = await db
    .prepare("SELECT * FROM profiles WHERE role = 'mentor' AND active = 1 ORDER BY updated_at DESC LIMIT 200")
    .all<ProfileRow>()
  return (results ?? []).map(rowToProfile)
}

/**
 * The minimum a mentor needs about a mentee they are actually mentoring.
 *
 * Email, constraints and free-text notes stay out. A mentor sees the name, the
 * programme, the goal they agreed to help with and the skills involved: which
 * is what the relationship needs and nothing more.
 */
export function menteeSummary(profile: Profile) {
  return {
    userId: profile.userId,
    name: profile.displayName || 'A student',
    program: profile.education.program || '',
    year: profile.education.year || '',
    skillsHave: profile.skillsHave.slice(0, 12),
    skillsWant: profile.skillsWant.slice(0, 12),
    goal: profile.goalsText.slice(0, 240),
  }
}
