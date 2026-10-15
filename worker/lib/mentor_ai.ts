/**
 * AI assistance for mentors: session preparation.
 *
 * The mentor is the decision-maker; this produces a draft they can ignore. It
 * reads only what the relationship already entitles the mentor to see: the
 * mentee's shared summary (name, programme, skills, stated goal) and the
 * milestone counts for the goal of the accepted request. It does not read
 * private conversations, and there is no path here to any other mentee's data.
 *
 * Like every other feature, the model call goes through `lib/ai/provider.ts`:
 * metered, deduplicated, timeout-bounded, schema-validated, and honest when no
 * provider is configured. The deterministic fallback is reachable only under
 * `AI_DEMO_MODE` and is always labelled `engine: 'demo'`.
 */

import { aiConfig } from './ai/config'
import { generateJson } from './ai/provider'
import { arr, num, spec, str, type Spec } from './ai/schema'
import { demoMentorPrep, type Engine, type MentorPrep } from './demo'
import { loadProfile } from './profile'
import { RequestError } from './requests'
import type { Env } from '../env'

export type SessionPrep = MentorPrep & { engine: Engine }

const SESSION_SPEC: Spec = spec(
  {
    focus: str('One sentence: what this session should be about'),
    agenda: arr(
      {
        kind: 'object',
        fields: {
          title: str(),
          detail: str('One or two sentences the mentor can act on'),
          minutes: num('Integer minutes, 5..45', { min: 5, max: 45, integer: true }),
        },
        required: ['title', 'detail', 'minutes'],
      },
      { max: 6 },
    ),
    questions: arr(str('A question the mentor can ask, in the mentor\'s voice'), { max: 8 }),
    nextSteps: arr(str('Concrete, small, and completable by the student'), { max: 6 }),
    watchOuts: arr(str('Risk or caution worth stating plainly, including when data is thin'), { max: 4 }),
  },
  ['focus', 'agenda', 'questions'],
)

/**
 * The mentor of an accepted request only.
 *
 * Read from `mentorship_requests`, so the check cannot be satisfied by anything
 * the client sends.
 */
async function assertMentorship(db: D1Database, mentorId: string, menteeId: string): Promise<{ goalId: string | null }> {
  const row = await db
    .prepare(
      `SELECT id, goal_id FROM mentorship_requests
       WHERE mentor_id = ? AND mentee_id = ? AND status = 'accepted' LIMIT 1`,
    )
    .bind(mentorId, menteeId)
    .first<{ id: string; goal_id: string | null }>()
  if (!row) {
    throw new RequestError('You can only prepare for a student whose request you have accepted.', 403)
  }
  return { goalId: row.goal_id }
}

async function sharedContext(db: D1Database, menteeId: string, goalId: string | null) {
  const profile = await loadProfile(db, menteeId)
  if (!profile) throw new RequestError('That student no longer has a profile.', 404)

  let goalTitle = ''
  if (goalId) {
    const goal = await db.prepare('SELECT title FROM goals WHERE id = ? AND user_id = ?').bind(goalId, menteeId).first<{ title: string }>()
    goalTitle = goal?.title ?? ''
  }
  if (!goalTitle) goalTitle = profile.goalsText.split('\n')[0]?.slice(0, 160) ?? ''

  let milestonesDone = 0
  let milestonesTotal = 0
  if (goalId) {
    const row = await db
      .prepare(
        `SELECT
           COUNT(*) AS total,
           SUM(CASE WHEN s.status = 'done' THEN 1 ELSE 0 END) AS done
         FROM roadmaps rm JOIN roadmap_steps s ON s.roadmap_id = rm.id
         WHERE rm.user_id = ? AND rm.goal_id = ?`,
      )
      .bind(menteeId, goalId)
      .first<{ total: number | null; done: number | null }>()
    milestonesTotal = row?.total ?? 0
    milestonesDone = row?.done ?? 0
  }

  return { profile, goalTitle, milestonesDone, milestonesTotal }
}

export async function prepareSession(env: Env, mentorId: string, menteeId: string): Promise<SessionPrep> {
  const { goalId } = await assertMentorship(env.DB, mentorId, menteeId)
  const { profile, goalTitle, milestonesDone, milestonesTotal } = await sharedContext(env.DB, menteeId, goalId)

  const input = {
    menteeName: profile.displayName || 'your student',
    goalTitle,
    skillsHave: profile.skillsHave,
    skillsWant: profile.skillsWant,
    milestonesDone,
    milestonesTotal,
  }

  let prep: MentorPrep = demoMentorPrep(input)
  let engine: Engine = 'demo'

  try {
    const out = await generateJson<MentorPrep>(env, { userId: mentorId, feature: 'mentor_session_prep' }, {
      parts: [
        {
          text: [
            'Draft a mentoring session plan from the notes a student shared with their mentor.',
            '',
            `Student: ${input.menteeName}`,
            `Programme: ${[profile.education.program, profile.education.year].filter(Boolean).join(' · ') || '(not recorded)'}`,
            `Stated goal: ${goalTitle || '(none recorded)'}`,
            `Skills they have: ${profile.skillsHave.join(', ') || '(none recorded)'}`,
            `Skills they want: ${profile.skillsWant.join(', ') || '(none recorded)'}`,
            `Roadmap progress for this goal: ${milestonesDone} of ${milestonesTotal} steps done`,
          ].join('\n'),
        },
      ],
      spec: SESSION_SPEC,
      system:
        'You help a student mentor prepare. Use only the notes provided; never invent facts about the student, never promise employment or grades, and never present an assumption as knowledge. If the notes are thin, say so in watchOuts and keep the plan small.',
      temperature: 0.4,
      dedupeMaterial: `mentor-prep:${mentorId}:${menteeId}:${goalTitle}:${milestonesDone}/${milestonesTotal}`,
    })
    prep = {
      focus: String(out.value.focus ?? prep.focus),
      agenda: Array.isArray(out.value.agenda) && out.value.agenda.length > 0 ? out.value.agenda : prep.agenda,
      questions: Array.isArray(out.value.questions) && out.value.questions.length > 0 ? out.value.questions : prep.questions,
      nextSteps: Array.isArray(out.value.nextSteps) ? out.value.nextSteps : prep.nextSteps,
      watchOuts: Array.isArray(out.value.watchOuts) ? out.value.watchOuts : prep.watchOuts,
    }
    engine = 'gemini'
  } catch (error) {
    if (!aiConfig(env).demoMode) throw error
  }

  return { ...prep, engine }
}
