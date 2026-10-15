# Progress

> See [`docs/IMPLEMENTATION_REPORT.md`](docs/IMPLEMENTATION_REPORT.md) for the full
> account of this upgrade: what was found, what was fixed, what was verified and what
> could not be.

| Phase | Status | Notes |
| --- | --- | --- |
| 1: Audit and foundation | ✅ done | `docs/AI_UPGRADE_PLAN.md`; the Convex/PathFinders mismatch is documented there, not papered over |
| 2: AI infrastructure | ✅ done | `worker/lib/ai/{provider,usage,schema,config,errors}.ts`; verified in workerd |
| 3: Student career intelligence | ✅ done | profiles + server role, Career Navigator, persistent goals, generated/editable roadmap |
| 4: Intelligent matching | ✅ done | eligibility → weighted scoring → explanations → request flow with server-enforced transitions |
| 5: Trust, messaging and continuity | ✅ done | mentor verification (submit → review → decide), in-app messaging between accepted pairs, contribution record, mentor session preparation, per-user abuse limits |
| 6: Mentor dashboard + session copilot | ✅ done | verification panel, contribution record, per-mentee thread, AI session preparation (labelled by engine) |
| 7: Resume review | ⏭ not started | |
| 8: Polish and verification | 🟡 partial | rebranded to PathFinders, false verification claims removed, 123 tests green, build green; no browser-based accessibility or end to end sign-in run (no browser in this environment) |

Minimum shippable slice (P1 to P4) is complete.

## Phase 3: student career intelligence

**New modules**

- `worker/lib/profile.ts`: `profiles` row, **the server-owned role**, completion and
  the mentor readiness gate. The role is written once from a validated onboarding call and
  never from a client field; an unset role has mentee privileges and nothing more.
- `worker/lib/validate.ts`: one validator set for every request body. Rejects rather
  than coerces: an unknown role, an `admin` string, a scalar where a list is expected.
- `worker/lib/career.ts`: Career Navigator (`suggestPaths`) and the conversational
  onboarding extractor (`extractProfile`, every field optional so nothing is inferred).
- `worker/lib/roadmap.ts`: goals, the persistent roadmap, plan generation/validation,
  step editing and the stalled-step agent tick. Moved out of `features.ts`, which now
  holds only the original five features.
- `worker/lib/ai/config.ts`, `schema.ts`, `provider.ts`: reused unchanged.

**Schema (additive, `UPGRADE_SCHEMA_SQL` + `ADDITIVE_COLUMNS`)**: `profiles`, `goals`,
`career_paths`, `mentorship_requests`, `match_snapshots`, `roadmap_revisions`, plus
indexes. `roadmaps` gained `goal_id`, `rationale`, `status`, `updated_at`, `revision`;
`roadmap_steps` gained `deadline`, `estimate`, `updated_at`, `kind`, `origin`.

**Routes**: `GET/PATCH /api/profile`, `POST /api/profile/extract`, `GET/POST
/api/career/paths`, `POST /api/career/goals`, `GET /api/goals`, `PATCH /api/goals/:id`,
`GET /api/roadmap`, `POST /api/roadmap/plan`, `POST /api/roadmap/apply`, `POST
/api/roadmap/steps`, `PATCH|DELETE /api/roadmap/steps/:id`, `POST /api/roadmap/tick`.

**Behaviour that matters**

- Generation and regeneration are **previews**. `/api/roadmap/plan` writes nothing;
  `/api/roadmap/apply` re-validates the confirmed plan against the model's own spec
  before writing, so a preview cannot be smuggled into a different plan.
- Regeneration deletes only `status != 'done' AND origin != 'user'` rows. Completed work
  and personal tasks survive, and the page says so.
- Progress is computed from stored rows (`stats()`), never from a counter beside them.

## Phase 4: intelligent matching

- `worker/lib/matching/engine.ts`: **pure**, no database, no model, no clock:
  Stage A eligibility, Stage B the six weighted factors, Stage C the explanation.
- `worker/lib/matching/index.ts`: reads real mentor profiles, runs the engine, persists
  `match_snapshots`, and *optionally* lets a model **rephrase** the computed explanation
  (`?phrase=1`). The model never chooses or reorders.
- `worker/lib/requests.ts`: the request flow. Three transitions, each from `pending`,
  each performed by the one side entitled to it, with ownership repeated in the `UPDATE`
  predicate so a race cannot move a row the caller does not own.
- `worker/lib/csrf.ts`: the CSRF decision extracted from the router so it is testable.

**Weights**: career-goal alignment 25 · skills and learning needs 25 · mentor expertise
20 · interests and mentoring preferences 10 · availability 10 · industry and experience
relevance 10. Missing data drops the factor and **renormalises** the rest; it is never
counted as a mismatch, and confidence falls to medium/low with an explicit `missing[]`.
A result is a **fit score for ranking**, never a probability of success.

**Frontend**

- `src/lib/api.ts`: typed client + a module-level profile store (one request per page
  load, invalidated when the account changes).
- `src/pages/Onboarding.tsx`: progressive profile, role chosen once, optional AI
  "fill from a description" that only ever pre-fills fields the student then reviews.
- `src/pages/Navigator.tsx`: three directions, each with assumptions, tradeoffs and one
  first action; choosing one creates a goal.
- `src/pages/Roadmap.tsx`: progress, milestones, complete/reopen, edit, add, delete,
  deadline, preview → confirm generation and regeneration, agent check-in.
- `src/pages/Mentors.tsx`: real recommendations with the factor breakdown and caveats,
  plus the request dialog; the illustrative directory is now labelled and browse-only.
- `src/pages/Dashboard.tsx`: student view (goal, next action, progress, requests,
  recommendations) and mentor view (readiness gaps, incoming requests with accept/decline,
  accepted mentees) behind the server-owned role.
- `src/components/ai/RoadmapPanel.tsx` **deleted**: superseded by `/roadmap`.
  `AiWorkspace` keeps the standup, code review, vibe matcher and activity feed.

## Verification (this pass)

- `npm run typecheck`: app + worker clean.
- `npm test`: **95 passed** across 9 files (engine 15, requests 17, csrf 7, profile 7,
  validate 10, roadmap 10, provider 15, schema 8, config 6).
- `npm run build`: vite production build succeeds.
- `wrangler dev` against a **fresh** local D1: health 200 (demo mode, auth configured),
  `/api/mentors` 200, and **401** for `/api/profile` (GET + PATCH), `/api/career/paths`,
  `/api/goals`, `/api/roadmap`, `/api/roadmap/plan`, `/api/matches`, `/api/requests`
  (GET + POST), `/api/requests/:id/accept`, `/api/mentees`, `/api/ai/usage`, `/api/events`.
- Real D1: all Phase 3 to 4 tables created and every additive column present on
  `roadmaps`/`roadmap_steps`. `INSERT OR IGNORE` keeps the first profile row; the
  `match_snapshots` upsert replaces; an owner-scoped `UPDATE … WHERE status='pending'`
  changed nothing for the wrong mentor, applied for the right one, and a second
  transition left the terminal state alone.
- Dev preview: Vite on `0.0.0.0:3000` behind workerd on `127.0.0.1:8787`; `/`,
  `/navigator`, `/roadmap`, `/onboarding` all 200 HTML, `/api/health` proxied 200,
  `/api/profile` proxied 401, and an unlisted `Host` rejected with 403.

**Not verified here:** any authenticated HTTP flow (no browser, so no session), a real
sign-in round trip, a real provider round trip (no key), and the deployed preview.
See SECURITY.md for the full list.

## Blockers

- No provider key in this environment, so the deterministic engine is enabled locally via
  `AI_DEMO_MODE=true` and a deployed environment reports *requires configuration*.
- No Convex in the repo: see `docs/AI_UPGRADE_PLAN.md` §0.
- Phases 5 to 8 are not started. Stopping at a phase boundary with a working app, as the
  brief requires, rather than leaving half-built pages.

## AI-first upgrade (Vibecon 2.0, Track 02)

Five vertical slices were planned; four shipped and one is explicitly not built. The audit
and the full account are in `docs/IMPLEMENTATION_REPORT.md`; the demo is scripted in
`docs/DEMO_SCRIPT.md`.

- **Slice 1, assessment and gap analysis**: `worker/lib/assessment.ts`, `POST/GET
  /api/assessment`, screen at `#/assess`.
- **Slice 2, real roadmap generation**: proposal and apply split already existed in
  `worker/lib/roadmap.ts`; it now has an interface of its own in
  `src/components/RoadmapWorkspace.tsx`.
- **Slice 3, adaptation agent**: `worker/lib/agent.ts`, `POST /api/agent/propose`,
  `POST /api/agent/proposals/:id/decision`, history kept, idempotent execution, screen at
  `#/agent` and on the workspace.
- **Slice 4, explainable matching**: `src/components/MatchPanel.tsx` renders the factor
  breakdown, the written reason, the label for who wrote it and the disclaimer.
- **Slice 5, evidence and session copilot: not built.** Said so in the README, the report
  and the demo script rather than implied to exist.
- The signed in screens now call the Worker: student workspace
  (`src/components/StudentWorkspace.tsx`) and mentor hub (`src/components/MentorInbox.tsx`).
  Without a session those screens show the sample workspace under an amber banner.
- A labeled demo scenario seed (`worker/lib/demo_seed.ts`) exists so the loop can be shown
  on an empty account; it is additive, idempotent and gated on `AI_DEMO_MODE`.

Checks after the upgrade: typecheck exit 0, **240 tests across 29 files pass**, `vite build`
clean (1707 modules), Worker dry run bundle clean. `wrangler dev` against a freshly reset
local D1 answers `/api/health` 200 (`engine: demo`, `authConfigured: true`), `/api/mentors`
200, and `profile`, `assessment`, `matches`, `agent`, `demo/seed`, `roadmap/plan` all 401
signed out. Through the dev origin the app answers 200 for the preview hostname and 403 for
a foreign Host, and proxies `/api` to the Worker.

**A defect the live check found:** the schema batch handed to `D1Database.exec` had SQL
comments joined onto the statements after them, so a fresh database answered 500 to every
route including `/api/health`. Fixed in `schemaSqlForExec`, pinned by
`worker/lib/schema.test.ts`.

**Still not verified:** no real provider round trip (no key, every AI test uses a mocked
provider) and no authenticated browser flow (no browser here), so the sign-in, approval and
persistence paths are proven in jsdom and over HTTP, not by a person clicking them.
