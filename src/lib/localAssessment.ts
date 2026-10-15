/**
 * The analysis the Assessment screen runs when no server can answer.
 *
 * Why this exists: every other analysis in this app is produced by the Worker, and the
 * published build is a static site with no Worker behind it (the preview here has none
 * either), so `/api/assessment` can never answer. Without this the screen could only say
 * "the backend is not answering", which is useless to the person reading it.
 *
 * What it is, and is not:
 *  - It is the same deterministic rules the server falls back to when no provider key is
 *    configured, not a new invention. The source of truth is
 *    `worker/lib/assessment.ts` (`assessReadiness`, `enforceEvidence`) and
 *    `worker/lib/demo.ts` (`demoAssessment`); this file mirrors them, and
 *    `localAssessment.test.ts` pins the two rules that decide whether a result is honest
 *    at all: the readiness gate, and the evidenced to self reported downgrade.
 *  - It never calls a model and never claims to. `engine` is always `demo`, the screen
 *    labels it as computed in the browser, and nothing is saved anywhere.
 *  - Every finding stays tied to something the person typed. Anything that would have to
 *    be inferred becomes a question to answer instead of an assertion.
 *
 * If the server's rules change, change both. The two must not drift.
 */
import type { Assessment, AssessmentResponse } from './api.ts'

/** The shortest description of real work that can support an evidence claim. */
export const EVIDENCE_MIN_CHARS = 40

export type LocalAssessmentInput = {
  goalText: string
  skillsHave: string[]
  skillsWant: string[]
  hoursPerWeek: string
  projectText: string
  /**
   * Not collected by the form. The server reads it from the stored profile; when it is
   * absent the "what you are interested in" improvement is left out rather than asked
   * for a field this screen has no way to fill.
   */
  interests?: string[]
}

export type LocalReadiness = {
  ready: boolean
  provisional: boolean
  missing: string[]
  improvements: string[]
}

/** The notice shown under a result, so the local run is never mistaken for the server's. */
export const LOCAL_ASSESSMENT_NOTE =
  'Computed by the deterministic demo engine in your browser, because the server that stores analyses could not be reached. It is a reading of the answers you typed, not model output, and nothing was saved.'

/**
 * Can this input support an honest analysis? Same two requirements as the server: a
 * direction, and something about what the person can already do.
 */
export function localReadiness(input: LocalAssessmentInput): LocalReadiness {
  const missing: string[] = []
  const improvements: string[] = []

  if (input.goalText.trim().length < 10) {
    missing.push('the direction or role you are aiming at, in your own words')
  }
  const hasSkills = input.skillsHave.length > 0
  const hasWork = input.projectText.trim().length >= EVIDENCE_MIN_CHARS
  if (!hasSkills && !hasWork) {
    missing.push('a few things you can already do, or a description of something you have built')
  }

  if (input.skillsHave.length < 3) improvements.push('a few more of the skills you already have')
  if (!hasWork) {
    improvements.push('a description of something you have built, however small, so findings can be evidenced')
  }
  if (!input.hoursPerWeek.trim()) improvements.push('how many hours a week you can realistically give this')
  if (input.skillsWant.length === 0) improvements.push('what you want to be able to do that you cannot do yet')
  if (input.interests && input.interests.length === 0) improvements.push('what you are actually interested in')

  const ready = missing.length === 0
  const provisional = !ready || !hasWork || !input.hoursPerWeek.trim()

  return { ready, provisional, missing, improvements }
}

/** One reading of the input. Deterministic: the same answers produce the same result. */
export function localAssessment(input: LocalAssessmentInput, now = new Date()): AssessmentResponse {
  const readiness = localReadiness(input)

  if (!readiness.ready) {
    return {
      ok: true,
      needsMoreInfo: true,
      missing: readiness.missing,
      improvements: readiness.improvements,
      note: 'There is not enough here yet to say anything useful. Answer these and run it again.',
    }
  }

  const goal = input.goalText.trim() || 'the direction you named'
  const have = input.skillsHave.length ? input.skillsHave : ['what you already do']
  const want = input.skillsWant.length ? input.skillsWant : ['the skill your goal depends on']
  const project = input.projectText.trim()
  const hasWork = project.length >= EVIDENCE_MIN_CHARS

  let strengths = have.slice(0, 4).map((skill, index) => ({
    skill,
    evidence: project
      ? `You listed ${skill} and described work you have done, so treat it as usable until you show it in an interview.`
      : `You listed ${skill}. Nothing you wrote shows it in use yet, so this is your own report.`,
    confidence: project ? 0.6 - index * 0.05 : 0.35 - index * 0.05,
    source: (project ? 'evidenced' : 'self_reported') as 'evidenced' | 'self_reported',
  }))

  let gaps = want.slice(0, 4).map((skill, index) => ({
    skill,
    why: `${skill} appears in what you said you want, and the goal you named (${goal}) depends on being able to show it.`,
    evidence: `Named as a gap by you. No artifact in your profile demonstrates ${skill} yet.`,
    priority: (index === 0 ? 'high' : index === 1 ? 'medium' : 'low') as 'high' | 'medium' | 'low',
    confidence: 0.5 - index * 0.05,
    exercises: [
      `Build the smallest thing that is impossible without ${skill}, and write down what broke.`,
      `Write a short page explaining ${skill} in your own words, with one example from your own work.`,
    ],
  }))

  // The same evidence rule the server enforces: nothing shows a listed skill in use, so
  // nothing may be called evidenced, and its confidence is capped.
  let downgraded = 0
  strengths = strengths.map((finding) => {
    if (finding.source === 'evidenced' && !hasWork) {
      downgraded += 1
      return {
        ...finding,
        source: 'self_reported' as const,
        evidence: `${finding.evidence} No finished work is described in your profile, so this rests on your own report.`,
        confidence: Math.min(finding.confidence, 0.4),
      }
    }
    return finding
  })

  // A skill cannot be both something held and something missing.
  const held = new Set(strengths.map((finding) => finding.skill.trim().toLowerCase()))
  const keptGaps = gaps.filter((gap) => !held.has(gap.skill.trim().toLowerCase()))
  gaps = keptGaps.length > 0 ? keptGaps : gaps

  const assessment: Assessment = {
    id: `local-${now.getTime()}`,
    createdAt: now.toISOString(),
    engine: 'demo',
    provisional: readiness.provisional,
    downgraded,
    targetRole: input.goalText.trim(),
    summary: `Working towards ${goal} from ${have.join(', ')}. ${gaps.length} areas to build, ${strengths.length} you can already use. The demo engine produced this in your browser from what you typed, so it is a reading of your answers rather than a judgement about you.`,
    strengths,
    gaps,
    assumptions: [
      'Built only from the answers in the form above.',
      input.hoursPerWeek ? `Assumes about ${input.hoursPerWeek} of study time a week.` : 'No weekly time was given.',
      project ? 'Assumes the work you described is your own.' : 'Assumes your skills list is honest.',
    ],
    questionsToStrengthen: [
      'What have you built that you would show a stranger? Link it or describe it.',
      'Which of the skills you listed have you used to finish something, rather than just learned?',
      'What is the next concrete thing you want to be able to do?',
    ],
  }

  return {
    ok: true,
    needsMoreInfo: false,
    assessment,
    history: [],
    note: LOCAL_ASSESSMENT_NOTE,
    cached: false,
    readiness,
  }
}
