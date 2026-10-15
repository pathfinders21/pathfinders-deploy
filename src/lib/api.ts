/**
 * The one place the interface talks to the backend.
 *
 * Three rules it exists to enforce:
 *  1. Identity is the session cookie, never a value this code invents. Requests are
 *     same origin with credentials, and every user scoped call is authorised again
 *     on the server.
 *  2. A failure is never turned into a success. The server's message is shown as it
 *     is written, because it is written to be shown, and the error kind is kept so a
 *     caller can decide whether a retry is honest.
 *  3. Anything the model produced is labelled with the engine that produced it, so a
 *     deterministic stand-in can never be presented as a model answer.
 */
import { EntitlementsResponse } from '../types'

export type ApiErrorKind =
  | 'signed_out'
  | 'forbidden'
  | 'not_found'
  | 'rate_limited'
  | 'ai'
  | 'network'
  | 'timeout'
  | 'server'
  | 'invalid'

const KIND_BY_STATUS: Record<number, ApiErrorKind> = {
  400: 'invalid',
  401: 'signed_out',
  403: 'forbidden',
  404: 'not_found',
  409: 'invalid',
  413: 'invalid',
  429: 'rate_limited',
}

export type ApiErrorInit = {
  kind: ApiErrorKind
  status: number
  message: string
  code?: string
  retryable?: boolean
  retryAfter?: number
  requiredEnv?: string[]
}

export class ApiError extends Error {
  readonly kind: ApiErrorKind
  readonly status: number
  /** The provider failure vocabulary, when the server sent one. */
  readonly code?: string
  readonly retryable: boolean
  readonly retryAfter?: number
  readonly requiredEnv?: string[]

  constructor(init: ApiErrorInit) {
    super(init.message)
    this.name = 'ApiError'
    this.kind = init.kind
    this.status = init.status
    this.code = init.code
    this.retryable = init.retryable ?? (init.kind === 'network' || init.kind === 'timeout' || init.kind === 'rate_limited')
    this.retryAfter = init.retryAfter
    this.requiredEnv = init.requiredEnv
  }

  /** What to tell the user, plus the one thing they could change. */
  get userMessage(): string {
    if (this.kind === 'signed_out') return 'Sign in to use this.'
    if (this.kind === 'ai' && this.requiredEnv?.length) {
      return `${this.message} This needs ${this.requiredEnv.join(', ')} set on the server.`
    }
    return this.message
  }
}

const DEFAULT_TIMEOUT_MS = 30_000

type RequestOptions = {
  method?: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE'
  body?: unknown
  timeoutMs?: number
  signal?: AbortSignal
}

export async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const controller = new AbortController()
  const timeout = window.setTimeout(() => controller.abort(), options.timeoutMs ?? DEFAULT_TIMEOUT_MS)

  const abort = () => controller.abort()
  options.signal?.addEventListener('abort', abort)

  let response: Response
  try {
    response = await fetch(path, {
      method: options.method ?? 'GET',
      credentials: 'same-origin',
      headers: options.body === undefined ? {} : { 'content-type': 'application/json' },
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
      signal: controller.signal,
    })
  } catch (error) {
    const aborted = error instanceof DOMException && error.name === 'AbortError'
    throw new ApiError({
      kind: aborted ? 'timeout' : 'network',
      status: 0,
      message: aborted
        ? 'That request took too long and was stopped. Nothing was saved.'
        : 'Could not reach the server. Check your connection and try again.',
    })
  } finally {
    window.clearTimeout(timeout)
    options.signal?.removeEventListener('abort', abort)
  }

  const text = await response.text()
  let payload: Record<string, unknown> | null = null
  try {
    payload = text ? (JSON.parse(text) as Record<string, unknown>) : null
  } catch {
    payload = null
  }

  //
  // A 200 that is not JSON is not this API answering. A static host with a single page
  // app fallback answers `/api/profile` with index.html and a 200, and treating that as
  // success handed callers an empty object, which is what made a signed in screen read a
  // profile that was never there. Anything that answered with a body this code cannot
  // parse is reported as a server failure, so the callers fall back to their labelled
  // sample data instead of drawing from nothing.
  //
  if (response.ok) {
    if (text && payload === null) {
      throw new ApiError({
        kind: 'server',
        status: response.status,
        message: 'The server sent a response this application could not read. Nothing was saved.',
      })
    }
    return (payload ?? {}) as T
  }

  // The server writes these messages to be read by the person who hit the error.
  const message =
    typeof payload?.error === 'string' && payload.error
      ? payload.error
      : `The server returned ${response.status}. Nothing was saved.`

  const code = typeof payload?.code === 'string' ? payload.code : undefined
  const kind = code ? 'ai' : (KIND_BY_STATUS[response.status] ?? 'server')

  throw new ApiError({
    kind,
    status: response.status,
    message,
    code,
    retryable: typeof payload?.retryable === 'boolean' ? payload.retryable : undefined,
    retryAfter: typeof payload?.retryAfter === 'number' ? payload.retryAfter : undefined,
    requiredEnv: Array.isArray(payload?.requiredEnv) ? (payload.requiredEnv as string[]) : undefined,
  })
}

/* ------------------------------------------------------------------ *
 *  Wire types. Mirrors of what the Worker returns, kept small on purpose.
 * ------------------------------------------------------------------ */

export type Engine = 'gemini' | 'demo'

export type ApiProfile = {
  userId: string
  role: 'mentee' | 'mentor' | ''
  displayName: string
  email: string
  goalsText: string
  projectText: string
  skillsHave: string[]
  skillsWant: string[]
  interests: string[]
  industries: string[]
  hoursPerWeek: string
  completion: number
}

export type ProfileResponse = {
  ok: true
  profile: ApiProfile
  role: ApiProfile['role']
  roleChosen: boolean
  completion: number
  onboardingComplete: boolean
  mentorReady?: boolean
  mentorMissing?: string[]
  /** True once the labeled demo scenario has been seeded into this account. */
  demoSeeded?: boolean
  demoSeededAt?: string | null
}

export type SeedDemoResponse = ProfileResponse & {
  alreadySeeded: boolean
  seeded: string[]
  skipped: string[]
  note: string
  demoSeededAt: string | null
}

export type AssessmentStrength = {
  skill: string
  evidence: string
  confidence: number
  source: 'evidenced' | 'self_reported'
}

export type AssessmentGap = {
  skill: string
  why: string
  evidence: string
  priority: 'high' | 'medium' | 'low'
  confidence: number
  exercises: string[]
}

export type Assessment = {
  id: string
  createdAt: string
  engine: Engine
  provisional: boolean
  downgraded: number
  targetRole: string
  summary: string
  strengths: AssessmentStrength[]
  gaps: AssessmentGap[]
  assumptions: string[]
  questionsToStrengthen: string[]
}

export type AssessmentResponse = {
  ok: true
  needsMoreInfo: boolean
  assessment?: Assessment | null
  history?: Assessment[]
  note?: string
  cached?: boolean
  missing?: string[]
  improvements?: string[]
  readiness?: { ready: boolean; provisional: boolean; missing: string[]; improvements: string[] }
}

export type AgentEvidence = { ref: 'profile' | 'goal' | 'progress' | 'overdue' | 'stalled'; detail: string }

export type AgentProposal = {
  id: string
  createdAt: string
  engine: Engine
  status: 'pending' | 'approved' | 'rejected' | 'failed'
  triggerKind: string
  triggerRef: string
  actionKind: 'create_milestone' | 'update_milestone' | 'save_action_item' | 'prepare_request'
  title: string
  detail: string
  reasoning: string
  evidence: AgentEvidence[]
  milestoneRef: string
  estimate: string
  deadline: string
  confidence: number
  mentorId: string
  decidedAt: string | null
  executedAt: string | null
  result: string | null
}

export type AgentView = {
  ok: true
  proposals: AgentProposal[]
  findings: Array<{ kind: string; ref: string; detail: string }>
  state: {
    goalTitle: string
    hasRoadmap: boolean
    doneCount: number
    totalCount: number
    overdueCount: number
    stalledCount: number
  }
  note: string
}

export type AgentDecision = {
  ok: true
  proposal: AgentProposal
  executed: boolean
  changed: string[]
  message: string
}

export type HealthResponse = {
  ok: true
  aiConfigured: boolean
  engine: 'gemini' | 'demo' | 'unconfigured'
  model: string | null
  authConfigured: boolean
  ai: { configured: boolean; demoMode: boolean; model: string; rateLimitPerHour: number }
}

/* ---------------- roadmap ---------------- */

export type Goal = {
  id: string
  userId: string
  title: string
  rationale: string
  source: 'ai' | 'user'
  status: 'active' | 'paused' | 'achieved' | 'archived'
  createdAt: string
  updatedAt: string
}

export type RoadmapStep = {
  id: string
  parentId: string | null
  position: number
  title: string
  detail: string
  status: 'pending' | 'done'
  kind: 'milestone' | 'task'
  origin: 'ai' | 'seed' | 'user'
  aiGenerated: boolean
  source: string
  estimate: string
  deadline: string | null
  createdAt: string
  updatedAt: string
  lastTouchedAt: string
}

export type RoadmapStats = {
  total: number
  done: number
  percent: number
  milestones: number
  milestonesDone: number
  overdue: number
  nextDeadline: string | null
}

export type RoadmapDoc = {
  id: string
  goalId: string
  goalTitle: string
  title: string
  rationale: string
  status: string
  revision: number
  createdAt: string
  updatedAt: string
  steps: RoadmapStep[]
  stats: RoadmapStats
}

export type RoadmapView = {
  ok: true
  goal: Goal | null
  roadmap: RoadmapDoc | null
  goals: Goal[]
  events: Array<{ id: string; kind: string; title: string; detail: string; createdAt: string }>
}

export type PlanTask = { title: string; detail: string; estimate: string }
export type PlanMilestone = { title: string; why: string; tasks: PlanTask[] }
export type RoadmapPlan = { title: string; rationale: string; milestones: PlanMilestone[] }

/** A generated plan is a proposal: applying it is a separate, confirmed call. */
export type PlanResponse = {
  ok: true
  goal: Goal
  plan: RoadmapPlan
  engine: Engine
  requiresConfirmation: boolean
}

export type ApplyResponse = RoadmapView & { created: number; replaced: number; preserved: number }
export type TickResponse = RoadmapView & { updated: number; skipped: string[]; note: string }

/* ---------------- matching ---------------- */

export type MatchFactor = {
  key: string
  label: string
  weight: number
  /** 0..1 when both sides have the data, null when one side is blank. */
  normalized: number | null
  contribution: number
  note: string
}

export type MatchMentor = {
  id: string
  name: string
  headline: string
  expertise: string[]
  interests: string[]
  careers: string[]
  industries: string[]
  mentorGoals: string[]
  availability: string[]
  mentoringStyle: string
  bio: string
  sessions: number | null
  rating: number | null
  active: boolean
  ready: boolean
  missing: string[]
  verification: string
  account: boolean
}

export type RankedMentor = {
  mentor: MatchMentor
  score: number
  confidence: 'high' | 'medium' | 'low'
  factors: MatchFactor[]
  missing: string[]
  overlaps: { goals: string[]; skills: string[]; interests: string[]; days: string[]; industries: string[] }
  explanation: { headline: string; summary: string; caveats: string[] }
  summary: string
  phrasedBy: Engine
}

export type MatchResponse = {
  ok: true
  matches: RankedMentor[]
  excluded: Record<string, number>
  excludedReasonText: string[]
  note: string
  weights: Record<string, number>
  weightsNote: string
  disclaimer: string
  goalsConsidered: string | null
  candidatePool: number
  engine: Engine
  profile: ApiProfile
}

/* ---------------- requests ---------------- */

export type RequestStatus = 'pending' | 'accepted' | 'declined' | 'withdrawn'

export type MenteeBrief = {
  userId: string
  name: string
  program: string
  year: string
  skillsHave: string[]
  skillsWant: string[]
  goal: string
}

export type RequestView = {
  id: string
  direction: 'incoming' | 'outgoing'
  status: RequestStatus
  message: string
  response: string
  matchScore: number | null
  goalTitle: string | null
  createdAt: string
  updatedAt: string
  mentor: { id: string; name: string; headline: string; expertise: string[] } | null
  mentee: MenteeBrief | null
  can: { accept: boolean; decline: boolean; withdraw: boolean }
}

export type RequestsResponse = {
  ok: true
  role: 'mentor' | 'mentee'
  incoming?: RequestView[]
  outgoing?: RequestView[]
  mentors?: Array<{ id: string; name: string; headline: string; expertise: string[] }>
}

export type MenteeView = MenteeBrief & {
  requestId: string
  goals: Array<{ id: string; title: string; status: string }>
  since: string
}

/* ---------------- the assistant ---------------- */

/** One mentor as the chat shows them: the matching engine's ranking, not the model's. */
export type AssistantMentor = {
  id: string
  name: string
  headline: string
  expertise: string[]
  /** The engine's 0 to 100 fit score: a ranking signal, not a probability of success. */
  score: number
  /** The engine's own written reason, phrased by the model or by the app. */
  summary: string
}

/** One earlier turn, so the assistant can follow a conversation. */
export type AssistantTurn = { role: 'user' | 'assistant'; text: string }

export type AssistantResponse = {
  ok: true
  reply: string
  followUps: string[]
  mentors: AssistantMentor[]
  engine: Engine
  cached: boolean
  /** How many mentors the engine had to choose from, so an empty list can be explained. */
  considered: number
  note: string
}

export const api = {
  health: () => request<HealthResponse>('/api/health', { timeoutMs: 8000 }),
  profile: () => request<ProfileResponse>('/api/profile'),
  patchProfile: (patch: Partial<ApiProfile>) =>
    request<ProfileResponse>('/api/profile', { method: 'PATCH', body: patch }),
  assessment: () => request<AssessmentResponse>('/api/assessment'),
  runAssessment: (body: { refresh?: boolean; projectText?: string; goalText?: string }) =>
    request<AssessmentResponse>('/api/assessment', { method: 'POST', body, timeoutMs: 60_000 }),
  agent: () => request<AgentView>('/api/agent'),
  propose: (trigger?: string) =>
    request<{ ok: true; proposal: AgentProposal | null; reused: boolean; findings: AgentView['findings']; note: string }>(
      '/api/agent/propose',
      { method: 'POST', body: trigger ? { trigger } : {}, timeoutMs: 60_000 },
    ),
  decide: (id: string, kind: 'approve' | 'reject', edit?: { title?: string; detail?: string; clearDeadline?: boolean }) =>
    request<AgentDecision>(`/api/agent/proposals/${encodeURIComponent(id)}/decision`, {
      method: 'POST',
      body: { kind, ...(edit ? { edit } : {}) },
    }),
  /** "Report a poor recommendation". Stored against the reporter; nothing else happens. */
  reportFeedback: (body: { feature: 'assessment' | 'agent' | 'match' | 'roadmap'; subject?: string; note?: string }) =>
    request<{ ok: true; recorded: boolean; note: string }>('/api/feedback', { method: 'POST', body }),

  /**
   * The assistant chat. The mentors in the reply are ranked by the matching engine
   * before the model sees them, and the model may only pick from that list.
   */
  askAssistant: (body: { message: string; history?: AssistantTurn[] }) =>
    request<AssistantResponse>('/api/assistant/chat', { method: 'POST', body, timeoutMs: 60_000 }),

  /* roadmap */
  roadmap: () => request<RoadmapView>('/api/roadmap'),
  createGoal: (body: { title: string; rationale?: string; source?: 'ai' | 'user' }) =>
    request<{ ok: true; goal: Goal }>('/api/career/goals', { method: 'POST', body }),
  /** Generation only. Nothing is written until `applyPlan` confirms the plan. */
  planRoadmap: (body: { goalId?: string; regenerate?: boolean } = {}) =>
    request<PlanResponse>('/api/roadmap/plan', { method: 'POST', body, timeoutMs: 90_000 }),
  applyPlan: (body: { goalId?: string; plan: RoadmapPlan }) =>
    request<ApplyResponse>('/api/roadmap/apply', { method: 'POST', body }),
  tickRoadmap: (force = false) =>
    request<TickResponse>('/api/roadmap/tick', { method: 'POST', body: { force }, timeoutMs: 60_000 }),
  addStep: (body: { title: string; detail?: string; estimate?: string; deadline?: string | null; parentId?: string }) =>
    request<RoadmapView & { step: RoadmapStep }>('/api/roadmap/steps', { method: 'POST', body }),
  updateStep: (id: string, patch: { status?: 'pending' | 'done'; title?: string; detail?: string; estimate?: string; deadline?: string | null }) =>
    request<RoadmapView>(`/api/roadmap/steps/${encodeURIComponent(id)}`, { method: 'PATCH', body: patch }),
  deleteStep: (id: string) =>
    request<RoadmapView>(`/api/roadmap/steps/${encodeURIComponent(id)}`, { method: 'DELETE' }),

  /* the labeled demo scenario */
  seedDemo: () => request<SeedDemoResponse>('/api/demo/seed', { method: 'POST', body: {}, timeoutMs: 60_000 }),

  /* matching */
  matches: (phrase = false) => request<MatchResponse>(`/api/matches${phrase ? '?phrase=1' : ''}`, { timeoutMs: 90_000 }),

  /* requests and mentees */
  requests: () => request<RequestsResponse>('/api/requests'),
  createRequest: (body: { mentorId: string; message?: string; goalId?: string }) =>
    request<{ ok: true; request: RequestView }>('/api/requests', { method: 'POST', body }),
  transitionRequest: (id: string, action: 'accept' | 'decline' | 'withdraw', response = '') =>
    request<{ ok: true; request: RequestView }>(`/api/requests/${encodeURIComponent(id)}/${action}`, {
      method: 'POST',
      body: { response },
    }),
  mentees: () => request<{ ok: true; mentees: MenteeView[] }>('/api/mentees'),
  getEntitlements: (userId?: string) => request<EntitlementsResponse>(`/api/get-entitlements/${userId ?? 'current'}`),
}
