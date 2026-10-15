/**
 * PathFinders AI backend.
 *
 * A single Workers fetch handler that serves `/api/*` (plus the
 * `/auth/freebuff/*` routes from `@freebuff/auth`) and falls through to the
 * static SPA build. Every model call happens here, so the API key never reaches
 * the browser.
 *
 * Identity is Sign in with Freebuff: `currentUser()` is the only source of a
 * user id and the only source of a role (`profiles.role`, set through a
 * validated onboarding call). A client-supplied id or role is never trusted.
 *
 * Route groups:
 *   /api/health, /api/mentors                  public
 *   /api/profile, /api/career/*, /api/goals*,  the signed-in visitor's own data
 *   /api/roadmap*                              their active goal's roadmap
 *   /api/matches                               deterministic recommendations
 *   /api/requests*, /api/mentees               mentee ↔ mentor, role-checked
 *   /api/verification[/*]                      mentor trust: submit, status, review
 *   /api/messages*, /api/portfolio             accepted-pair messaging, mentor record
 *   /api/vision-match, /api/match, /api/standup, /api/code-review, /api/events
 *                                              the original AI features
 *   /api/assistant/chat                        the assistant: an answer plus mentors
 *
 * Deploy target: Cloudflare Workers (see wrangler.toml). Bindings: DB (D1),
 * ASSETS (static build), AI_API_KEY (secret), FREEBUFF_CLIENT_ID /
 * FREEBUFF_ISSUER / APP_ORIGIN (public config, injected on deploy).
 */

import type { FreebuffUser } from '@freebuff/auth'

import { currentUser, freebuffAuth } from './lib/auth'
import { csrfVerdict } from './lib/csrf'
import { ensureSchema, ensureSeeded, listMentors } from './lib/db'
import { DEMO_SEED_ENV, seedDemoScenario } from './lib/demo_seed'
import { enforceActionLimit } from './lib/rate'
import { MAX_MESSAGE_BODY, listThreads, markThreadRead, sendMessage } from './lib/messaging'
import { mentorPortfolio } from './lib/portfolio'
import { prepareSession } from './lib/mentor_ai'
import {
  VERIFICATION_DECISIONS,
  decideVerification,
  isModerator,
  pendingVerifications,
  submitVerification,
  verificationSummary,
} from './lib/verification'
import { AiError } from './lib/ai/errors'
import { aiStatus } from './lib/ai/config'
import { usageSummary } from './lib/ai/usage'
import {
  getAgentEvents,
  matchMentors,
  runCodeReview,
  runStandup,
  visionMatch,
  type MatchProfile,
} from './lib/features'
import {
  ensureProfile,
  loadProfile,
  saveProfile,
  mentorReadiness,
  ROLES,
  type Profile,
  type ProfilePatch,
} from './lib/profile'
import { CAREER_NOTE, extractProfile, loadPaths, suggestPaths } from './lib/career'
import {
  AGENT_NOTE,
  decideProposal,
  listProposals,
  proposeAction,
  readAgentState,
  analyzeProgress,
} from './lib/agent'
import {
  ASSESSMENT_NOTE,
  assessReadiness,
  loadAssessments,
  runAssessment,
  type AssessmentInput,
} from './lib/assessment'
import {
  InputShapeError,
  applyPlan,
  addPersonalTask,
  createGoal,
  deleteStep,
  getActiveGoal,
  getGoal,
  getRoadmapView,
  listGoals,
  proposeRoadmap,
  setGoalStatus,
  setStepStatus,
  tickStalledSteps,
  updateStep,
  validatePlan,
  GOAL_STATUSES,
  type GoalStatus,
} from './lib/roadmap'
import { recommendMentors, saveSnapshot } from './lib/matching/index'
import { CHAT_MAX_TURNS, askAssistant, type ChatTurn } from './lib/assistant'
import {
  RequestError,
  createRequest,
  listAcceptedMentors,
  listMentees,
  listRequests,
  loadRequestView,
  transition,
} from './lib/requests'
import {
  InputError,
  boolean,
  raw,
  withDefault,
  arrayOf,
  object,
  optional,
  parseBody,
  string,
  stringArray,
} from './lib/validate'
import type { Env } from './env'

/** Request bodies are capped so a huge upload cannot be used to exhaust memory. */
const MAX_IMAGE_BYTES = 6 * 1024 * 1024
const MAX_AUDIO_BYTES = 12 * 1024 * 1024
const MAX_CODE_CHARS = 20000

let schemaReady = false

async function bootstrap(env: Env): Promise<void> {
  if (schemaReady) return
  await ensureSchema(env.DB)
  await ensureSeeded(env.DB)
  schemaReady = true
}

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      // Personalised payloads must never be cached by a shared cache.
      'cache-control': 'private, no-store',
    },
  })
}

function fail(status: number, message: string): Response {
  return json({ ok: false, error: message }, status)
}

async function readJson<T>(request: Request): Promise<T> {
  const type = request.headers.get('content-type') ?? ''
  if (!type.includes('application/json')) throw new Error('Expected application/json')
  return (await request.json()) as T
}

/**
 * Reads and validates a JSON body.
 *
 * An unparseable body and a body of the wrong shape both become one 400 with a
 * named field, so the client gets "profile.education.program: expected a string"
 * rather than a stack trace.
 */
async function body<T>(request: Request, validator: (value: unknown, field: string) => T): Promise<T> {
  let raw: unknown
  try {
    raw = await readJson<unknown>(request)
  } catch {
    throw new InputError('body', 'expected a JSON body with a content type of application/json')
  }
  return parseBody(validator, raw)
}

/** Guards base64 payloads by their decoded size, not their string length. */
function base64Size(value: unknown): number {
  if (typeof value !== 'string') return 0
  const clean = value.includes(',') ? value.slice(value.indexOf(',') + 1) : value
  const padding = clean.endsWith('==') ? 2 : clean.endsWith('=') ? 1 : 0
  return Math.floor((clean.length * 3) / 4) - padding
}

/**
 * CSRF guard for state-changing requests. `SameSite=Lax` is not enough on its
 * own; a foreign Origin (or a cross site Sec-Fetch-Site) is rejected outright.
 */
function crossOrigin(request: Request, env: Env): Response | null {
  const verdict = csrfVerdict(request, env.APP_ORIGIN)
  return verdict.ok ? null : fail(verdict.status, verdict.message)
}

/* ------------------------------------------------------------------ *
 *  Profile payloads
 * ------------------------------------------------------------------ */

const profilePatchValidator = object({
  role: optional(string({ values: ROLES })),
  displayName: optional(string({ max: 120 })),
  education: optional(
    object({
      institution: withDefault(string({ max: 160 }), ''),
      program: withDefault(string({ max: 160 }), ''),
      year: withDefault(string({ max: 80 }), ''),
    }),
  ),
  interests: optional(stringArray({ max: 20 })),
  goalsText: optional(string({ max: 2000 })),
  skillsHave: optional(stringArray({ max: 24 })),
  skillsWant: optional(stringArray({ max: 24 })),
  industries: optional(stringArray({ max: 16 })),
  learningPrefs: optional(stringArray({ max: 12 })),
  hoursPerWeek: optional(string({ max: 120 })),
  mentoringStyle: optional(string({ max: 200 })),
  formatPref: optional(string({ max: 120 })),
  constraints: optional(string({ max: 800 })),
  bio: optional(string({ max: 1200 })),
  projectText: optional(string({ max: 4000 })),
  expertise: optional(stringArray({ max: 24 })),
  mentorGoals: optional(stringArray({ max: 16 })),
  careers: optional(stringArray({ max: 12 })),
  availability: optional(stringArray({ max: 7 })),
  active: optional(boolean()),
})

/**
 * What the client is told about its own profile.
 *
 * The role, the readiness gate and the completion number are all computed here
 * from the stored row, so the UI never has to guess and never has to be trusted.
 */
function profilePayload(profile: Profile) {
  const readiness = mentorReadiness(profile)
  return {
    profile,
    role: profile.role,
    roleChosen: profile.role !== '',
    completion: profile.completion,
    // True only after the explicit demo seed ran on this account, so the interface can
    // label sample data as sample data instead of showing it as the person's own.
    demoSeeded: Boolean(profile.demoSeededAt),
    demoSeededAt: profile.demoSeededAt ?? null,
    onboardingComplete:
      profile.role === 'mentor'
        ? readiness.ready
        : profile.completion >= 40 && (profile.goalsText !== '' || profile.interests.length > 0),
    mentorReady: readiness.ready,
    mentorMissing: readiness.missing,
  }
}

/* ------------------------------------------------------------------ *
 *  Trust & messaging payloads
 * ------------------------------------------------------------------ */

const verificationInput = object({
  kind: optional(string({ max: 40 })),
  statement: string({ max: 1200 }),
  links: optional(stringArray({ max: 5, itemMax: 300 })),
})

const decisionInput = object({
  decision: string({ values: VERIFICATION_DECISIONS }),
  note: optional(string({ max: 800 })),
})

const messageInput = object({
  body: string({ max: MAX_MESSAGE_BODY }),
})

const prepInput = object({
  menteeId: string({ max: 100 }),
})

const feedbackInput = object({
  // 'assessment' | 'agent' | 'match' | ... : which AI surface this is about.
  feature: string({ values: ['assessment', 'agent', 'match', 'roadmap'] }),
  // Free text, optional: the student may just want it flagged.
  note: optional(string({ max: 800 })),
  // The finding they are unhappy with, if any. Shown to a human later, never parsed.
  subject: optional(string({ max: 300 })),
})

const proposeInput = object({
  // Optional: which of the app's findings to act on. Defaults to the first one.
  trigger: optional(string({ values: ['overdue_milestone', 'stalled_milestone', 'no_roadmap', 'manual'] })),
})

const decisionInputAgent = object({
  kind: string({ values: ['approve', 'reject'] }),
  note: optional(string({ max: 300 })),
  edit: optional(
    object({
      title: optional(string({ max: 160 })),
      detail: optional(string({ max: 600 })),
      // null clears it; an absent field leaves it alone.
      deadline: optional(string({ max: 40 })),
      clearDeadline: optional(boolean()),
    }),
  ),
})

const assessmentInput = object({
  refresh: optional(boolean()),
  // Optional on purpose: the form can send it, the stored profile is the fallback.
  projectText: optional(string({ max: 4000 })),
  goalText: optional(string({ max: 2000 })),
})

/** The assessment reads the same profile fields the rest of the app reads. */
function assessmentInputFrom(profile: Profile, body: { projectText?: string; goalText?: string }): AssessmentInput {
  const education = [profile.education.program, profile.education.institution, profile.education.year]
    .filter(Boolean)
    .join(', ')
  return {
    goalText: (body.goalText ?? profile.goalsText ?? '').trim(),
    skillsHave: profile.skillsHave,
    skillsWant: profile.skillsWant,
    interests: profile.interests,
    industries: profile.industries,
    hoursPerWeek: profile.hoursPerWeek,
    education,
    projectText: (body.projectText ?? profile.projectText ?? '').trim(),
  }
}

async function requireMentor(profile: Profile): Promise<Response | null> {
  if (profile.role !== 'mentor') return fail(403, 'Only a mentor account can do that.')
  return null
}

/* ------------------------------------------------------------------ *
 *  Routes
 * ------------------------------------------------------------------ */

async function handleApi(request: Request, env: Env, url: URL): Promise<Response> {
  const path = url.pathname
  const method = request.method

  if (path === '/api/health' && method === 'GET') {
    const ai = aiStatus(env)
    return json({
      ok: true,
      ai,
      aiConfigured: ai.configured,
      engine: ai.configured ? 'gemini' : ai.demoMode ? 'demo' : 'unconfigured',
      model: ai.configured ? ai.model : null,
      authConfigured: Boolean(env.FREEBUFF_CLIENT_ID && env.APP_ORIGIN),
    })
  }

  // The mentor directory is public: it is a directory, not personal data.
  if (path === '/api/mentors' && method === 'GET') {
    return json({ ok: true, mentors: await listMentors(env.DB) })
  }

  /**
   * Everything past the public directory requires a session.
   *
   * The AI endpoints are included even though they persist nothing per user:
   * they spend a shared, metered provider key, and per-user rate limits are only
   * meaningful when there is a user to attribute the call to.
   */
  const user: FreebuffUser | null = await currentUser(request, env)
  if (!user) return fail(401, 'Sign in required')

  const profile = await ensureProfile(env.DB, user.sub, { email: user.email, name: user.name })

  /* ---------------- profile & onboarding ---------------- */

  if (path === '/api/profile') {
    if (method === 'GET') return json({ ok: true, ...profilePayload(profile) })

    if (method === 'PATCH' || method === 'PUT') {
      const blocked = crossOrigin(request, env)
      if (blocked) return blocked
      const patch = await body(request, profilePatchValidator)
      const { profile: saved, roleChange } = await saveProfile(env.DB, profile, patch as ProfilePatch)
      if (roleChange === 'rejected') {
        return json({
          ok: true,
          ...profilePayload(saved),
          warning: `Your account is already registered as a ${saved.role}. Roles are set once at sign up.`,
        })
      }
      return json({ ok: true, ...profilePayload(saved) })
    }
  }

  if (path === '/api/profile/extract' && method === 'POST') {
    const blocked = crossOrigin(request, env)
    if (blocked) return blocked
    const input = await body(request, object({ text: string({ min: 20, max: 4000 }) }))
    const result = await extractProfile(env, user.sub, input.text)
    return json({ ok: true, ...result })
  }

  /* ---------------- the adaptation agent ---------------- */

  if (path === '/api/agent' && method === 'GET') {
    const state = await readAgentState(env.DB, user.sub)
    return json({
      ok: true,
      proposals: await listProposals(env.DB, user.sub),
      findings: analyzeProgress(state),
      state: {
        goalTitle: state.goalTitle,
        hasRoadmap: Boolean(state.roadmapId),
        doneCount: state.doneCount,
        totalCount: state.totalCount,
        overdueCount: state.overdue.length,
        stalledCount: state.stalled.length,
      },
      note: AGENT_NOTE,
    })
  }

  if (path === '/api/agent/propose' && method === 'POST') {
    const blocked = crossOrigin(request, env)
    if (blocked) return blocked
    const input = await body(request, proposeInput)
    await enforceActionLimit(env.DB, user.sub, 'agent.propose')
    const outcome = await proposeAction(env, user.sub, { trigger: input.trigger as never })
    return json({ ok: true, ...outcome, note: AGENT_NOTE })
  }

  if (path.startsWith('/api/agent/proposals/') && method === 'POST') {
    const rest = path.slice('/api/agent/proposals/'.length)
    const parts = rest.split('/')
    if (parts.length === 2 && parts[0] && parts[1] === 'decision') {
      const blocked = crossOrigin(request, env)
      if (blocked) return blocked
      const input = await body(request, decisionInputAgent)
      const edit = input.edit
        ? {
            ...(input.edit.title !== undefined ? { title: input.edit.title } : {}),
            ...(input.edit.detail !== undefined ? { detail: input.edit.detail } : {}),
            ...(input.edit.clearDeadline ? { deadline: null } : input.edit.deadline !== undefined ? { deadline: input.edit.deadline } : {}),
          }
        : undefined
      const outcome = await decideProposal(
        env,
        user.sub,
        decodeURIComponent(parts[0]!),
        input.kind === 'approve' ? { kind: 'approve', edit } : { kind: 'reject', note: input.note },
      )
      return json({ ok: true, ...outcome })
    }
  }

  /* ---------------- feedback on an AI result ---------------- */

  /**
   * "Report a poor recommendation" has to go somewhere real. It is stored as an event
   * against the reporter and nothing else happens: no retraining, no automatic change
   * to their data, and the interface says so. A silent discard would be worse than no
   * button at all.
   */
  /*
   * The labeled demo scenario. Opt in, per account, and only where the deterministic
   * engine is already the configured behaviour, so a deployment with a real provider key
   * cannot have sample data written into somebody's account by this route.
   */
  if (path === '/api/demo/seed' && method === 'POST') {
    const blocked = crossOrigin(request, env)
    if (blocked) return blocked
    if ((env.AI_DEMO_MODE ?? '').trim().toLowerCase() !== 'true') {
      return fail(403, `The demo scenario is only available when ${DEMO_SEED_ENV} is enabled on the server.`)
    }
    const report = await seedDemoScenario(env.DB, user.sub)
    const reloaded = (await loadProfile(env.DB, user.sub)) ?? profile
    return json({ ...report, seededInto: user.sub, ...profilePayload(reloaded) })
  }

  if (path === '/api/feedback' && method === 'POST') {
    const blocked = crossOrigin(request, env)
    if (blocked) return blocked
    const input = await body(request, feedbackInput)
    await enforceActionLimit(env.DB, user.sub, 'ai_feedback')
    await env.DB.prepare(
      'INSERT INTO action_events (id, user_id, action, created_at) VALUES (?, ?, ?, ?)',
    )
      .bind(
        crypto.randomUUID(),
        user.sub,
        `ai_feedback:${input.feature}:${(input.subject ?? '').slice(0, 120)}:${(input.note ?? '').slice(0, 400)}`,
        new Date().toISOString(),
      )
      .run()
    return json({
      ok: true,
      recorded: true,
      note: 'Recorded against your account for a human to look at. Nothing about your profile or roadmap has changed.',
    })
  }

  /* ---------------- assessment and skill gaps ---------------- */

  if (path === '/api/assessment') {
    if (method === 'GET') {
      const assessments = await loadAssessments(env.DB, user.sub)
      return json({
        ok: true,
        assessment: assessments[0] ?? null,
        history: assessments,
        note: ASSESSMENT_NOTE,
        readiness: assessReadiness(assessmentInputFrom(profile, {})),
      })
    }

    if (method === 'POST') {
      const blocked = crossOrigin(request, env)
      if (blocked) return blocked
      const input = await body(request, assessmentInput)

      // A description of real work is the one thing that can turn a self report into
      // evidence, so it is saved to the profile when the student supplies it.
      let current = profile
      if (input.projectText !== undefined && input.projectText.trim() !== profile.projectText) {
        const saved = await saveProfile(env.DB, profile, { projectText: input.projectText.trim() })
        current = saved.profile
      }
      if (input.goalText !== undefined && input.goalText.trim() !== profile.goalsText) {
        const saved = await saveProfile(env.DB, current, { goalsText: input.goalText.trim() })
        current = saved.profile
      }

      const result = await runAssessment(env, user.sub, assessmentInputFrom(current, input), {
        refresh: input.refresh ?? false,
      })
      return json({ ok: true, ...result })
    }
  }

  /* ---------------- career navigator ---------------- */

  if (path === '/api/career/paths') {
    if (method === 'GET') {
      return json({ ok: true, paths: await loadPaths(env.DB, profile.userId), note: CAREER_NOTE })
    }
    if (method === 'POST') {
      const blocked = crossOrigin(request, env)
      if (blocked) return blocked
      const input = await body(request, object({ refresh: withDefault(boolean(), false) }))
      const result = await suggestPaths(env, user.sub, {
        displayName: profile.displayName,
        goalText: profile.goalsText,
        interests: profile.interests,
        skillsHave: profile.skillsHave,
        skillsWant: profile.skillsWant,
        industries: profile.industries,
        education: [profile.education.program, profile.education.year].filter(Boolean).join(' · '),
        experience: profile.mentoringStyle,
        hoursPerWeek: profile.hoursPerWeek,
      }, { refresh: input.refresh })
      return json({ ok: true, ...result })
    }
  }

  if (path === '/api/career/goals' && method === 'POST') {
    const blocked = crossOrigin(request, env)
    if (blocked) return blocked
    const input = await body(
      request,
      object({
        title: string({ min: 3, max: 160 }),
        rationale: withDefault(string({ max: 800 }), ''),
        source: withDefault(string({ values: ['ai', 'user'] }), 'ai'),
      }),
    )
    const goal = await createGoal(env.DB, user.sub, {
      title: input.title,
      rationale: input.rationale,
      source: input.source as 'ai' | 'user',
    })
    return json({ ok: true, goal })
  }

  if (path === '/api/goals' && method === 'GET') {
    return json({ ok: true, goals: await listGoals(env.DB, user.sub) })
  }

  const goalMatch = /^\/api\/goals\/([\w-]+)$/.exec(path)
  if (goalMatch && (method === 'PATCH' || method === 'PUT')) {
    const blocked = crossOrigin(request, env)
    if (blocked) return blocked
    const input = await body(request, object({ status: string({ values: GOAL_STATUSES }) }))
    const goal = await setGoalStatus(env.DB, user.sub, goalMatch[1]!, input.status as GoalStatus)
    if (!goal) return fail(404, 'No such goal.')
    return json({ ok: true, goal })
  }

  /* ---------------- roadmap ---------------- */

  if (path === '/api/roadmap' && method === 'GET') {
    return json({ ok: true, ...(await getRoadmapView(env.DB, user.sub)) })
  }

  if (path === '/api/roadmap/plan' && method === 'POST') {
    const blocked = crossOrigin(request, env)
    if (blocked) return blocked
    const input = await body(
      request,
      object({
        goalId: optional(string({ max: 80 })),
        regenerate: withDefault(boolean(), false),
      }),
    )
    const goal = input.goalId ? await getGoal(env.DB, user.sub, input.goalId) : await getActiveGoal(env.DB, user.sub)
    if (!goal) return fail(400, 'Set a goal first: a roadmap is generated for a goal.')
    const { plan, engine } = await proposeRoadmap(
      env,
      user.sub,
      goal,
      {
        skillsHave: profile.skillsHave,
        skillsWant: profile.skillsWant,
        hoursPerWeek: profile.hoursPerWeek,
        interests: profile.interests,
      },
      { regenerate: input.regenerate },
    )
    return json({
      ok: true,
      goal,
      plan,
      engine,
      // The plan is a proposal; the client must confirm before it is saved.
      requiresConfirmation: true,
    })
  }

  if (path === '/api/roadmap/apply' && method === 'POST') {
    const blocked = crossOrigin(request, env)
    if (blocked) return blocked
    const input = await body(
      request,
      object({
        goalId: optional(string({ max: 80 })),
        // The confirmed plan. It is re-validated against the model's spec before
        // anything is written, so a malformed plan is rejected whole.
        plan: raw(),
      }),
    )
    const goal = input.goalId ? await getGoal(env.DB, user.sub, input.goalId) : await getActiveGoal(env.DB, user.sub)
    if (!goal) return fail(400, 'Set a goal first: a roadmap is generated for a goal.')
    const result = await applyPlan(env.DB, user.sub, goal, validatePlan(input.plan))
    return json({ ok: true, ...result, ...(await getRoadmapView(env.DB, user.sub)) })
  }

  if (path === '/api/roadmap/tick' && method === 'POST') {
    const blocked = crossOrigin(request, env)
    if (blocked) return blocked
    const input = await body(request, object({ force: withDefault(boolean(), false) }))
    const tick = await tickStalledSteps(env, user.sub, input.force)
    return json({ ok: true, ...tick, ...(await getRoadmapView(env.DB, user.sub)) })
  }

  if (path === '/api/roadmap/steps' && method === 'POST') {
    const blocked = crossOrigin(request, env)
    if (blocked) return blocked
    const input = await body(
      request,
      object({
        title: string({ min: 3, max: 200 }),
        detail: withDefault(string({ max: 600 }), ''),
        estimate: withDefault(string({ max: 60 }), ''),
        deadline: optional(string({ max: 40 })),
        parentId: optional(string({ max: 80 })),
      }),
    )
    const view = await getRoadmapView(env.DB, user.sub)
    if (!view.roadmap) return fail(400, 'There is no roadmap yet. Generate one from your goal first.')
    const step = await addPersonalTask(env.DB, user.sub, view.roadmap.id, {
      title: input.title,
      detail: input.detail,
      estimate: input.estimate,
      deadline: input.deadline ?? null,
      parentId: input.parentId ?? null,
    })
    if (!step) return fail(404, 'No such roadmap.')
    return json({ ok: true, step, ...(await getRoadmapView(env.DB, user.sub)) })
  }

  const stepMatch = /^\/api\/roadmap\/steps\/([\w-]+)$/.exec(path)
  if (stepMatch) {
    const stepId = stepMatch[1]!
    if (method === 'PATCH' || method === 'PUT') {
      const blocked = crossOrigin(request, env)
      if (blocked) return blocked
      const input = await body(
        request,
        object({
          status: optional(string({ values: ['pending', 'done'] })),
          title: optional(string({ min: 3, max: 200 })),
          detail: optional(string({ max: 600 })),
          estimate: optional(string({ max: 60 })),
          deadline: optional(string({ max: 40 })),
        }),
      )
      let changed = false
      if (input.status) changed = await setStepStatus(env.DB, user.sub, stepId, input.status as 'pending' | 'done')
      if (input.title || input.detail || input.estimate || input.deadline !== undefined) {
        changed =
          (await updateStep(env.DB, user.sub, stepId, {
            title: input.title,
            detail: input.detail,
            estimate: input.estimate,
            deadline: input.deadline ?? null,
          })) || changed
      }
      if (!changed) return fail(404, 'No such step on your roadmap.')
      return json({ ok: true, ...(await getRoadmapView(env.DB, user.sub)) })
    }
    if (method === 'DELETE') {
      const blocked = crossOrigin(request, env)
      if (blocked) return blocked
      const removed = await deleteStep(env.DB, user.sub, stepId)
      if (!removed) {
        return fail(403, 'Only steps you added yourself can be deleted. Regenerate the roadmap to replace AI steps.')
      }
      return json({ ok: true, ...(await getRoadmapView(env.DB, user.sub)) })
    }
  }

  // Kept for the original roadmap panel, which completes a step by id.
  if (path === '/api/roadmap/complete' && method === 'POST') {
    const blocked = crossOrigin(request, env)
    if (blocked) return blocked
    const input = await body(request, object({ stepId: string({ max: 80 }) }))
    const ok = await setStepStatus(env.DB, user.sub, input.stepId, 'done')
    if (!ok) return fail(404, 'No such step on your roadmap.')
    return json({ ok: true, ...(await getRoadmapView(env.DB, user.sub)) })
  }

  /* ---------------- matching ---------------- */

  if (path === '/api/matches' && method === 'GET') {
    const phrase = url.searchParams.get('phrase') === '1'
    const result = await recommendMentors(env, user.sub, profile, { phrase })
    // Snapshot the scores so a request made from this page carries the same
    // number, and so the mentor sees the fit the student saw.
    await Promise.all(result.matches.slice(0, 8).map((match) => saveSnapshot(env.DB, user.sub, match)))
    return json({ ok: true, ...result, profile: profilePayload(profile) })
  }

  /* ---------------- requests & mentees ---------------- */

  if (path === '/api/requests') {
    if (method === 'GET') {
      if (profile.role === 'mentor') {
        return json({ ok: true, role: 'mentor', incoming: await listRequests(env, user.sub, 'mentor') })
      }
      return json({
        ok: true,
        role: profile.role || 'mentee',
        outgoing: await listRequests(env, user.sub, 'mentee'),
        mentors: await listAcceptedMentors(env, user.sub),
      })
    }
    if (method === 'POST') {
      const blocked = crossOrigin(request, env)
      if (blocked) return blocked
      if (profile.role === 'mentor') {
        return fail(403, 'A mentor account cannot send mentorship requests.')
      }
      const input = await body(
        request,
        object({
          mentorId: string({ min: 1, max: 120 }),
          message: withDefault(string({ max: 1000 }), ''),
          goalId: optional(string({ max: 80 })),
        }),
      )
      const view = await createRequest(env, user.sub, input.mentorId, {
        message: input.message,
        goalId: input.goalId ?? null,
      })
      return json({ ok: true, request: view })
    }
  }

  const transitionMatch = /^\/api\/requests\/([\w-]+)\/(accept|decline|withdraw)$/.exec(path)
  if (transitionMatch && method === 'POST') {
    const blocked = crossOrigin(request, env)
    if (blocked) return blocked
    const [, requestId, action] = transitionMatch
    const input = await body(request, object({ response: withDefault(string({ max: 1000 }), '') }))
    const view = await transition(env, user.sub, requestId!, action as 'accept' | 'decline' | 'withdraw', input.response)
    return json({ ok: true, request: view })
  }

  const requestMatch = /^\/api\/requests\/([\w-]+)$/.exec(path)
  if (requestMatch && method === 'GET') {
    const view = await loadRequestView(env, requestMatch[1]!, user.sub)
    if (!view) return fail(404, 'No such request.')
    return json({ ok: true, request: view })
  }

  if (path === '/api/mentees' && method === 'GET') {
    const denied = await requireMentor(profile)
    if (denied) return denied
    return json({ ok: true, mentees: await listMentees(env, user.sub) })
  }

  /* ---------------- verification (mentor trust) ---------------- */

  /*
   * Review status is separate from sign-in and from profile completion: signing
   * in proves an identity at the provider, not experience. A moderator is
   * identified by the server side MODERATOR_SUBS variable, so neither route
   * below can be reached by granting yourself anything.
   */

  if (path === '/api/verification' && method === 'GET') {
    return json({ ok: true, ...(await verificationSummary(env, env.DB, user.sub)) })
  }

  if (path === '/api/verification' && method === 'POST') {
    const blocked = crossOrigin(request, env)
    if (blocked) return blocked
    await enforceActionLimit(env.DB, user.sub, 'verification.submit')
    const input = await body(request, verificationInput)
    return json({ ok: true, ...(await submitVerification(env, env.DB, user.sub, profile, input)) })
  }

  if (path === '/api/verification/queue' && method === 'GET') {
    if (!isModerator(env, user.sub)) {
      // 404 rather than 403: a non-moderator learns nothing about whether a
      // review queue exists on this deployment.
      return fail(404, `No such endpoint: ${method} ${path}`)
    }
    return json({ ok: true, pending: await pendingVerifications(env.DB) })
  }

  const decisionMatch = path.match(/^\/api\/verification\/([^/]+)\/decision$/)
  if (decisionMatch && method === 'POST') {
    const blocked = crossOrigin(request, env)
    if (blocked) return blocked
    if (!isModerator(env, user.sub)) return fail(404, `No such endpoint: ${method} ${path}`)
    const input = await body(request, decisionInput)
    return json({
      ok: true,
      verification: await decideVerification(env.DB, decisionMatch[1], user.sub, input.decision, input.note ?? ''),
    })
  }

  /* ---------------- messaging (accepted mentorship only) ---------------- */

  if (path === '/api/messages' && method === 'GET') {
    return json({ ok: true, threads: await listThreads(env.DB, user.sub) })
  }

  const readMatch = path.match(/^\/api\/messages\/([^/]+)\/read$/)
  if (readMatch && method === 'POST') {
    const blocked = crossOrigin(request, env)
    if (blocked) return blocked
    return json({ ok: true, marked: await markThreadRead(env.DB, user.sub, readMatch[1]) })
  }

  const threadMatch = path.match(/^\/api\/messages\/([^/]+)$/)
  if (threadMatch && method === 'POST') {
    const blocked = crossOrigin(request, env)
    if (blocked) return blocked
    await enforceActionLimit(env.DB, user.sub, 'message.send')
    const input = await body(request, messageInput)
    return json({ ok: true, message: await sendMessage(env.DB, user.sub, threadMatch[1], input.body) })
  }

  /* ---------------- mentor contribution record ---------------- */

  if (path === '/api/portfolio' && method === 'GET') {
    const denied = await requireMentor(profile)
    if (denied) return denied
    return json({ ok: true, portfolio: await mentorPortfolio(env.DB, profile) })
  }

  /* ---------------- mentor AI assistance ---------------- */

  if (path === '/api/mentor/prep' && method === 'POST') {
    const blocked = crossOrigin(request, env)
    if (blocked) return blocked
    const denied = await requireMentor(profile)
    if (denied) return denied
    const input = await body(request, prepInput)
    // The mentorship check is inside `prepareSession` and reads the request
    // rows, so a mentor cannot prepare for a student they did not accept.
    return json({ ok: true, prep: await prepareSession(env, user.sub, input.menteeId) })
  }

  /* ---------------- original AI features ---------------- */

  if (path === '/api/ai/usage' && method === 'GET') {
    return json({
      ok: true,
      ai: aiStatus(env),
      usage: await usageSummary(env.DB, user.sub, aiStatus(env).rateLimitPerHour),
    })
  }

  if (path === '/api/vision-match' && method === 'POST') {
    const blocked = crossOrigin(request, env)
    if (blocked) return blocked
    const input = await body(
      request,
      object({ imageBase64: string({ max: 12_000_000 }), mimeType: string({ max: 80 }) }),
    )
    if (!/^image\/(png|jpe?g|webp|gif)$/.test(input.mimeType)) return fail(400, 'Unsupported image type')
    if (base64Size(input.imageBase64) > MAX_IMAGE_BYTES) return fail(413, 'Image is larger than 6 MB')
    return json({ ok: true, ...(await visionMatch(env, user.sub, input.imageBase64, input.mimeType)) })
  }

  if (path === '/api/match' && method === 'POST') {
    const blocked = crossOrigin(request, env)
    if (blocked) return blocked
    const input = await body(
      request,
      object({
        profile: object({
          skills: withDefault(stringArray({ max: 12 }), []),
          goal: withDefault(string({ max: 200 }), ''),
          days: withDefault(stringArray({ max: 7 }), []),
          career: withDefault(string({ max: 60 }), ''),
          vibe: withDefault(string({ max: 40 }), 'patient'),
        }),
      }),
    )
    const matchProfile: MatchProfile = {
      skills: input.profile.skills,
      goal: input.profile.goal,
      days: input.profile.days,
      career: input.profile.career,
      vibe: input.profile.vibe,
    }
    return json({ ok: true, ...(await matchMentors(env, user.sub, matchProfile)) })
  }

  if (path === '/api/standup' && method === 'POST') {
    const blocked = crossOrigin(request, env)
    if (blocked) return blocked
    const input = await body(
      request,
      object({
        audioBase64: string({ max: 20_000_000 }),
        mimeType: string({ max: 80 }),
        durationMs: withDefault(string({ max: 20 }), '0'),
      }),
    )
    if (!/^audio\//.test(input.mimeType)) return fail(400, 'Unsupported audio type')
    if (base64Size(input.audioBase64) > MAX_AUDIO_BYTES) return fail(413, 'Recording is larger than 12 MB')
    const result = await runStandup(env, user.sub, input.audioBase64, input.mimeType, Number(input.durationMs) || 0)
    return json({ ok: true, ...result, ...(await getRoadmapView(env.DB, user.sub)) })
  }

  if (path === '/api/code-review' && method === 'POST') {
    const blocked = crossOrigin(request, env)
    if (blocked) return blocked
    const input = await body(
      request,
      object({ language: withDefault(string({ max: 40 }), 'code'), code: string({ max: MAX_CODE_CHARS }) }),
    )
    return json({ ok: true, ...(await runCodeReview(env, user.sub, input.language, input.code)) })
  }

  /* ---------------- the assistant ---------------- */

  /**
   * The chat. Identity is the session, the mentors come from the matching engine, and
   * the transcript this call is allowed to see is capped: the client's scrollback is
   * display state, not an instruction channel.
   */
  if (path === '/api/assistant/chat' && method === 'POST') {
    const blocked = crossOrigin(request, env)
    if (blocked) return blocked
    const input = await body(
      request,
      object({
        message: string({ min: 3, max: 2000 }),
        history: optional(
          arrayOf(
            object({
              role: string({ values: ['user', 'assistant'] }),
              text: string({ min: 1, max: 2000 }),
            }),
            { max: CHAT_MAX_TURNS },
          ),
        ),
      }),
    )
    await enforceActionLimit(env.DB, user.sub, 'assistant.chat')
    const history: ChatTurn[] = (input.history ?? []).map((turn) => ({
      role: turn.role === 'user' ? 'user' : 'assistant',
      text: turn.text,
    }))
    const answer = await askAssistant(env, user.sub, profile, input.message, history)
    return json({ ok: true, ...answer })
  }

  if (path === '/api/events' && method === 'GET') {
    return json({ ok: true, events: await getAgentEvents(env, user.sub) })
  }

  return fail(404, `No such endpoint: ${method} ${path}`)
}

async function route(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url)

  if (url.pathname.startsWith('/api/')) {
    try {
      await bootstrap(env)
      return await handleApi(request, env, url)
    } catch (error) {
      // An AI failure is a typed, user-actionable outcome: unconfigured provider,
      // rate limit, timeout, or malformed output. Its message is written for the
      // user and carries no key material, so it is returned as-is.
      if (error instanceof AiError) return json(error.toPayload(), error.status)

      // A rejected request body is the caller's problem, and saying which field
      // is wrong is the whole point of the validator.
      if (error instanceof InputError) return json({ ok: false, error: error.message, code: 'invalid_input' }, 400)
      if (error instanceof InputShapeError) return json({ ok: false, error: error.message, code: 'invalid_input' }, 400)
      if (error instanceof RequestError) return json({ ok: false, error: error.message, code: 'request_rejected' }, error.status)

      // Anything else is a bug: log the detail server side, stay vague to the client.
      console.error('[pathfinders] api error', error instanceof Error ? error.stack : error)
      return fail(500, 'Unexpected server error.')
    }
  }

  if (env.ASSETS) return env.ASSETS.fetch(request)
  return new Response('Not found', { status: 404 })
}

/**
 * One wrapped handler per isolate (it is where `/auth/freebuff/*` is served and
 * where expired sessions are refreshed), recreated only if the auth config
 * changes: which in practice means never.
 */
type Handler = (request: Request, env: Env) => Promise<Response>

let handler: Handler | undefined
let handlerKey: string | undefined

function app(env: Env): Handler {
  const auth = freebuffAuth(env)
  const key = auth ? `${auth.clientId}|${auth.issuer}|${env.APP_ORIGIN}` : 'unconfigured'
  if (!handler || handlerKey !== key) {
    handler = auth ? auth.wrap(route) : route
    handlerKey = key
  }
  return handler
}

export default {
  fetch(request: Request, env: Env): Promise<Response> {
    return app(env)(request, env)
  },
}
