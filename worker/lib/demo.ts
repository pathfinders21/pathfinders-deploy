/**
 * Deterministic demo engine.
 *
 * Every AI feature has a hard-coded fallback so the whole product works
 * end to end before a Gemini key exists: and so a Gemini outage degrades to a
 * labelled "demo" result instead of a broken page. Results are derived from a
 * hash of the input, so the same input always produces the same output (no
 * flicker on re-render) while different inputs look different.
 *
 * Demo results are ALWAYS labelled `engine: 'demo'` and the UI says so out loud.
 */

import type { MentorRecord } from './types'

export type Engine = 'gemini' | 'demo'

/** Stable 32-bit string hash (FNV-1a). */
export function hashString(input: string): number {
  let h = 0x811c9dc5
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i)
    h = Math.imul(h, 0x01000193)
  }
  return h >>> 0
}

export type VisionAnalysis = {
  technologies: string[]
  problemType: string
  summary: string
  searchQuery: string
  skillsNeeded: string[]
  difficulties: string[]
  confidence: number
}

const DEMO_ANALYSES: VisionAnalysis[] = [
  {
    technologies: ['React', 'Vite', 'TypeScript'],
    problemType: 'build error',
    summary: 'A Vite dev server failing to resolve a module during a hot update, with a stack trace pointing at a missing dependency.',
    searchQuery: 'React Vite TypeScript build fails cannot resolve module dependency',
    skillsNeeded: ['Frontend', 'Distributed systems'],
    difficulties: ['Module resolution', 'Stale dependency cache'],
    confidence: 0.71,
  },
  {
    technologies: ['Python', 'PyTorch', 'CUDA'],
    problemType: 'runtime error',
    summary: 'A training script crashing on a tensor shape mismatch, with a device placement warning in the traceback.',
    searchQuery: 'PyTorch tensor shape mismatch CUDA device error during training',
    skillsNeeded: ['Machine learning'],
    difficulties: ['Tensor broadcasting', 'GPU memory'],
    confidence: 0.68,
  },
  {
    technologies: ['PostgreSQL', 'SQL', 'Node.js'],
    problemType: 'data bug',
    summary: 'A query returning duplicate rows after a join, with an aggregate that looks correct but is silently wrong.',
    searchQuery: 'SQL Postgres join duplicates wrong aggregate result',
    skillsNeeded: ['Databases', 'Distributed systems'],
    difficulties: ['Join fan out', 'Aggregate semantics'],
    confidence: 0.74,
  },
  {
    technologies: ['Git', 'GitHub Actions', 'CI'],
    problemType: 'pipeline failure',
    summary: 'A CI workflow failing on a step that passes locally, with a mismatch between the pinned runtime and the lockfile.',
    searchQuery: 'GitHub Actions CI fails locally passes lockfile runtime mismatch',
    skillsNeeded: ['Distributed systems', 'Frontend'],
    difficulties: ['Environment drift', 'Cache keys'],
    confidence: 0.66,
  },
]

export function demoVisionAnalysis(seedInput: string): VisionAnalysis {
  return DEMO_ANALYSES[hashString(seedInput) % DEMO_ANALYSES.length]!
}

export function demoDraftMessage(mentor: MentorRecord, topic: string): string {
  return [
    `Hi ${mentor.name.split(' ')[0]}: I'm stuck on something in ${topic}.`,
    `I've attached a screenshot and tried the obvious fixes, but I'm going in circles.`,
    `Your ${mentor.skills.slice(0, 2).join(' / ')} work is exactly the direction I want to grow in. Would you have 20 minutes this week?`,
  ].join(' ')
}

const DEMO_STANDUP_TRANSCRIPT =
  "Okay so this week I finished the schema file and got the first mutation working end to end. " +
  "I also wrote the migration and tested it locally. " +
  "Honestly the thing that's blocking me is the auth rules: I can't work out how to scope the query so a user only sees their own rows, " +
  "and I keep second guessing whether the check belongs on the client or the server. " +
  "Next I want to wire the first mutation into the UI, but I'd rather fix the auth thing first."

export function demoStandup(): {
  transcript: string
  summary: string[]
  blocker: string
  completedStepTitles: string[]
  mood: string
  nextStep: string
} {
  return {
    transcript: DEMO_STANDUP_TRANSCRIPT,
    summary: [
      'Finished the schema and got the first mutation working end to end.',
      'Wrote and locally tested the migration.',
      'Blocked on auth rules: cannot scope a query so users only see their own rows.',
    ],
    blocker: 'Unclear whether the ownership check belongs on the client or the server side when scoping queries.',
    completedStepTitles: ['Define the data model', 'Write the first mutation'],
    mood: 'focused but stuck',
    nextStep: 'Fix query scoping so a user only reads their own rows.',
  }
}

export function demoMicroSteps(stepTitle: string): Array<{ title: string; detail: string }> {
  return [
    {
      title: `Skim the docs for “${stepTitle}” (15 min)`,
      detail: 'Read only the reference section: no tutorial rabbit hole. Write down the one API you will actually call.',
    },
    {
      title: `Write the smallest possible version of “${stepTitle}”`,
      detail: 'Hard code the inputs. The goal is a file that runs, not a file that is right.',
    },
    {
      title: `Make one real call to “${stepTitle}” and log the result`,
      detail: 'Swap the hard coded input for one real value and console.log the output. If it throws, paste the error back here.',
    },
  ]
}

export function demoWhy(
  mentor: MentorRecord,
  profile: { skills: string[]; goal: string; vibe: string },
): { whyTechnical: string; whyVibe: string; vibeFit: number } {
  const overlap = profile.skills.filter((s) => mentor.skills.includes(s))
  const technical =
    overlap.length > 0
      ? `Covers ${overlap.join(', ')}: the exact ground you said you were stuck on.`
      : `Works closest to your goal of ${profile.goal || 'levelling up'} in the current directory.`
  const vibe =
    mentor.vibeTags.includes(profile.vibe)
      ? `Explicitly lists “${profile.vibe}” as their style, which is what you said you want from feedback.`
      : `Leans toward a ${mentor.vibeTags.slice(0, 2).join(' / ')} style: a different flavour from “${profile.vibe}”, but their reviews are strong.`
  return { whyTechnical: technical, whyVibe: vibe, vibeFit: mentor.vibeTags.includes(profile.vibe) ? 88 : 64 }
}

export function demoCodeReview(language: string, code: string): {
  score: number
  approved: boolean
  summary: string
  issues: Array<{ severity: string; issue: string; fix: string }>
  strengths: string[]
  mentorNote: string
} {
  const lines = code.split('\n').length
  const hasTry = /\b(try|catch|except|Result|Option)\b/.test(code)
  const hasTests = /\b(test|expect|assert|describe|it\()/.test(code)
  const hasSecret = /(api[_-]?key|secret|password)\s*[:=]\s*['"][^'"]+['"]/i.test(code)
  const hasTodo = /TODO|FIXME/.test(code)

  const issues: Array<{ severity: string; issue: string; fix: string }> = []
  if (hasSecret) issues.push({ severity: 'high', issue: 'A credential looks hard coded.', fix: 'Move it to an environment variable / Worker secret and rotate the exposed value.' })
  if (!hasTry) issues.push({ severity: 'medium', issue: 'No error handling around the async path.', fix: `Wrap the await in a try/catch (or return a Result) so a rejection surfaces as a message, not a blank screen.` })
  if (!hasTests) issues.push({ severity: 'medium', issue: 'No test accompanies the change.', fix: 'Add one test for the happy path and one for the failure you just handled: that is what makes it reviewable.' })
  if (hasTodo) issues.push({ severity: 'low', issue: 'A TODO is shipping in the submitted code.', fix: 'Either do it or open an issue; a TODO in proof of work reads as unfinished.' })
  if (lines > 120) issues.push({ severity: 'low', issue: `The submission is long (${lines} lines).`, fix: 'Split it so a reviewer can read the change in one sitting.' })

  let score = 92
  if (hasSecret) score -= 40
  if (!hasTry) score -= 12
  if (!hasTests) score -= 10
  if (hasTodo) score -= 5
  score = Math.max(18, Math.min(98, score))

  return {
    score,
    approved: score >= 70,
    summary: `Read as ${language || 'code'}. Structure is ${lines > 20 ? 'reasonable' : 'minimal'}; the gaps are in ${hasTry ? 'tests and edge cases' : 'error handling'} rather than in the idea.`,
    issues,
    strengths: [
      lines <= 60 ? 'Short and to the point: easy to review.' : 'The intent is clear from the structure.',
      hasTry ? 'Handles the failure path explicitly.' : 'The happy path is readable.',
    ],
    mentorNote:
      score >= 70
        ? `Looks solid enough for a human pass. Worth a look: the ${issues[0]?.issue.toLowerCase() ?? 'naming in the main function'}.`
        : `Hold this one: it needs a round of fixes before a mentor's time is worth spending on it.`,
  }
}

/* ------------------------------------------------------------------ *
 *  Phase 3 additions: Career Navigator and roadmap generation
 * ------------------------------------------------------------------ */

export type DemoCareerPath = {
  title: string
  why: string
  skillsHave: string[]
  skillsGrow: string[]
  projects: string[]
  milestones: string[]
  effort: string
  assumptions: string[]
  tradeoffs: string[]
  nextAction: string
}

/**
 * Deterministic career-path suggestions for AI_DEMO_MODE.
 *
 * Deliberately generic and hedged: it describes directions and the work they
 * involve, never salaries, hiring rates, deadlines or guaranteed outcomes. The
 * same profile text always selects the same paths so a re-render does not
 * shuffle the list, and every result is returned as `engine: 'demo'`.
 */
export function demoCareerPaths(seed: string, goalTitle: string): { paths: DemoCareerPath[]; note: string } {
  const focus = goalTitle.trim() || 'your stated direction'
  const templates: DemoCareerPath[][] = [
    [
      {
        title: `Software engineering: backend & systems`,
        why: `Closest to what you described (“${focus}”): it rewards the code you already write and the debugging habit you are building.`,
        skillsHave: ['Programming fundamentals', 'Version control'],
        skillsGrow: ['Databases', 'APIs', 'Testing', 'Systems design'],
        projects: ['A REST API with an authenticated write path', 'A small CLI that calls a public API and stores results'],
        milestones: ['One deployed service with a database', 'One project with tests and a README', 'One codebase you have read end to end'],
        effort: 'Estimate · roughly 3 to 6 months of part time work',
        assumptions: ['You are comfortable with at least one programming language', 'You have a few hours a week available'],
        tradeoffs: ['Steeper theory ramp than product work', 'Interview style data structures prep is a separate track'],
        nextAction: 'Pick one existing project and add a real database read and write, then deploy it.',
      },
      {
        title: 'Data & machine learning',
        why: `Turns your interest in “${focus}” toward analysis and modelling rather than application plumbing.`,
        skillsHave: ['Programming fundamentals'],
        skillsGrow: ['Statistics', 'Python data stack', 'Model evaluation'],
        projects: ['Reproduce one published result on a small dataset', 'A dashboard over a public dataset you cleaned yourself'],
        milestones: ['One notebook you can explain line by line', 'One model you evaluated honestly, including its failures'],
        effort: 'Estimate · roughly 4 to 8 months of part time work',
        assumptions: ['You are willing to learn the maths alongside the code'],
        tradeoffs: ['Entry roles often ask for a postgraduate degree', 'Less immediate feedback than shipping an application'],
        nextAction: 'Take one small public dataset and answer one specific question about it, end to end.',
      },
      {
        title: 'Product & technical design',
        why: `Uses the communication side of “${focus}”: writing, prioritising and explaining: while staying close to engineering.`,
        skillsHave: ['Written communication'],
        skillsGrow: ['User research', 'Prioritisation frameworks', 'Prototyping'],
        projects: ['A written product teardown of a tool you use daily', 'A clickable prototype with a one page rationale'],
        milestones: ['One teardown someone else found useful', 'One prototype tested with three real users'],
        effort: 'Estimate · roughly 2 to 4 months of part time work',
        assumptions: ['You enjoy writing and talking to people as much as building'],
        tradeoffs: ['Fewer entry level openings than engineering', 'Portfolios matter more than coursework here'],
        nextAction: 'Write a one page teardown of a product you use, and share it with one person for feedback.',
      },
    ],
  ]
  const paths = templates[hashString(seed) % templates.length]!
  return {
    paths,
    note: 'General guidance generated from your stated interests only. It does not account for the job market, and it is not a prediction of any outcome.',
  }
}

export function demoRoadmap(goalTitle: string): {
  title: string
  rationale: string
  milestones: Array<{ title: string; why: string; tasks: Array<{ title: string; detail: string; estimate: string }> }>
} {
  const goal = goalTitle.trim() || 'your goal'
  return {
    title: `Path to: ${goal}`,
    rationale: `Ordered so each milestone produces something you can show, and so the first step is small enough to finish this week.`,
    milestones: [
      {
        title: 'Establish the baseline',
        why: 'You cannot improve what you have not measured, and mentors work best from evidence.',
        tasks: [
          { title: 'Write down where you are today', detail: 'One page: what you can do unaided, what you cannot, and what you have built so far.', estimate: '1 hour' },
          { title: 'Collect the existing work', detail: 'Gather links, repositories or notes into one place you can share.', estimate: '1 to 2 hours' },
        ],
      },
      {
        title: 'Close the first skill gap',
        why: 'One gap, closed properly, is worth more than five started.',
        tasks: [
          { title: 'Pick the single highest leverage gap', detail: 'Choose the one that blocks the most of your goal.', estimate: '30 minutes' },
          { title: 'Build the smallest artifact that needs it', detail: 'A script, a page or a notebook that is impossible without that skill.', estimate: '3 to 5 hours' },
          { title: 'Write up what surprised you', detail: 'Three paragraphs. This is what you bring to a mentor session.', estimate: '1 hour' },
        ],
      },
      {
        title: 'Produce one reviewable piece of work',
        why: 'A mentor can only help with something concrete.',
        tasks: [
          { title: 'Finish the artifact end to end', detail: 'Rough is fine. Incomplete is not.', estimate: '5 to 8 hours' },
          { title: 'Get one piece of feedback', detail: 'From a peer, a forum or a mentor: and act on one point.', estimate: '1 hour' },
        ],
      },
      {
        title: 'Turn the work into evidence',
        why: 'The last 10% is what makes the rest legible to anyone reviewing you.',
        tasks: [
          { title: 'Write the README or summary', detail: 'Problem, approach, result, what you would do differently.', estimate: '1 to 2 hours' },
          { title: 'Prepare a two minute walkthrough', detail: 'Practise saying it out loud once.', estimate: '30 minutes' },
        ],
      },
    ],
  }
}

/* ------------------------------------------------------------------ *
 *  Mentor session preparation (deterministic fallback)
 * ------------------------------------------------------------------ */

export type MentorPrep = {
  focus: string
  agenda: Array<{ title: string; detail: string; minutes: number }>
  questions: string[]
  nextSteps: string[]
  watchOuts: string[]
}

/**
 * Session preparation without a provider key.
 *
 * Built from the mentee's own stated values only: it invents no facts about the
 * student and makes no assessment of them. Every line is a rephrasing of
 * something they entered, which is what makes it safe to show in demo mode as
 * long as the caller labels the engine.
 */
export function demoMentorPrep(input: {
  menteeName: string
  goalTitle: string
  skillsWant: string[]
  skillsHave: string[]
  milestonesDone: number
  milestonesTotal: number
}): MentorPrep {
  const name = input.menteeName || 'your student'
  const goal = input.goalTitle || 'their current goal'
  const wants = input.skillsWant.slice(0, 3)
  const has = input.skillsHave.slice(0, 3)
  const remaining = Math.max(input.milestonesTotal - input.milestonesDone, 0)

  return {
    focus: `Where ${name} currently is on “${goal}”: ${input.milestonesDone} of ${input.milestonesTotal} milestones done.`,
    agenda: [
      {
        title: 'Confirm the goal in their words',
        detail: `Ask ${name} to describe what “${goal}” means for them right now, before offering any direction of your own.`,
        minutes: 10,
      },
      {
        title: has.length ? `Build on what they already have: ${has.join(', ')}` : 'Take stock of what they already know',
        detail: 'Have them show one concrete piece of work, then work forward from it.',
        minutes: 15,
      },
      {
        title: wants.length ? `The gap they named: ${wants.join(', ')}` : 'Name the gap together',
        detail: 'Agree on one skill to move on this week: not the whole list.',
        minutes: 15,
      },
      {
        title: remaining > 0 ? `Next milestone (${remaining} left)` : 'Choose the next milestone',
        detail: 'Pick the smallest next step that produces something they can show you next session.',
        minutes: 10,
      },
    ],
    questions: [
      `What have you tried since we last spoke?`,
      `Where exactly do you get stuck on “${goal}”?`,
      wants.length ? `Which of ${wants.join(', ')} feels closest to useful right now?` : 'Which skill would unblock you fastest?',
      'What would make this week feel like progress to you?',
      'Is there anything making this harder that we have not talked about?',
    ],
    nextSteps: [
      remaining > 0
        ? 'Agree one milestone to complete before the next session, with a date.'
        : 'Agree the next milestone and add it to their roadmap together.',
      wants.length ? `Point them at one focused resource for ${wants[0]}.` : 'Point them at one focused resource.',
      'Agree how they will show you progress next time.',
    ],
    watchOuts: [
      'They reported the goal themselves: treat the milestone counts as their bookkeeping, not an assessment.',
      'Nothing here is from a private conversation; it is built from the profile and roadmap they shared with you.',
    ],
  }
}

/**
 * Deterministic gap analysis for the demo engine.
 *
 * Like every other fallback here it is derived from the input, so it is stable across
 * renders, and it is labelled `engine: 'demo'` by its caller. It deliberately keeps
 * every finding tied to something the student typed: anything the model would have had
 * to infer is reported as something to confirm rather than asserted.
 */
export function demoAssessment(input: {
  goalText: string
  skillsHave: string[]
  skillsWant: string[]
  projectText: string
  hoursPerWeek: string
}): {
  summary: string
  strengths: Array<{ skill: string; evidence: string; confidence: number; source: 'evidenced' | 'self_reported' }>
  gaps: Array<{
    skill: string
    why: string
    evidence: string
    priority: 'high' | 'medium' | 'low'
    confidence: number
    exercises: string[]
  }>
  assumptions: string[]
  questionsToStrengthen: string[]
} {
  const goal = input.goalText.trim() || 'the direction you named'
  const have = input.skillsHave.length ? input.skillsHave : ['what you already do']
  const want = input.skillsWant.length ? input.skillsWant : ['the skill your goal depends on']
  const project = input.projectText.trim()

  const strengths = have.slice(0, 4).map((skill, index) => ({
    skill,
    evidence: project
      ? `You listed ${skill} and described work you have done, so treat it as usable until you show it in an interview.`
      : `You listed ${skill}. Nothing you wrote shows it in use yet, so this is your own report.`,
    confidence: project ? 0.6 - index * 0.05 : 0.35 - index * 0.05,
    source: (project ? 'evidenced' : 'self_reported') as 'evidenced' | 'self_reported',
  }))

  const gaps = want.slice(0, 4).map((skill, index) => ({
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

  return {
    summary: `Working towards ${goal} from ${have.join(', ')}. ${gaps.length} areas to build, ${strengths.length} you can already use. This is the demo engine, so it is a reading of what you typed rather than a judgement about you.`,
    strengths,
    gaps,
    assumptions: [
      'Built only from the profile fields you filled in.',
      input.hoursPerWeek ? `Assumes about ${input.hoursPerWeek} of study time a week.` : 'No weekly time was given.',
      project ? 'Assumes the work you described is your own.' : 'Assumes your skills list is honest.',
    ],
    questionsToStrengthen: [
      'What have you built that you would show a stranger? Link it or describe it.',
      'Which of the skills you listed have you used to finish something, rather than just learned?',
      'What is the next concrete thing you want to be able to do?',
    ],
  }
}

/**
 * Deterministic adaptation proposal for the demo engine.
 *
 * It works from the app's own findings, which is the same input the model gets, and it
 * can only choose a real milestone id from the state. Labelled `engine: 'demo'` by its
 * caller and shown as such in the interface.
 */
export function demoAgentProposal(
  state: {
    goalTitle: string
    roadmapId: string | null
    steps: Array<{ id: string; title: string; status: string }>
    mentors: Array<{ id: string; name: string; role: string }>
  },
  findings: Array<{ kind: string; ref: string; detail: string }>,
): {
  actionKind: 'create_milestone' | 'update_milestone' | 'save_action_item' | 'prepare_request'
  title: string
  detail: string
  reasoning: string
  evidence: Array<{ ref: 'profile' | 'goal' | 'progress' | 'overdue' | 'stalled'; detail: string }>
  milestoneRef: string
  estimate: string
  deadline: string
  confidence: number
  mentorId: string
} {
  const overdue = findings.find((f) => f.kind === 'overdue_milestone')
  const stalled = findings.find((f) => f.kind === 'stalled_milestone')
  const first = state.steps[0]
  const mentor = state.mentors[0]
  const inAWeek = new Date(Date.now() + 7 * 86_400_000).toISOString().slice(0, 10)

  const base = {
    milestoneRef: '',
    estimate: '',
    deadline: '',
    confidence: 0.5,
    mentorId: '',
  }

  if (overdue) {
    return {
      ...base,
      actionKind: 'save_action_item',
      title: 'Spend one hour on the overdue milestone',
      detail: `Block an hour for "${overdue.detail.replace(/^"|" was due.*$/g, '')}" and write down the single thing blocking it.`,
      reasoning:
        'The most overdue item is the one most likely to be quietly abandoned, and an hour is small enough to actually happen this week.',
      evidence: [{ ref: 'overdue', detail: overdue.detail }],
      estimate: '1 hour',
      deadline: inAWeek,
    }
  }

  if (stalled && first) {
    return {
      ...base,
      actionKind: 'update_milestone',
      title: 'Restate the stalled milestone in one sentence',
      detail: `Rewrite "${first.title}" so it names a finished thing rather than an activity, then give it a new date.`,
      reasoning: 'A milestone that has not moved for a week is usually too large or too vague to start.',
      evidence: [{ ref: 'stalled', detail: stalled.detail }],
      milestoneRef: first.id,
      deadline: inAWeek,
    }
  }

  if (!state.roadmapId) {
    return {
      ...base,
      actionKind: 'save_action_item',
      title: 'Write the goal in one sentence',
      detail: 'State the outcome you want in a single sentence, so a roadmap can be generated from it.',
      reasoning: 'No roadmap can be built until the goal is specific enough to plan against.',
      evidence: [
        { ref: 'goal', detail: state.goalTitle ? `Current goal text: ${state.goalTitle}` : 'No goal is stored yet.' },
      ],
    }
  }

  if (mentor) {
    return {
      ...base,
      actionKind: 'prepare_request',
      title: `Draft a request to ${mentor.name}`,
      detail: `A short, specific request about ${state.goalTitle || 'your goal'}, naming what you have tried and what you need.`,
      reasoning: 'A concrete ask is more likely to get a useful answer than a general one.',
      evidence: [
        { ref: 'progress', detail: findings[0]?.detail ?? 'Your roadmap is stored and up to date.' },
        { ref: 'profile', detail: 'Your goal is stored on your profile.' },
      ],
      mentorId: mentor.id,
    }
  }

  return {
    ...base,
    actionKind: 'create_milestone',
    title: 'Add one milestone that produces something visible',
    detail: `A milestone tied to "${state.goalTitle || 'your goal'}" that ends in something you can show someone.`,
    reasoning: 'The roadmap has no milestone that ends in an artifact, which is what makes progress reviewable.',
    evidence: [{ ref: 'progress', detail: findings[0]?.detail ?? 'Your roadmap is stored.' }],
    estimate: '2 hours',
    deadline: inAWeek,
  }
}

/**
 * Deterministic answer for the assistant chat.
 *
 * Same contract as every other fallback here: derived from the input, stable across
 * renders, and labelled `engine: 'demo'` by its caller. It answers the *shape* of the
 * question (reduce it, run the smallest thing, then ask these people with this evidence)
 * rather than pretending to know the person's codebase, and it names only mentors that
 * the matching engine already put in front of it.
 */
export function demoAssistant(input: {
  message: string
  goalTitle: string | null
  skillsHave: string[]
  skillsWant: string[]
  mentors: Array<{ name: string; expertise: string[] }>
}): { reply: string; followUps: string[] } {
  const asked = input.message.trim().replace(/\s+/g, ' ').replace(/[.?!]+$/, '')
  const short = asked.length > 140 ? `${asked.slice(0, 137)}...` : asked
  const next = input.skillsWant[0] ?? null
  const first = input.mentors[0]
  const second = input.mentors[1]

  const paragraphs = [
    `You asked: "${short}". This is the demo engine answering, because no model key is configured on this server, so treat it as a way to organise the question rather than an answer about your code.`,
    input.goalTitle
      ? `Against your stored goal ("${input.goalTitle}") the shortest path is to reduce this to one thing you can run today${next ? `, which for you is ${next}` : ''}. Write down what you expect first, run it, and keep the output: that turns three rounds of questions with a mentor into one.`
      : 'You have no active goal stored yet, so start there. The same question has different right answers depending on where you are trying to get to.',
    input.skillsHave.length
      ? `You already list ${input.skillsHave.slice(0, 4).join(', ')}, so build the smallest version on top of what you have rather than starting from a tutorial.`
      : 'Nothing is listed under what you can already do yet, so the first move is a small piece of work you can keep, however plain.',
    first
      ? `Who to ask: ${first.name}${first.expertise.length ? ` (${first.expertise.slice(0, 3).join(', ')})` : ''}${second ? `, or ${second.name}` : ''}. Bring the smallest reproduction, what you already tried, and the output you got.`
      : 'Nobody in the directory covers this yet, so put it on the community board where mentors filter open problems.',
  ]

  return {
    reply: paragraphs.join('\n\n'),
    followUps: [
      'What is the smallest command or request that reproduces this?',
      next ? `What have you already tried for ${next}?` : 'What have you already tried?',
      'What would a good result look like, specifically?',
    ],
  }
}
