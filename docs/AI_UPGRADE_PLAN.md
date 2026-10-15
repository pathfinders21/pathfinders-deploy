# AI-first upgrade: audit, architecture decision and plan

Status: **Phases 1 to 4 complete** (the minimum shippable slice). See PROGRESS.md. Written after inspecting the real codebase, not from the brief.

## 0. Two corrections to the brief, before anything else

**There is no PathFinders codebase and no Convex here.** The repository is
**MentorBridge** (`package.json:6`), a Vite + React 18 + TypeScript SPA with a
**Cloudflare Worker + D1** backend (`worker/`). There is:

- no `convex/` directory, no `convex` dependency, no `CONVEX_DEPLOYMENT`, no
  `convex.json`: `src/lib/convex.ts` is dead placeholder code from the original
  mock build and is imported by nothing;
- no Convex account, and no way to run one from this environment (no Docker, no
  long running Node, no persistent server process: the deploy target is a
  Workers fetch handler).

So the brief's "do not migrate off Convex" is unsatisfiable as written: there is
nothing to migrate off. The behaviours the brief attributes to Convex: authoritative server data, deterministic queries/mutations, external AI calls in
actions behind internal functions, server side authorization on every public
function: map one-to-one onto the existing Worker + D1 layer, and that is what
this upgrade builds. Section 6 records the mapping explicitly.

**Brand:** the brief says "PathFinders". The product identity in the repo is
MentorBridge (wordmark, `<title>`, `src/lib/brand.ts`). Per the brief's own rule
("preserve the product identity") the brand is **unchanged**; a rename is a
one-file change in `src/lib/brand.ts` plus `index.html` if you want it. Flagged,
not silently done.

## 1. What exists (audit)

### Routes
| Path | Page | State |
| --- | --- | --- |
| `/` | Landing (three.js backdrop, marketing sections) | implemented |
| `/login` | Freebuff sign-in | implemented |
| `/register` | role choice (mentee/mentor) | implemented, role is a **client label only** |
| `/mentors` | directory + screenshot matching | implemented |
| `/dashboard` | mentor view / mentee view + AI workspace | partial |
| `*` | redirect home | implemented |

### Auth
`@freebuff/auth` wraps the Worker fetch handler (`worker/lib/auth.ts`).
`user.sub` is the only identity; `/api/roadmap*`, `/api/standup`,
`/api/code-review`, `/api/events`, `/api/me` return 401 signed out and 403 on a
foreign `Origin`, verified in workerd. **Gap: no role is stored server side.**
`worker/lib/adapters/mentorship.ts:chooseRole` writes a localStorage label. No
endpoint may trust it: so today nothing is role-gated, because nothing can be.

### Backend (Worker + D1)
`worker/index.ts` routes 9 endpoints; `worker/lib/features.ts` holds the five AI
features; `worker/lib/gemini.ts` is a dependency-free Gemini REST client;
`worker/lib/db.ts` owns the schema (6 tables) and the mentor seed.

### Feature classification
| Feature | Status | Evidence |
| --- | --- | --- |
| Image-to-match (vision) | implemented | `features.ts:visionMatch` |
| Vibe/semantic matching | **partial + wrong** | `matchMentors` lets the model produce `vibeFit`, which it folds into the score. An LLM must not pick mentors. |
| Auto-adjusting roadmap | partial | one hard-wired roadmap title, no goal, no deadlines, no edit/regenerate, no history |
| Voice standup | implemented but **over-reaches** | auto-completes roadmap steps with no confirmation |
| AI code review | implemented | `runCodeReview` |
| Agent activity feed | implemented | `getAgentEvents` |
| Onboarding / profile | **missing** | no profile table, no endpoint |
| Career Navigator | **missing** |: |
| Persistent goals | **missing** | roadmap is created from a constant |
| Mentor eligibility / scoring / explanations | **partial** | `rankMentors` cosine + lexical only; no eligibility stage, no documented weights, no confidence |
| Mentorship request flow | **mocked** | in-memory `requestMentorship`/`advanceRequest` in `mentorship.ts`; nothing persists |
| Progress coach | partial | 72 h micro-step split only |
| AI assistant | **missing** |: |
| Session copilot | **missing** | no scheduling/video/transcription exists: nothing to build on |
| Resume reviewer | **missing** |: |
| Rate limits / AI usage | **missing** | unbounded calls per user |
| Secrets in client | none | key lives in `env` only (`worker/env.ts`) |

### Pre-existing facts worth stating plainly
- The mentor directory is **seeded demo data** in `worker/lib/db.ts:MENTOR_SEED`.
  There is no mentor sign-up, no verification, no approval workflow. The app must
  therefore never describe a mentor as "verified" or "admin-approved". It does not today.
- `src/lib/mockData.ts` drives the *display* of requests/sessions/threads on the
  dashboard. Those are mock, and the upgrade replaces the requests path with real rows.

## 2. Architecture decision

Keep the existing stack. No second auth system, no second database, no rewrite.

```
Vite SPA ──► /api/* ──► Worker (fetch handler)
                          ├─ @freebuff/auth  → user.sub   (authorization)
                          ├─ D1 (SQLite)     → all authoritative state
                          ├─ lib/ai/         → provider adapter (external calls only here)
                          └─ lib/matching/   → deterministic scoring (pure)
```

Convex contract → implementation:
| Convex concept | Here |
| --- | --- |
| query / mutation (deterministic, no external calls) | functions in `worker/lib/*` that only touch D1 |
| action / internalAction (external calls) | `worker/lib/ai/*` called only from route handlers; never reachable without a session |
| `internal*` (not publicly callable) | every helper is module-private; only `worker/index.ts` exposes routes, each of which authenticates first |
| `ctx.auth` identity | `currentUser(request, env).sub` |
| schema validators | `SCHEMA_SQL` + explicit row→domain mappers + `validate()` on every model output |
| indexes / pagination | `CREATE INDEX` + `LIMIT` on every list read |
| env vars in the Convex dashboard | Worker vars/secrets (`wrangler.toml` / Sites → Secrets) |

## 3. Phases

- **P1 Audit and foundation**: done: this document, `PROGRESS.md`.
- **P2 AI infrastructure: DONE.** `worker/lib/ai/{provider,usage,schema,config,errors}.ts`. Provider-independent
  adapter configured by `AI_PROVIDER`, `AI_API_KEY`, `AI_MODEL`, `AI_MODEL_LITE`,
  `AI_EMBED_MODEL`, `AI_TIMEOUT_MS`, `AI_MAX_RETRIES`, `AI_MAX_INPUT_CHARS`,
  `AI_RATE_LIMIT_PER_HOUR`, `AI_DEMO_MODE`. Timeouts, bounded retries, in/out limits,
  per-user rate limits, usage rows, duplicate-request suppression, structured validation,
  a truthful error taxonomy, and no fabricated results. The old silent demo fallback becomes
  an explicit `AI_DEMO_MODE` (local only); otherwise an unconfigured provider is a real
  error the UI states.
- **P3 Student career intelligence: DONE.** `profiles` (with the server-owned role),
  Career Navigator with saved paths and accepted goals, a roadmap generated *from a goal*
  behind a preview/confirm step, roadmap editing, and progress computed only from stored
  rows. `worker/lib/{profile,validate,career,roadmap}.ts`.
- **P4 Intelligent matching: DONE.** `worker/lib/matching/engine.ts` (pure: eligibility →
  six weighted factors → explanation), orchestration in `matching/index.ts` with optional
  AI *phrasing only*, and `worker/lib/requests.ts` with server-enforced transitions.
- **P5 Assistant + Progress Coach** on authorized data.
- **P6 Mentor dashboard + session copilot** (copilot limited to notes the user supplies;
  no scheduling/video/recording is claimed because none exists).
- **P7 Resume/portfolio review** (text first).
- **P8 Polish and verification.**

Minimum shippable slice: P1 to P4.

## 4. Matching model (fixed now, coded in P4)

Stage A eligibility (hard filters, deterministic): active profile, complete enough
profile, mentor role, not the caller, availability overlap with the requested days,
no existing pending/accepted/declined request between the pair, not blocked.

Stage B score, weights are a **configurable starting point, not validated science**:
career-goal alignment 25 · skills & learning needs 25 · mentor expertise 20 ·
interests & mentoring preferences 10 · availability 10 · industry/experience 10.

Each factor is normalised to 0..1. Missing data is **not** a mismatch: the factor is
dropped and the remaining weights are renormalised, and the result carries a lower
`confidence` plus an explicit `missing[]` list. Protected characteristics are never
inputs. The score is a fit score, never a probability of success.

Stage C explanation: generated **from the computed factors only**. AI may phrase; it may
not choose or reorder.

Stage D requests: `pending → accepted | declined | withdrawn` only, enforced server side.

## 5. What will remain missing after this work
Stated up front so nothing is oversold: real mentor verification/approval, session
scheduling, video, recording, transcription, and any file upload/extraction for the
resume reviewer all require integrations that do not exist here. They will be reported
as *requires configuration* / *not implemented*, never faked.
