# Security and privacy

Written for the state of the code at the **Phase 4** boundary. It describes what is
enforced today, what was actually tested, and what is **not** covered. It is not a claim
that the system is vulnerability-free.

## Trust boundaries

```
Browser  ──(same-origin session cookie)──►  Worker
                                              ├─ @freebuff/auth     identity (user.sub)
                                              ├─ profiles.role      the only role
                                              ├─ worker/index.ts    authorization + validation
                                              ├─ lib/matching/      deterministic, pure
                                              ├─ lib/ai/*           the only outbound calls
                                              └─ D1                 all authoritative state
```

- **The browser is untrusted.** It is a view. Nothing in `src/` decides who may read or
  write anything; hiding a control is a UX choice, not a control. The remembered role in
  `localStorage` is a fallback *label* for the moment before the profile loads and grants
  nothing: `useSession()` prefers the server's value and every write is authorised on the
  Worker.
- **The Worker is the only authority.** Every route past `/api/mentors` resolves the caller
  with `currentUser(request, env)`; every statement is scoped by `user.sub`.
- **The model provider is untrusted input.** Output is parsed, schema-validated and only
  then used. It can never name a row of its own choosing: a standup's completed-step titles
  are mapped back to real ids, and a roadmap plan the student confirms is re-validated
  against the model's own spec before it is written.
- **User content is untrusted instruction.** Prompts tell the model to ignore instructions
  inside images, code, profile text and task text. This reduces, but cannot eliminate,
  prompt-injection risk: see limitations.

## Roles

`profiles.role` is the only role, it lives on the server, and it is set once.

- Onboarding writes it through `PATCH /api/profile`, whose validator accepts exactly
  `mentee` or `mentor`: `admin` and case variants are rejected (tested).
- `saveProfile` changes the role only from an unset value. A later attempt returns the
  stored role unchanged plus a warning, so a student cannot promote themselves even by
  editing their own account.
- An unset role has mentee privileges and nothing more.
- Mentor-only routes (`GET /api/mentees`, and the accept/decline transitions) verify
  `role === 'mentor'` server side and answer 403 otherwise.
- A mentor account cannot send requests; a student cannot accept their own.

## Data permissions

| Route | Who may call it | Notes |
| --- | --- | --- |
| `GET /api/health`, `GET /api/mentors` | anyone | no user data / a public directory |
| `GET/PATCH /api/profile`, `POST /api/profile/extract` | the caller | their own row only |
| `GET/POST /api/career/paths`, `POST /api/career/goals`, `GET /api/goals`, `PATCH /api/goals/:id` | the caller | rows keyed by `user.sub` |
| `/api/roadmap*` | the caller | every statement scoped by `user.sub` |
| `GET /api/matches` | the caller | ranks other users' *mentor* profiles, which are the directory |
| `GET/POST /api/requests`, `GET /api/requests/:id` | the caller | mentee or mentor side of their own rows |
| `POST /api/requests/:id/{accept,decline}` | the mentor on that request | 404 otherwise |
| `POST /api/requests/:id/withdraw` | the student who sent it | 404 otherwise |
| `GET /api/mentees` | a mentor | accepted requests only |
| `POST /api/standup`, `/api/code-review`, `/api/match`, `/api/vision-match`, `GET /api/events`, `/api/ai/usage` | the caller | metered; requires a session |

- **No endpoint accepts a user id, owner id, email or role from the body or query.** The
  client-supplied `x-user-id` header the earlier demo used is gone.
- **What a mentor may see about a student** is `menteeSummary`: name, programme, year,
  skills and goal text: and only after accepting. Email, constraints and private fields
  are never sent. Tested at the unit level.
- **Request transitions** are `pending → accepted | declined` (mentor) and
  `pending → withdrawn` (student). The state machine is a table in `worker/lib/requests.ts`;
  each `UPDATE` repeats the ownership predicate, so a race cannot move a row the caller
  does not own, and a terminal request cannot be moved again.
- Mutations must pass `csrfVerdict(request, APP_ORIGIN)`; a foreign `Origin`, an
  `Origin: null`, or a cross site `Sec-Fetch-Site` is **403**. `APP_ORIGIN` is
  configuration, never derived from the request `Host`.
- The CSRF check runs **after** the session check, so an anonymous probe learns only
  "sign in required" (401). The 403 branch is what a signed-in victim's browser would hit;
  it is covered by `worker/lib/csrf.test.ts` rather than by an HTTP probe, because no
  session exists in the test environment.

## AI provider integration

- **One adapter.** `worker/lib/ai/provider.ts` is the only code that calls out. It
  enforces configuration, input size, per-user rate limit, duplicate suppression,
  timeouts, bounded retries, schema validation and accounting.
- **One definition per response.** `worker/lib/ai/schema.ts` produces both the provider's
  `responseSchema` and the validator, so the contract cannot drift. A response that fails
  validation is rejected and **nothing is written**.
- **AI never decides authorization or ordering.** Matching is deterministic; the model may
  only rephrase an explanation it is handed, and it is instructed to keep the given order
  and add nothing.
- **Keys.** `AI_API_KEY` is a Worker secret (`GEMINI_API_KEY` still works). It is never a
  `VITE_` variable, never in the bundle, never in a response body and never logged.
  `/api/health` and `/api/ai/usage` report only whether a key exists, the provider, the
  model and the limits.
- **No fabricated results.** Without a key, AI endpoints return 503 `ai_unconfigured`
  naming the variable to set. The deterministic engine is reachable only with
  `AI_DEMO_MODE=true` (local development), and every such result is labelled
  `engine: "demo"` in the payload and in the UI. A provider failure on a rephrasing call
  falls back to the deterministic explanation; a provider failure on generation is
  reported as in error rather than replaced by invented content.
- **Logs.** Provider failures log the HTTP status and a truncated provider message: never
  the request payload, prompt, key or user content.

## Rate limits and budgets

| Setting | Default | Purpose |
| --- | --- | --- |
| `AI_RATE_LIMIT_PER_HOUR` | 40 | per user, per hour, counted from `ai_usage` |
| `AI_MAX_INPUT_CHARS` | 120,000 | refuses an oversized input before spending a call |
| `AI_TIMEOUT_MS` | 20,000 | per attempt; an abandoned request cannot hang a client |
| `AI_MAX_RETRIES` | 2 | bounded; a 4xx is never retried |
| `AI_DEDUPE_WINDOW_MS` | 600,000 | identical requests reuse the stored, validated result |

Counters live in D1, not in module memory: a memory counter resets on every cold start and
is not shared between isolates. Duplicate suppression is token-based, so two simultaneous
identical requests produce exactly one provider call. Deterministic work (eligibility,
scoring, progress) costs no call at all, and stored career paths are reused across reloads.

## Verified by running it

Commands and observations, not intentions.

- `npm run typecheck`: app and Worker both clean.
- `npm test`: **95 passed** (9 files). Matching: eligibility excludes self, inactive,
  incomplete, blocked and already-requested mentors; an unstated schedule is *missing data*
  rather than a conflict; a dropped factor renormalises instead of scoring zero; two
  dropped factors lower confidence; ordering is stable across input order with an id
  tiebreak; the disclaimer denies the "probability" reading; example profiles are flagged.
  Requests: a student cannot accept their own request, an unrelated mentor cannot decline
  one, a mentor cannot withdraw, a terminal request cannot move again, a second request to
  the same mentor is refused, an unready mentor cannot be requested, a non-mentor account
  cannot be requested, and a mentor response never contains the student's email.
  Role/validation: `admin`, `ADMIN`, `Mentor`, `moderator`, `root` and empty are rejected;
  a non-string or an oversized value is rejected rather than coerced; the raw list length
  is capped before de-duplication.
  Roadmap: progress counts tasks not milestones, milestone completion is derived, overdue
  requires a real past deadline, and an invalid plan is rejected whole.
  AI provider: no key → `ai_unconfigured` with zero calls; oversized input → 413 before any
  call; 5xx → bounded retries then a truthful error; 400 → no retry; timeout → 504 measured
  at 1002 ms with `AI_MAX_RETRIES=0`; malformed output rejected with nothing cached; the
  second identical call is served from the store; two racing identical calls make one
  provider call; one user's cache is never served to another; the hourly limit is enforced
  per user; `aiStatus` never contains key material.
- `wrangler dev` against a **fresh local D1**: `/api/health` 200 (demo mode, auth
  configured), `/api/mentors` 200, and **401** for `/api/profile` (GET and PATCH),
  `/api/career/paths`, `/api/goals`, `/api/roadmap`, `/api/roadmap/plan`, `/api/matches`,
  `/api/requests` (GET and POST), `/api/requests/:id/accept`, `/api/mentees`,
  `/api/ai/usage`, `/api/events`.
- Real D1: all Phase 3 to 4 tables created and every additive column present on `roadmaps` and
  `roadmap_steps` (`pragma_table_info`). `INSERT OR IGNORE` kept the first profile row; the
  `match_snapshots` upsert replaced the score; an owner-scoped
  `UPDATE … WHERE status='pending'` changed nothing for the wrong mentor, applied for the
  right one, and left the terminal state alone on a second attempt.
- Dev preview bound to `0.0.0.0:3000` with workerd behind it: `/`, `/navigator`,
  `/roadmap`, `/onboarding` returned 200 HTML, `/api/health` proxied 200, `/api/profile`
  proxied 401, and an unlisted `Host` was rejected with 403.
- `npm run build`: production build succeeds.

### Not verified here

- **Any authenticated HTTP flow.** No browser automation is available and no session can be
  minted from a shell, so the end to end paths (onboarding → goal → roadmap → match →
  request → accept) were verified as pure/unit logic and as SQL against a real D1, **not**
  as signed-in requests over HTTP.
- A real sign-in round trip (needs a browser).
- A real provider round trip: no key exists in this environment, so the request shape is
  exercised only against a stubbed `fetch`.
- Two-account isolation over HTTP. Cross-user authorization is covered by unit tests
  (request ownership, mentor visibility) and by SQL-level checks, not by two concurrent
  sessions.
- The deployed preview. Nothing in this pass was deployed.

## Known limitations

1. **Prompt injection is mitigated, not solved.** User text and images reach the model. No
   model output is executed, and no output is used to address a row directly, but a
   determined attacker may still steer phrasing.
2. **The mentor directory is seeded demo data** (`worker/lib/db.ts:MENTOR_SEED`). Those rows
   are now labelled as illustrative and are **excluded from matching, scoring and the
   request flow**: the pool is real mentor accounts only. The seed still carries ratings
   and session counts, which are fixture values for a profile card, not measurements.
3. **No mentor verification or approval process exists.** Nothing is described as
   "verified" or "admin-approved", and adding such a label would require building the
   process first.
4. **No minors handling.** If the real audience includes under-18s, consent and safeguarding
   requirements are not implemented.
5. **`ai_cache` retains the model's answer** (not the prompt) for the dedupe window; it is
   swept opportunistically after 24 h and is scoped per user.
6. **`match_snapshots` stores scores and factor values** per (mentee, mentor) pair so a
   request can carry the number the student saw. It contains no free text from either side.
7. **No scheduling, video, recording or transcription exists.** The session copilot and the
   resume reviewer are Phase 6 to 7 and were not built; nothing in the UI claims a meeting,
   a recording or a file upload.
8. **Blocking is reserved, not implemented.** The engine accepts a `blockedMentorIds` set
   and `eligibility` honours it, but no feature populates it yet.
