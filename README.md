# PathFinders: mentorship that turns guidance into measurable progress

PathFinders connects students with relevant mentors and turns guidance into measurable
career progress. It takes someone from "I have no idea where to start" to a persistent
roadmap, a matched human mentor, tracked progress and a mentor who can see the value of
the time they gave. AI is woven through onboarding, career exploration, matching, the
roadmap and mentor session preparation: it is not a chat box bolted onto the side.

> **On verification.** Signing in proves an identity at the provider; it says nothing
> about experience. A mentor may submit evidence, a moderator decides, and the status
> (`unverified / pending / verified / rejected / suspended`) is shown on the profile.
> Nothing is automatic, and being verified never means "affiliated with an institution".

> **Branding note.** This project was built as "MentorBridge" and is now **PathFinders**.
> Internal identifiers (the D1 database, Worker name, `FREEBUFF_*` variables, npm script
> names and the localStorage role key) keep their original names deliberately: they are
> not user facing, and renaming them would break deployed bindings.

## Stack

| Layer | What |
| --- | --- |
| UI | Vite + React 19 + TypeScript, Tailwind CSS 4, `lucide-react` icon set |
| API | A single Cloudflare **Worker** (`worker/`): same origin, no CORS |
| Auth | **Sign in with Freebuff** (`@freebuff/auth`): Google, GitHub or Apple, personal accounts, no university email, no password and no secret |
| Data | **D1** (SQLite): profiles, goals, roadmaps, career paths, requests, messaging, verification, standups, reviews, events |
| AI | **Google Gemini** via REST behind one provider adapter (`worker/lib/ai/`) |

```
Vite React SPA ──► /api/* ──► Worker ──┬─ Gemini (x-goog-api-key, server side only)
                                       ├─ D1 (SQLite)
                                       ├─ lib/matching/  deterministic scoring (pure)
                                       └─ @freebuff/auth (session cookie → user.sub)
```

## Files that came with the interface

`index.html`, `metadata.json`, `vite.config.ts`, `tsconfig.json`, `.env.example` and
`.aistudio/` (the original design plan) belong to the interface and are kept as they were
written. `.env.example` documents the two variables the AI Studio platform injects
(`GEMINI_API_KEY`, `APP_URL`); the Worker in this repository reads its own variables, which
are described under Configuration below and in `.dev.vars.example`.

## Documentation

- [`docs/IMPLEMENTATION_REPORT.md`](docs/IMPLEMENTATION_REPORT.md): the audit,
  the defects found and fixed, every check that was run, the checks that could
  not be run, and the known limitations.
- [`docs/AI_UPGRADE_PLAN.md`](docs/AI_UPGRADE_PLAN.md): the AI layer design.
- [`docs/DEMO_SCRIPT.md`](docs/DEMO_SCRIPT.md): the three minute demo script and the one
  paragraph technical explainer.

## The interface that ships

The interface is the PathFinders single page app in `src/`: a cinematic hero, mentor
directory with filter and detail views, request drawer with chat, community problem
board with replies and an accepted answer, roadmap generator, and separate mentor and
mentee dashboards. The signed in screens are backed by the Worker API (see the next
section); the marketing and community screens run on bundled sample data.

**Chat attachments come from the device, never from a URL.** In the drawer you pick a
photo, a video or any file with the file picker, drop files onto the panel, or record a
voice note with the microphone. Files are staged with a preview and an optional note, then
sent as ordinary messages with their real name, size and, for video, the duration read
from the file itself. Oversized files and empty ones are refused with the reason shown,
and a refused microphone permission says so rather than pretending a note exists.

A file attached this session lives in memory only and its object URL is stripped before
the message is written to storage, so reloading never shows a dead link. A message from
an earlier session says plainly that the file is no longer held and asks you to attach it
again. Nothing is uploaded anywhere, and the drawer says so.

### The signed in screens are wired to the API

Once there is a session, these screens read and write real rows through `src/lib/api.ts`:

- `#/dashboard` - the student workspace. Goal, step progress, overdue and untouched steps,
  pending approvals, recent agent decisions, the assessed gaps and the top mentor matches
  are all counted from stored records. A section that fails to load names itself instead of
  showing a plausible number.
- `#/assess` - the gap analysis: schema validated findings with evidence, priority,
  confidence, and strengths split into evidenced and self reported.
- `#/roadmaps` - generation returns a **proposal** with the engine labelled; editing it is
  local until you save, saving writes the confirmed plan, and only a person marks a step
  done.
- `#/mentors` - matching. Only mentors that exist in the database are ranked, each card
  explains the score factor by factor, and says whether the model or the app wrote the
  sentence. The disclaimer states a fit score is not a probability of success.
- `#/agent` - the adaptation agent. A proposal carries its trigger, its evidence and its
  confidence; approve, edit or reject, and the decision is kept in a history rather than
  deleted.
- The mentor dashboard lists incoming requests, the mentee context the server is willing to
  expose, and accept or decline as a real transition. It says plainly that no email is
  sent.

Without a session those screens show the sample workspace with an amber banner that says
so, because a preview of the product is more useful than an empty page. Every AI result is
labelled `gemini` or `demo`: with no provider key configured the deterministic demo engine
answers and says that is what happened, and a provider failure is shown as an error with a
retry rather than a fallback that looks like content.

**On an empty account, press "Load the demo scenario" on the workspace.** It writes a
labeled sample profile, goal and roadmap (one milestone deliberately overdue, which is the
agent's adaptation trigger), never overwrites fields you already filled, is idempotent, and
marks the account so the interface shows a "Seeded demo scenario" banner. The route is only
available when `AI_DEMO_MODE` is on, which is the same switch that serves the demo engine.

### Screens are links

Every screen has its own URL: `#/mentors`, `#/roadmaps`, `#/community`, `#/dashboard`,
`#/choose-role`, `#/onboarding`. You can open one directly, share it, and use the browser
back button. A link into a signed in screen while signed out goes home rather than
rendering an empty page, and an unknown link goes home too. The mapping lives in
`src/lib/router.ts` and is unit tested.

### Verification is a status, not a claim

Each mentor carries a `verification` state (`verified`, `pending`, `unverified`) and the
label, colour and wording come from `src/lib/verification.ts`. The directory and the
profile show that status per mentor, and the copy says what it is: the review state of the
evidence a mentor submitted, never an academic affiliation. The seed data deliberately
mixes the three states, so the badge can render as "not yet verified" and is not a blanket
promise. The footer states that this build runs on sample profiles.

### What this build does not do

Sign in is local to the browser and says so in the dialog; no Google account is used and no
password is stored. Requests, acceptances and declines are recorded on the device and the
messages say no notification is sent, because none is. Session video rooms open a real,
key free room derived from the session id (`src/lib/meeting.ts`), which a deployment
replaces with its own provider by changing one function.

The verification controller for the four routing rules renders in development, and in a
built site only when the URL carries `?qa=1`, so it is not part of what a visitor sees.

**Screens that need a session say so, and the rest are labeled samples.** The AI screens
above need a signed in account because they read and write that account's rows; without one
they show the sample workspace under an amber banner that says it is sample data. The
marketing pages, the community board and the chat drawer still run on bundled data
(`src/data/`) in the browser, and the seed lives in `worker/lib/db.ts`.

The Worker in `worker/` is the durable half of the same product: real sessions from Sign in
with Freebuff, D1 rows, server side authorization, the model adapter and every feature
listed below. The signed in screens call it; the sample screens do not.

## The core journey (Worker API)

The API supports the flow below. Every route here exists and is tested; the ones marked
**(wired)** are reached by the signed in screens, and the rest are reachable by API clients
only, which is stated rather than implied.

1. **Join and profile**: `/onboarding`. One question group at a time, skippable
   optional fields, and a role chosen once and stored server side. An optional AI helper
   pre-fills fields from a description the student writes; it only ever extracts what
   they actually said.
2. **Explore directions**: `/navigator`. Three career directions with why each is
   relevant, skills held and to build, projects, checkpoints, an approximate effort
   range, assumptions, tradeoffs and one first action. Nothing promises a job, salary
   or admission, and no statistics are invented.
3. **Choose a goal**: accepting a direction saves a `goals` row.
4. **Get a roadmap**: `/roadmap`. Generated from the goal, previewed, then saved once
   confirmed. Milestones and tasks with estimates, deadlines, completion and revision
   history. Regenerating keeps completed work and personal tasks.
5. **Get matched**: `/mentors`. Eligibility first, then a weighted fit score across six
   documented factors, then an explanation built from the actual factors. Only then can a
   request be sent.
6. **Request and be accepted**: `/dashboard`. The mentor accepts or declines; the
   student sees the server's status and can withdraw anything still pending. Mentors see
   accepted mentees and the goals they agreed to work on.
7. **Track progress**: the dashboard's next action and progress come from stored tasks;
   the agent splits a task that has sat untouched for three days.

## The AI features

**Phase 2 (original five, unchanged in behaviour)**

1. **Image-to-match**: `POST /api/vision-match`. A screenshot becomes a search query and
   a ranked shortlist; the agent drafts the first message.
2. **Auto-adjusting roadmap**: `POST /api/roadmap/tick`. A pending task untouched for
   **72 h** is split into three micro-steps. The agent never completes a task, moves a
   deadline or rewrites a goal.
3. **Async voice standups**: `POST /api/standup`. Hold-to-talk audio is transcribed and
   summarised; the roadmap items the student names are completed, mapped back to real ids.
4. **Mentor Multiplier code review**: `POST /api/code-review`. Issues, a readiness score
   and a one-line brief for the mentor.
5. **Vibe matching**: `POST /api/match`. One feedback-style question, and every result
   justifies both the technical and the communication fit.

**Phases 3 to 4 (new)**

6. **Career Navigator**: `GET/POST /api/career/paths`, `POST /api/career/goals`.
7. **Conversational onboarding**: `POST /api/profile/extract`.
8. **Roadmap generation**: `POST /api/roadmap/plan` (preview, writes nothing) and
   `POST /api/roadmap/apply` (writes the confirmed plan).
9. **Explainable matching**: `GET /api/matches`. Deterministic ordering; AI may only
   rephrase the explanation (`?phrase=1`).

Every response is labelled `engine: "gemini"` or `engine: "demo"`, and the UI shows which
one produced it. Without a provider key the AI features report *requires configuration*;
they never invent an answer.

## Matching model

Stage A (**eligibility**, hard filters): active, complete-enough profile, a mentor role,
not the caller, no shared-availability conflict when both sides stated days, and no
existing pending/accepted/declined request between the pair.

Stage B (**score**, weights are a configurable starting point, not validated science):
career-goal alignment 25 · skills and learning needs 25 · mentor expertise 20 · interests
and mentoring preferences 10 · availability 10 · industry and experience relevance 10.
Missing information drops the factor and renormalises the rest: it is never counted as a
mismatch: and the result carries a lower confidence plus an explicit list of what could
not be assessed. Protected characteristics are never inputs.

Stage C (**explanation**): generated from the computed factors only, with the caveats
that apply. The score is a **fit score for ranking**, never a probability of success.

## Running it

```bash
npm ci
npm run dev                      # interface on :3000, no backend and no key needed
```

To work on the API as well, copy the public config and start the Worker beside it:

```bash
cp .dev.vars.example .dev.vars   # public config; add AI_API_KEY if you have one
npm run dev:api                  # Worker on :8787 (local D1 under .wrangler/)
```

`.dev.vars.example` already contains the **development** Freebuff client ID, so sign-in
works on `http://localhost:3000` with no further setup. Without a provider key the flows
still work end to end on the deterministic demo engine when `AI_DEMO_MODE=true`
(local development only), and the UI says so.

Scripts: `typecheck` (app + worker), `test` (vitest), `build`, `worker:build` (dry-run
bundle into `deploy-out/`).

## Configuration

| Variable | Where | Purpose |
| --- | --- | --- |
| `AI_API_KEY` | Worker secret | the provider key. Never a `VITE_` variable. |
| `AI_PROVIDER` | var | `gemini` (the only implemented provider) |
| `AI_MODEL`, `AI_MODEL_LITE`, `AI_EMBED_MODEL` | var | model selection |
| `AI_TIMEOUT_MS`, `AI_MAX_RETRIES`, `AI_MAX_INPUT_CHARS` | var | budgets; an explicit `0` is honoured |
| `AI_RATE_LIMIT_PER_HOUR`, `AI_DEDUPE_WINDOW_MS` | var | per-user limits |
| `AI_DEMO_MODE` | var | **local development only**; never enable in a deployment |
| `FREEBUFF_CLIENT_ID`, `FREEBUFF_ISSUER`, `APP_ORIGIN` | injected on deploy | public config, no secret |

`AI_API_KEY` is set as a Worker secret (Sites → Secrets, or `npx wrangler secret put
AI_API_KEY`). Nothing else needs a secret.

## Auth model

* Sign in with Freebuff; the issuer handles Google/GitHub/Apple. **No secrets**: `FREEBUFF_CLIENT_ID`, `FREEBUFF_ISSUER` and `APP_ORIGIN` are public configuration.
* `worker/lib/auth.ts` builds **one auth instance per isolate**; `auth.wrap()` serves
  `/auth/freebuff/*` and refreshes sessions before the API routes or the asset fallback.
* `user.sub` is the **only** identity any handler uses, and `profiles.role` is the only
  role. There is no client-supplied id or role anywhere in the API.
* Roles are written once, through a validated endpoint. A student cannot promote
  themselves to mentor, and no request body can grant a privilege.
* Signed out, every user-scoped endpoint answers **401**. `/api/health` and
  `/api/mentors` are the only public routes.
* Every state-changing request must be same-origin (`worker/lib/csrf.ts`) or it gets
  **403**: `SameSite=Lax` alone is not CSRF protection.
* The provider key lives on the Worker only; it is never bundled or sent to the browser.

## Deploying

```bash
npm run build          # vite -> ./dist
npm run worker:build   # wrangler dry-run -> ./deploy-out/index.js
```

Upload `deploy-out/index.js` as the module and `./dist` as the assets with
`deploy.manifest.json`, then set `AI_API_KEY` as a Worker **secret**. The Freebuff
variables arrive with the deployment. The schema is created lazily on first request
(`CREATE TABLE IF NOT EXISTS` plus additive column migrations), so no separate migration
step can drift from the code that reads it.
