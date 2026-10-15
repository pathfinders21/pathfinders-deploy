/**
 * The mentor contribution record.
 *
 * This exists because a mentor's reason to participate has to be *visible*.
 * Everything here is derived from rows the platform already stores, and nothing
 * is invented: no hours, no badges, no certificates, no "impact score". Where the
 * data needed for a number does not exist, the number is `null` and the UI is
 * expected to say "not tracked" rather than print a zero that reads as failure.
 *
 * What each figure is derived from is returned in `basis` so the renderer can
 * state it next to the number instead of asserting something the data does not
 * support.
 */

import type { Profile } from './profile'

export type MentorshipRecord = {
  requestId: string
  mentee: { id: string; name: string; program: string; year: string }
  goalTitle: string | null
  acceptedAt: string
  /** Milestones in the roadmap that belongs to the goal this mentor accepted. */
  milestones: { total: number; done: number } | null
  /** Progress check-ins the mentee logged after this mentorship was accepted. */
  checkIns: number
  lastActivityAt: string | null
  unreadMessages: number
}

export type Portfolio = {
  totals: {
    activeMentorships: number
    acceptedLifetime: number
    declinedLifetime: number
    withdrawnLifetime: number
    menteesSupported: number
    milestonesCompleted: number
    checkInsRecorded: number
    unreadMessages: number
    mentoringSince: string | null
  }
  records: MentorshipRecord[]
  /** Exactly what the numbers are computed from, for display beside them. */
  basis: string[]
  declared: {
    expertise: string[]
    industries: string[]
    availability: string[]
    mentoringStyle: string
    hoursPerWeek: string
  }
}

type EducationShape = { program?: string; year?: string }

function parseEducation(raw: string): EducationShape {
  try {
    const parsed = JSON.parse(raw)
    return parsed && typeof parsed === 'object' ? (parsed as EducationShape) : {}
  } catch {
    return {}
  }
}

export async function mentorPortfolio(db: D1Database, profile: Profile): Promise<Portfolio> {
  const mentorId = profile.userId

  const counts = await db
    .prepare('SELECT status, COUNT(*) AS n FROM mentorship_requests WHERE mentor_id = ? GROUP BY status')
    .bind(mentorId)
    .all<{ status: string; n: number }>()
  const byStatus = new Map((counts.results ?? []).map((r) => [r.status, r.n]))

  const { results: accepted } = await db
    .prepare(
      `SELECT r.id, r.mentee_id, r.goal_id, r.created_at, r.updated_at, g.title AS goal_title
       FROM mentorship_requests r
       LEFT JOIN goals g ON g.id = r.goal_id
       WHERE r.mentor_id = ? AND r.status = 'accepted'
       ORDER BY r.updated_at DESC
       LIMIT 100`,
    )
    .bind(mentorId)
    .all<{
      id: string
      mentee_id: string
      goal_id: string | null
      created_at: string
      updated_at: string
      goal_title: string | null
    }>()

  const rows = accepted ?? []
  const menteeIds = [...new Set(rows.map((r) => r.mentee_id))]

  const people = new Map<string, { name: string; program: string; year: string }>()
  if (menteeIds.length > 0) {
    const placeholders = menteeIds.map(() => '?').join(',')
    const { results } = await db
      .prepare(`SELECT user_id, display_name, education FROM profiles WHERE user_id IN (${placeholders})`)
      .bind(...menteeIds)
      .all<{ user_id: string; display_name: string; education: string }>()
    for (const row of results ?? []) {
      const education = parseEducation(row.education)
      people.set(row.user_id, {
        name: row.display_name || 'A student',
        program: education.program ?? '',
        year: education.year ?? '',
      })
    }
  }

  // Milestones, grouped by the goal the mentorship is about. A request with no
  // goal yields `null` rather than a fabricated count.
  const milestonesByGoal = new Map<string, { total: number; done: number }>()
  const goals = [...new Set(rows.map((r) => r.goal_id).filter((g): g is string => Boolean(g)))]
  if (goals.length > 0 && menteeIds.length > 0) {
    const goalPlaceholders = goals.map(() => '?').join(',')
    const menteePlaceholders = menteeIds.map(() => '?').join(',')
    const { results } = await db
      .prepare(
        `SELECT rm.goal_id AS goal_id, s.status AS status, s.updated_at AS updated_at
         FROM roadmaps rm
         JOIN roadmap_steps s ON s.roadmap_id = rm.id
         WHERE rm.goal_id IN (${goalPlaceholders}) AND rm.user_id IN (${menteePlaceholders})`,
      )
      .bind(...goals, ...menteeIds)
      .all<{ goal_id: string; status: string; updated_at: string | null }>()
    for (const row of results ?? []) {
      const entry = milestonesByGoal.get(row.goal_id) ?? { total: 0, done: 0 }
      entry.total += 1
      if (row.status === 'done') entry.done += 1
      milestonesByGoal.set(row.goal_id, entry)
    }
  }

  // Check-ins: the mentee's own logged progress updates, counted only after the
  // relationship was accepted.
  const checkIns = new Map<string, { count: number; last: string | null }>()
  if (menteeIds.length > 0) {
    const placeholders = menteeIds.map(() => '?').join(',')
    const { results } = await db
      .prepare(`SELECT user_id, created_at FROM standups WHERE user_id IN (${placeholders}) ORDER BY created_at DESC LIMIT 500`)
      .bind(...menteeIds)
      .all<{ user_id: string; created_at: string }>()
    for (const row of results ?? []) {
      const acceptedAt = rows.find((r) => r.mentee_id === row.user_id)?.updated_at ?? ''
      if (acceptedAt && row.created_at < acceptedAt) continue
      const entry = checkIns.get(row.user_id) ?? { count: 0, last: null }
      entry.count += 1
      entry.last = entry.last && entry.last > row.created_at ? entry.last : row.created_at
      checkIns.set(row.user_id, entry)
    }
  }

  const unread = await db
    .prepare('SELECT COUNT(*) AS n FROM messages WHERE recipient_id = ? AND read_at IS NULL')
    .bind(mentorId)
    .first<{ n: number }>()

  const records: MentorshipRecord[] = rows.map((row) => {
    const person = people.get(row.mentee_id) ?? { name: 'A student', program: '', year: '' }
    const milestone = row.goal_id ? milestonesByGoal.get(row.goal_id) ?? { total: 0, done: 0 } : null
    const checkIn = checkIns.get(row.mentee_id)
    const candidates = [row.updated_at, checkIn?.last ?? null].filter((v): v is string => Boolean(v))
    return {
      requestId: row.id,
      mentee: { id: row.mentee_id, ...person },
      goalTitle: row.goal_title,
      acceptedAt: row.updated_at || row.created_at,
      milestones: milestone,
      checkIns: checkIn?.count ?? 0,
      lastActivityAt: candidates.sort().at(-1) ?? null,
      unreadMessages: 0,
    }
  })

  const milestonesCompleted = records.reduce((sum, r) => sum + (r.milestones?.done ?? 0), 0)
  const firstAccepted = rows.length > 0 ? rows[rows.length - 1].updated_at || rows[rows.length - 1].created_at : null

  return {
    totals: {
      activeMentorships: rows.length,
      acceptedLifetime: byStatus.get('accepted') ?? 0,
      declinedLifetime: byStatus.get('declined') ?? 0,
      withdrawnLifetime: byStatus.get('withdrawn') ?? 0,
      menteesSupported: menteeIds.length,
      milestonesCompleted,
      checkInsRecorded: records.reduce((sum, r) => sum + r.checkIns, 0),
      unreadMessages: unread?.n ?? 0,
      mentoringSince: firstAccepted,
    },
    records,
    basis: [
      'Mentorships are counted from requests you accepted: nothing is recorded until you accept one.',
      'Milestones are the completed steps in the roadmap the student built for the goal you accepted.',
      'Check ins are progress updates the student logged themselves after you accepted.',
      'No hours are logged, no badges are issued, and no certificate or credit is implied by any figure here.',
    ],
    declared: {
      expertise: profile.expertise,
      industries: profile.industries,
      availability: profile.availability,
      mentoringStyle: profile.mentoringStyle,
      hoursPerWeek: profile.hoursPerWeek,
    },
  }
}
