# PathFinders — implementation report

Audit, repair and upgrade pass over the MentorBridge codebase, now branded
**PathFinders**. Everything below was executed in this repository; commands and
their real results are quoted, and the things that could *not* be verified are
listed as such rather than described as working.

---

## 1. What the codebase actually is

Determined from source, not from prior documentation:

| Layer | Reality |
|---|---|
| Frontend | Vite 5 + React 18 SPA, TypeScript, Tailwind, react-router-dom, GSAP, Lenis, react-three-fiber |
| Backend | Cloudflare Worker (`worker/index.ts`) + D1 |
| Deployment | One Worker: `run_worker_first` handles `/api/*` and `/auth/freebuff/*`, everything else falls through to the built SPA in `./dist` |
| Auth | Sign in with Freebuff (OIDC, PKCE S256). No client secret exists |
| Database | D1, schema created lazily by `ensureSchema` (18 tables) |
| Tests | Vitest, 12 files |

Two earlier-plan corrections still hold and are worth restating:

1. **There is no Convex and there never was.** `src/lib/convex.ts` was a
   placeholder module that threw on use and was imported by exactly two
   components. It has been removed; both call sites now do something real
   (see §4).
2. **The brand was MentorBridge; it is now PathFinders.** Internal identifiers
   (D1 database name, Worker name, `FREEBUFF_*` variables, npm scripts, the
   localStorage role key) are deliberately unchanged — they are not user-facing
   and renaming them would break deployed bindings.

---

## 2. Google sign-in — what was asked, what is true

The brief asks for Google OAuth with personal Gmail accounts and no
university-email restriction, using the auth framework already present, without
inventing credentials.

**What the existing stack actually supports** (verified, not assumed):

- `@freebuff/auth`'s own documentation states the visitor "signs in with their
  Freebuff account (Google, GitHub or Apple)".
- Fetching the live sign-in page from this repository's own OIDC redirect
  (`/auth/freebuff/signin` → `freebuff.com/oidc/authorize` → `freebuff.com/login`)
  returns a page titled *Sign in to Freebuff* containing **Google**, **GitHub**
  and **Apple**.
- `https://freebuff.com/oidc/.well-known/openid-configuration` advertises
  `grant_types: authorization_code, refresh_token`,
  `code_challenge_methods: S256` and **no `idp`, `provider`, `acr_values` or
  connection parameter**. The SDK forwards only `prompt` (whitelist:
  `login`, `consent`, `select_account`) and `returnTo`.

**Therefore:**

- Personal Google accounts work today, with no domain allowlist and no
  university email. There is no client secret to manage.
- There is **no supported way to force Google specifically** — the provider
  chooser is upstream. The sign-in button is labelled "Continue with Google" and
  the screen underneath says plainly that Freebuff handles sign-in and that
  Google, GitHub or Apple can be chosen there. Claiming a Google-only button
  would not be true.
- The flow asks for the account chooser (`prompt=select_account`, one of the
  three forwarded values) so a visitor with several sessions is not silently
  signed in as the wrong one.
- `returnTo` is validated server-side by the SDK's `safeReturnTo`, which keeps it
  a same-origin path — no open redirect is possible through this parameter.

Building a second, hand-rolled Google OAuth client was rejected: it would need
credentials that do not exist here, it is explicitly discouraged by the auth
framework's own guidance, and it would add an unverifiable code path next to one
that already works.

**Status: implemented and HTTP-verified up to the provider redirect. The
complete round trip (consent → callback → session) was NOT executed — there is
no browser in this environment. It remains the one flow that needs a human.**

---

## 3. Confirmed defects found and fixed

| # | Defect | Evidence | Fix |
|---|---|---|---|
| 1 | Public copy claimed a verification process that did not exist: "University-email verification", "Verified seniors only — every mentor is a real student at your university", "Verify your campus email to unlock matching", "the domain is verified server-side", "the campus check happens server-side" | `src/sections/Hero.tsx`, `FinalCta.tsx`, `components/Footer.tsx`, `components/DashboardMockup.tsx`, `pages/Register.tsx`, `components/MentorDialogs.tsx`, `lib/mockData.ts` | Every claim replaced with a true statement. A real review workflow replaced the fiction (§5) |
| 2 | A button that could only fail: "Request a session" called a placeholder that threw | `components/MentorDialogs.tsx` → `src/lib/convex.ts` | Replaced with a real handoff into the signed-in request flow |
| 3 | A placeholder module masquerading as a data layer (`useTopMatches`, "TODO(convex)", "the Convex backend is not connected yet") | `src/lib/convex.ts`, `sections/Matching.tsx` | Module deleted; the landing example is now built from the published weights in `content.ts` and labelled as an example |
| 4 | Messaging did not exist despite being listed as a dashboard feature: `ChatPanel.tsx` was mock-based and imported by nothing | zero imports; internal docstring referred to "a mock array or a Convex subscription" | Removed the dead component; implemented real messaging (§5) |
| 5 | Verification was a placeholder string (`verification: 'not_required'` for both roles) with no process, storage or reviewer | `src/lib/adapters/mentorship.ts` | Real status machine + submission + moderator decision (§5) |
| 6 | Any authenticated mentor could not be told apart from a reviewed one; nothing gated matching on trust | absence of verification in `matching/engine.ts` | Verification is now an eligibility input, configurable |
| 7 | **Bug found in this pass:** `ORDER BY submitted_at DESC` is ambiguous when two rows share a millisecond, so "latest verification" could resolve to the *older* row | caught by `verification.test.ts` (resubmission after a rejection returned the rejected row) | Append-order tie-break: `ORDER BY submitted_at DESC, rowid DESC`; covered by a regression test |
| 8 | Unbounded abuse surface: nothing rate-limited request creation, messaging or verification submissions | absence | `lib/rate.ts` with per-user, per-action sliding windows |
| 9 | No in-app route for a reviewer to act, so a verification queue could not exist honestly | absence | `GET /api/verification/queue` + `POST /api/verification/:id/decision`, restricted to `MODERATOR_SUBS` |

### Security properties verified by test

`worker/lib/messaging.test.ts` and `worker/lib/requests.test.ts`:

- a non-participant gets **403** on read and write, with a valid request id;
- a thread cannot be opened before the request is `accepted` (**409**);
- an unknown request is **404**, and the caller learns nothing more;
- the recipient is always the *other* participant — never a client-supplied id;
- read receipts only ever affect messages addressed to the caller.

`worker/lib/verification.test.ts`:

- a mentee cannot enter the review queue (**403**, checked against the role on
  their server-side profile);
- `javascript:` and other non-public links are rejected;
- only a `pending` row can be decided, and only once (**409** afterwards);
- a suspended account cannot resubmit; a rejected one can;
- the moderator allowlist comes from configuration only.

`worker/lib/rate.test.ts`: the limit holds, is per user and per action, honours
the window, and prunes only its own stale rows.

`worker/lib/matching/engine.test.ts` (new cases): rejected and suspended mentors
are excluded regardless of configuration; `unverified` is **not** treated as a
negative finding by default; `MENTOR_VERIFICATION_REQUIRED=true` narrows
eligibility to `verified`.

---

## 4. Where the two placeholder call sites went

- **"Request a session"** (landing dialog): these are example profiles with no
  accounts behind them, so there is nothing to send a request to. The button now
  links into the real flow (`signInUrl('/mentors')`): sign in, and the directory
  plus the request form are live. The dialog's disclosure now says exactly that.
- **The matching ledger** on the landing page: built from the same published
  weights rendered beside it, with a deterministic contribution per signal, and
  labelled as an example. The real ranking is server-side per account.

---

## 5. What is now implemented

### Mentor verification (new)
`worker/lib/verification.ts`, tables `mentor_verifications`.

Statuses: `unverified | pending | verified | rejected | suspended`, derived from
the **latest** row of an append-only table, so a decision is never overwritten
and the history survives. Submissions carry a kind, a 40–1200 character
statement and up to five **http(s)-only** public links (a bare host is upgraded
to `https`; `javascript:` is refused). Resubmission is blocked while pending and
after a suspension, and allowed after a rejection.

A reviewer is any Freebuff `sub` listed in `MODERATOR_SUBS` — a server-side
variable that no route can grant and that is never read from a request. The
queue endpoint returns **404** to a non-moderator rather than 403, so a
deployment's review surface is not disclosed to strangers.

Honest wording is enforced in one place (`VERIFICATION_COPY`): being verified
means *a reviewer accepted the evidence you supplied*, and explicitly **not** an
academic affiliation.

### In-app messaging (new)
`worker/lib/messaging.ts`, table `messages`.

A thread **is** an accepted `mentorship_requests` row — not a separate object
that can drift out of sync with the relationship. Every read and write re-reads
that row and checks the caller against `mentee_id` / `mentor_id`, so a thread
cannot outlive the relationship and an outsider cannot open it. Messages cap at
2,000 characters and are limited to 60/hour per sender.

This is the platform's own record. No phone number is exposed, no email is
forwarded, and no external messaging API is claimed.

### Contribution record (new)
`worker/lib/portfolio.ts`, `GET /api/portfolio`.

Derived entirely from rows that already exist: accepted requests, the completed
roadmap steps belonging to the goal that was accepted, and the student's own
logged check-ins since acceptance. A request with no goal reports `null`
("not tracked") rather than a fabricated zero. The payload ships a `basis[]`
array of plain-language statements that the UI renders next to the numbers, so
the figure and its provenance are never separated. **No hours, badges,
certificates or credits are issued or implied.**

### Mentor AI assistance (new)
`worker/lib/mentor_ai.ts`, `POST /api/mentor/prep`.

Builds a session draft — focus, agenda with minutes, questions to ask, next
steps, cautions — from the mentee's shared summary and roadmap progress for the
goal of the accepted request. Authorisation is read from the request row, so a
mentor cannot prepare for a student they did not accept. It goes through the
existing provider adapter (metered, deduplicated, timeout-bounded,
schema-validated), and the deterministic draft is reachable only under
`AI_DEMO_MODE`, always labelled `engine: 'demo'` in the UI. It never promises
employment, grades or outcomes, and its cautions state that the counts are the
student's own bookkeeping.

### Abuse limits (new)
`worker/lib/rate.ts` + table `action_events`: 10 requests/hour, 60 messages/hour,
3 verification submissions/day, each counted per user and per action.

### PathFinders branding
Landing, navigation, footer, auth screens, page titles, metadata and docs.
`src/lib/brand.ts` now holds the name, tagline, positioning line and support
address in one place.

---

## 6. Verification actually performed

```
npm ci                → 289 packages, exit 0
npm run typecheck     → exit 0 (app + worker tsconfigs)
npx vitest run        → 12 files, 123 tests, all passing
npm run build         → vite build, 24.09s, exit 0
npm run worker:build  → wrangler dry-run, 207.90 KiB / 54.44 KiB gzip, exit 0
```

Against `wrangler dev` (real workerd, real D1):

- `GET /api/health`, `GET /api/mentors` → **200**
- `GET /api/verification`, `/api/verification/queue`, `/api/messages`,
  `/api/portfolio`, `/api/profile`, `/api/roadmap` → **401** signed out
- `POST /api/verification`, `/api/verification/:id/decision`, `/api/mentor/prep`,
  `/api/messages/:id` → **401** signed out
- foreign `Origin: https://evil.example` on the new mutations → **401** (the
  session check runs first; the CSRF branch behind it is covered by
  `csrf.test.ts`, not reachable over HTTP without a session)
- `/auth/freebuff/signin` → **303** to the issuer with PKCE S256 and the correct
  callback
- the 3 new tables are created by the bootstrap; **18 tables** present
- **all 25 SQL statements** issued by the new modules were validated with
  SQLite `EXPLAIN` against the real D1 schema — all valid

### Not verified (do not read these as passing)

1. **The complete sign-in round trip.** No browser here. The redirect out is
   verified; the return is not.
2. **No authenticated user journey was executed.** Onboarding, role selection,
   dashboard routing, sending a request, accepting it, messaging between two
   accounts, submitting verification and having it reviewed were all exercised at
   module and SQL level — never end-to-end over HTTP, because no session can be
   minted from a shell.
3. **No AI generation has ever run for real.** No provider key, so
   `/api/health` reports `engine: "demo"`. The adapter is covered by unit tests;
   the live model path is not.
4. **No browser automation, accessibility audit or Lighthouse run.** None of that
   tooling exists in this environment.
5. **Deployment:** not re-verified in this pass. The previously deployed preview
   returned HTTP 503 with `quota.state: "unavailable"` (platform-side; not quota
   exhaustion — 38 of 100,000 requests used) and its artifact predates this work.
   Nothing here is claimed to be live.

---

## 7. Known limitations, stated rather than hidden

- **Blocking does not exist yet.** The engine honours `blockedMentorIds`; nothing
  populates it. No UI claims otherwise.
- **Verification gating is off by default.** `MENTOR_VERIFICATION_REQUIRED=true`
  restricts matching to verified mentors. It defaults to off because a fresh
  deployment with no reviewer would otherwise recommend nobody. Rejected and
  suspended mentors are excluded either way.
- **The seeded mentor directory is fixture data.** Those nine rows are excluded
  from matching, scoring and requests, and their ratings/session counts are
  placeholder values. They are shown in the directory only.
- **The review queue has no UI.** A moderator acts through the API (documented
  below). The mentor-facing submission and status surfaces are in the dashboard.
- **Scheduling, video, recording, transcription and resume upload do not exist.**
  The student dashboard says so in a notice, and no button pretends otherwise.
- **Dual roles are not supported.** One role per account, set once through a
  validated endpoint. Supporting both would need a schema change (a join table)
  and a rework of every role check; that is documented here rather than
  half-built.
- **Notification delivery is not implemented** — activity appears in the
  dashboard's own lists; nothing is emailed or pushed.

---

## 8. Running it locally

```sh
npm ci
cp .dev.vars.example .dev.vars     # then fill in; see below

npm run dev:api                    # Worker on :8787
npm run dev                        # Vite on :3000, proxying /api and /auth
npm test                           # 123 tests
npm run build                      # typecheck + production build
```

### Environment variables

Public configuration (no secret exists for sign-in):

| Variable | Purpose |
|---|---|
| `FREEBUFF_CLIENT_ID` | Public OIDC client id, per environment |
| `FREEBUFF_ISSUER` | `https://freebuff.com/oidc` |
| `APP_ORIGIN` | The site's canonical origin. **Never** derived from the request Host |

Server-side only:

| Variable | Purpose |
|---|---|
| `AI_API_KEY` | Provider key (Worker secret). Absent → AI features report "requires configuration" |
| `MODERATOR_SUBS` | Comma-separated Freebuff `sub` values allowed to review verification |
| `MENTOR_VERIFICATION_REQUIRED` | `true` gates matching on `verified` |

Local development only: `AI_DEMO_MODE=true` serves the deterministic engine so
flows are exercisable without a key. **Never enable it in a deployment** — it
would present placeholder advice as if it were real.

### Configuring sign-in
No dashboard setup and no secrets. Deployed:
`sites_enable_auth` (or `npx @freebuff/auth register --project <slug> --environment production --redirect-uri https://<origin>/auth/freebuff/callback`)
injects `FREEBUFF_CLIENT_ID`, `FREEBUFF_ISSUER` and `APP_ORIGIN`. Locally, use
the development client (`http://localhost:3000/auth/freebuff/callback`).
The callback path is always `/auth/freebuff/callback`.

### Configuring the AI provider
Set `AI_API_KEY` as a Worker secret. `AI_MODEL`, `AI_MODEL_LITE`,
`AI_EMBED_MODEL`, `AI_TIMEOUT_MS`, `AI_MAX_RETRIES`, `AI_MAX_INPUT_CHARS`,
`AI_RATE_LIMIT_PER_HOUR` and `AI_DEDUPE_WINDOW_MS` tune behaviour; the older
`GEMINI_*` names still work.

### Using the review queue (moderator)

```sh
# list pending submissions
curl -H "Cookie: <your session>" https://<origin>/api/verification/queue

# decide one
curl -X POST -H "Cookie: <your session>" -H 'content-type: application/json' \
  -d '{"decision":"verified","note":"project is public and matches the claim"}' \
  https://<origin>/api/verification/<id>/decision
```

### Deploying

```sh
npm run build          # produces ./dist
npm run worker:build   # wrangler dry-run bundle into ./deploy-out
# then deploy with the Sites manifest (deploy.manifest.json: entrypoint
# ./deploy-out/index.js, assets ./dist)
```

---

## 9. The journey, end to end

**Student:** open `/` → *Continue with Google* → choose Google on the Freebuff
screen (personal Gmail is fine) → return to the page you asked for → role
selection (*I want to find a mentor*) → guided, resumable onboarding → student
dashboard → *Find mentors* with the factors spelled out → send a request with a
message → the mentor accepts → the request shows as an accepted relationship →
Career Navigator suggests directions → confirm a goal → generate a roadmap
(preview, then confirm) → tick tasks and milestones → log a check-in → message
your mentor in the thread → progress appears in the mentor's record.

**Mentor:** sign in the same way → choose *I want to become a mentor* → mentor
onboarding (expertise, availability, capacity, style) → mentor dashboard →
verify your profile by submitting evidence and watch its review status →
incoming requests → accept or decline → your mentees appear with the goals they
agreed to → message them in the thread → *Prepare for the next session* for a
labelled draft built from their goal and progress → your contribution record
accrues real, derivable figures only.

Steps that require configuration before they do anything: every AI generation
(needs `AI_API_KEY`); every human review (needs `MODERATOR_SUBS`).

## Addendum: the interface was replaced after this report was written

Everything above concerns the `worker/` API and the checks run against it. Those results
still stand: both typechecks pass, **123 tests pass**, and `vite build` succeeds.

What changed afterwards is the **front end**. The interface in `src/` was replaced with the
PathFinders single page app: React 19, Tailwind CSS 4, `motion` and `lucide-react`, a
cinematic hero, a mentor directory with detail and request views, a chat drawer with file,
voice and video attachments, a community problem board, a roadmap generator and separate
mentor and mentee dashboards.

Consequences you should read plainly:

* The earlier statements here about the **pages the UI had** (route based screens such as
  `/onboarding`, `/navigator`, `/roadmap`, `/mentors`, `/dashboard`) describe the **API**,
  not the interface that now ships. The API routes exist and are tested; the new interface
  does not call them yet.
* The new interface holds roles, sign in, requests, messages and progress in **React state
  for the session** and reads its content from `src/data/`. Clicking through the product
  works end to end with no backend, no account and no key, and no permanent record is made.
* Therefore **the interface is not yet wired to the API**, and no check in this report
  exercises the interface itself. Interface level checks (a browser walkthrough, keyboard
  and screen reader passes, a Lighthouse run) remain unrun, as stated above.
* Branding is PathFinders throughout, and dashes were removed from visible text. Literal
  technical identifiers keep theirs (`cert-manager`, `axe-core`, `WAI-ARIA`, `ZeRO-3`, CLI
  flags, URLs, SVG path data, CSS class names): altering those makes the text wrong or
  breaks the build.

### Attachment follow up

Chat attachments no longer accept a pasted URL. Photos, videos, any file and recorded
voice notes are taken from the device, staged with a preview and an optional note, then
sent with their real name, size and, for video, a duration read from the file. Oversized,
empty and wrongly typed files are refused with the reason shown, and an unshared
microphone reports itself instead of producing a note. A file lives in memory for the
session; the object URL is stripped before the message is written to storage, so a reload
shows "no longer held" rather than a dead link. Nothing is uploaded to a server, because
this interface has no server wired to it yet.

Covered by `src/components/ChatDrawer.test.tsx` (jsdom, four tests): the device pickers
exist and no URL input survives, a chosen photo stages and sends as a message, an
oversized file is refused and never staged, and a stored message carrying a remote link
renders as unavailable and is not rewritten to storage as a link. Suite total: **127
passing**.

## Addendum: follow up fixes

Eight issues were found while writing a full description of the interface, and all eight
were fixed. Each was verified by a check, not by inspection.

1. **Two dead buttons.** Both "Join Meet Room" buttons in the mentor hub had no handler.
   They are now real links into a session room (`src/lib/meeting.ts`), and the confirmed
   session on the mentee dashboard got the same treatment. The copy no longer says
   "(Google Meet)", because no such room ever existed. Covered by
   `src/lib/meeting.test.ts`.
2. **An unused dependency.** `motion` was declared and imported by nothing. Removed, and
   the README stack line corrected.
3. **The dev port contradicted the docs.** `npm run dev` served 5173 while the README,
   `.dev.vars.example` and the registered development callback all assume 3000. The port
   is now pinned in `vite.config.ts` with `strictPort`.
4. **Verification claims with nothing behind them.** "Explore Verified Mentors", a
   blanket "Verified Mentor" badge, "Rigorous credential verification" and "Posting with
   Verified Mentor Credential" are gone. Mentors now carry a real
   `verified | pending | unverified` state, the seed data mixes all three, and
   `src/lib/verification.ts` owns the labels, the tone and the explanation. Two of its
   four tests exist to pin the wording away from affiliation or certification language.
5. **False delivery claims.** "has been notified", "A calendar invite has been
   dispatched", "The mentee will be notified" and "will confirm within 24 hours" are all
   reworded to describe what actually happened on the device. No notification is sent and
   the interface now says so.
6. **No URLs.** The app had no deep links and a broken back button. Screens are now hash
   routes (`src/lib/router.ts`), unknown links and signed out deep links fall back home,
   and `src/App.test.tsx` drives the real app through a deep link, a nav click and a
   `hashchange` to prove the URL and the screen stay in step.
7. **A QA control in the shipped UI.** The four rule state switcher is now development
   only, or opt in with `?qa=1` on a built site (`src/lib/qa.ts`).
8. **The stack line and the port** are covered by 2 and 3.

### Checks after these fixes

`npm run typecheck` (app plus worker) exit 0. **151 tests pass, 18 files** in total (was
127) and 24 new tests came with these fixes. `vite build` succeeds. The Worker dry run
bundle succeeds. The dev server serves the preview host at 200, refuses a foreign Host
with 403, transforms all 24 modules without error, and logs nothing.

Not verified, and not claimed: no browser was available, so the deep links, the room
links and the verification badges were exercised in jsdom and over HTTP, not by a person
clicking them, and nothing was deployed.

---

# Addendum: the AI-first upgrade (Vibecon 2.0, Track 02)

## 1. Problems found in the audit

1. **The brief assumed Convex. This repository has no Convex.** The backend is a single
   Cloudflare Worker (`worker/index.ts`) with D1, a provider adapter in `worker/lib/ai/`
   and Sign in with Freebuff. The right move was to extend what exists, not to add a
   second data layer, so nothing about Convex was introduced.
2. **The interface did not call the backend at all.** Every screen ran on `src/data/`
   with React state, so a complete tested API sat unused: the largest gap between what the
   product claimed and what it did.
3. **There was no assessment, no gap analysis and no agent.** Roadmap generation and
   matching existed server side, so the missing loop was ASSESS, FIND GAPS and ADAPT.
4. **Proof of work could not be attached to anything.** A milestone could be marked done
   but carried no evidence, which is exactly what a judge asks about.
5. **Left unaddressed on purpose:** payments, calendar, email, video and any vector store.
   None is needed for the loop above, and adding one would be infrastructure for its own
   sake.

## 2. What was built (five vertical slices)

**Slice 1, assessment and gap analysis.** `POST /api/assessment` takes the stored profile
plus anything typed on the form, and returns schema validated findings: target role,
strengths, gaps, and per finding an evidence line, a priority, a confidence and suggested
exercises. A strength the model claims without support in the profile is demoted to
self reported and the count is shown. A profile that is too thin is answered with the two
fields that would unblock it, or the result is labelled provisional. Nothing invents job
requirements, statistics or citations. `GET /api/assessment` returns the latest result and
its history from `assessments`.

**Slice 2, real roadmap generation.** `POST /api/roadmap/plan` returns a proposal and
writes nothing; `POST /api/roadmap/apply` re-validates the confirmed plan server side and
writes it, reporting how many steps were created, replaced or preserved. Milestones carry
an estimate, a deadline, a why, and completion starts at not started: the model cannot mark
anything done. Regeneration preserves completed work and personal tasks.

**Slice 3, the adaptation agent (the centrepiece).** `POST /api/agent/propose` reads real
state, finds a trigger (an overdue milestone from stored dates, or a step untouched for a
week), proposes one bounded action with its reasoning and evidence, and stores it in
`agent_proposals` with a unique idempotency key. `POST /api/agent/proposals/:id/decision`
approves, edits or rejects it; approving executes idempotently, so approving twice cannot
create a duplicate milestone. Tools are narrow by construction: read own profile, read own
roadmap, analyse progress, propose an action, create or update a milestone, save one small
task, prepare a mentorship request. There is no arbitrary query, code execution or external
request, and the history keeps every decision with its timestamp instead of deleting it.

**Slice 4, explainable matching in the interface.** `#/mentors` now renders the
`GET /api/matches` response: eligibility filters first, then the deterministic weight
breakdown per card (each factor with its weight, its normalised value and whether it was
dropped for missing data), then the written reason, labelled as written by the model or by
the app. The disclaimer states in the interface that a fit score is not a probability of
success.

**Slice 5, not built.** Evidence attachments and the session copilot are not implemented:
there is no way to attach a project to a milestone from the interface, and no agenda or
notes copilot. The demo script says so out loud rather than implying it exists.

**Alongside the slices:** the signed in screens were wired to the API (student workspace,
mentor hub, roadmap workspace, matching, agent at a real deep link `#/agent`), and a
labeled demo scenario seed was added so the loop can be demonstrated on an empty account.

## 3. AI provider and architecture

The provider is the one the repository already had: Google Gemini through the Generative
Language API, called from a Worker action, never from the browser. `worker/lib/ai/`
provides one adapter (`generateJson`) that enforces a JSON response schema, an input
character budget, a timeout, bounded retries, per user rate limits and a dedupe cache, and
returns either validated structured data or a typed `AiError`. Every module above goes
through it, so a provider failure cannot be mistaken for a model answer: without a key the
routes say the feature requires configuration, and `AI_DEMO_MODE=true` serves the
deterministic engine in `worker/lib/demo.ts` with the engine labelled in the response and
on screen. Structured output and tool calling shapes were checked against the provider's
official documentation before integrating; the request/response contract is the
`responseMimeType` plus `responseSchema` pair, and the agent uses a bounded tool style loop
implemented in application code rather than open-ended function calling.

## 4. Backend and schema changes

All additive. `ensureSchema` creates the two new tables and one new column, so an existing
database keeps every row:

- `assessments` (one row per run, with the input hash so a reload does not spend another
  model call), and `agent_proposals` (with a unique index on `idempotency_key`).
- `profiles.demo_seeded_at`, added through the existing guarded pragma migration, which is
  what lets the interface label seeded sample data as seeded.
- No column was renamed, retyped or dropped, and no existing route changed its contract.

**A real defect the live check caught, and its fix.** `ensureSchema` flattens each schema
script with `replace(/\n/g, ' ')` before handing it to `D1Database.exec`, which runs one
statement per line. The comments added above the new tables were joined onto the statements
that followed them, so the whole batch executed as a comment and every route, including
`/api/health`, answered 500 against a freshly created database. `wrangler dev` on a fresh
local D1 is what exposed it; the unit suite could not, because the stub database never runs
schema SQL. The fix is `schemaSqlForExec`, which strips line comments before flattening,
and `worker/lib/schema.test.ts` now pins that no `--` or newline reaches `exec` and that
every `CREATE` statement survives the transformation.

## 5. Security controls

- **Identity is the session, never the client.** Every new route reads the Freebuff
  session cookie and queries by the session subject. No route accepts a user id, and the
  agent's tools are scoped to the caller's own rows by construction.
- **Authorization is re-checked at write time.** A proposal can only be decided by the
  user it belongs to; a mentorship request repeats the eligibility checks server side
  rather than trusting the match response; mentor transitions are role checked; a mentor
  sees only the mentee summary the server chooses to expose.
- **Cross-origin mutations are refused** for every new POST, so a page on another origin
  cannot ride the session cookie.
- **Model output is untrusted.** Everything is validated against a schema before it is
  stored, user text is passed as data and never as instructions, and a malformed answer is
  rejected whole rather than partially saved.
- **The demo seed is gated and labeled.** It requires a session, refuses unless
  `AI_DEMO_MODE` is on, fills rather than overwrites, is idempotent, and marks the account
  so the sample data is visible as sample data.
- **Secrets stay server side.** No key is read by the browser, logged, or committed; the
  environment variable names are documented and the values are not.

## 6. Checks actually run

`npm run typecheck` (app plus worker) exit 0. **248 tests pass across 30 files**, against
151 across 18 at the previous report. **97 of them are new**: 96 in the 12 test files this
upgrade added, plus one in the router test. Worker side: 23 agent, 15 assessment, 7 roadmap
generation, 5 demo seed, 4 schema. Interface side: 8 assessment panel, 7 agent panel, 6
matching, 5 roadmap workspace, 5 mentor hub, 4 student workspace, 7 API client. `vite build` succeeds
(1707 modules). `npm run worker:build` dry run bundle succeeds. `wrangler dev` on a freshly
reset local D1 answers `/api/health` 200 with `engine: "demo"` and `authConfigured: true`,
`/api/mentors` 200, and `profile`, `assessment`, `matches`, `agent`, `demo/seed` and
`roadmap/plan` all 401 signed out. Through the Vite dev origin the app answers 200 for the
preview hostname and 403 for a foreign host, proxies `/api` to the Worker, and transforms
every new module without error. The Worker log held no errors after the schema fix.

**Interface requirements.** Keyboard access: every control on the new screens is a real
button, input, textarea or link with an accessible name, and the interface tests drive them
by role and label rather than by test id, so a control that loses its name fails the suite.
Reduced motion: `src/index.css` honours `prefers-reduced-motion: reduce`, and the new
screens add no animation of their own. Narrow screens: the matching card's factor row used
a fixed 176px label column beside the bar and was reviewed as an overflow risk at 375px; it
now stacks the label on its own row (`w-full sm:w-44`), pinned by a test that asserts the
classes. **Layout itself was not verified in a browser**: jsdom has no layout engine, so
responsive behaviour is asserted at class level and nothing here claims a visual check.

**Mocked versus real:** 45 of the new tests drive a **mocked provider** (assessment 15,
agent 23, roadmap generation 7), the interface tests stub the Worker's HTTP responses, and
the rest are pure logic. Every AI test uses a mocked provider, including the failure paths
(provider outage, malformed output, timeout, retry). **No test runs against the real Gemini
API, because no key exists in this environment.** The demo engine path is exercised for
real; the model path is exercised through a stub that returns the same shapes the provider
contract specifies. Do not read the model path as verified against Google's service.

## 7. Environment variable names

No values, and nothing here is committed with a value.

- Sign in: `FREEBUFF_CLIENT_ID`, `FREEBUFF_ISSUER`, `APP_ORIGIN`
- Provider: `AI_PROVIDER`, `AI_API_KEY`, `AI_MODEL`, `AI_MODEL_LITE`, `AI_EMBED_MODEL`,
  `AI_TIMEOUT_MS`, `AI_MAX_RETRIES`, `AI_MAX_INPUT_CHARS`, `AI_RATE_LIMIT_PER_HOUR`
- Demo: `AI_DEMO_MODE` (serves the deterministic engine and enables the demo seed route)
- Trust and matching: `MODERATOR_SUBS`, `MENTOR_VERIFICATION_REQUIRED`

`AI_API_KEY` is the only one needed for real model output; without it every AI screen is
labelled `demo` or reports that it requires configuration.

## 8. Still simulated or incomplete

1. **Slice 5 is not built:** no evidence attached to a milestone, no rubric feedback, no
   session copilot, no post session action items.
2. **The community board, the chat drawer and the request state on the sample screens**
   remain browser local, and say so on screen.
3. **Mentor availability** is only matched when both sides stored it; the interface cannot
   collect it yet, so that factor is usually dropped and reported as not evaluated.
4. **Mentor records are the bundled seed** in `worker/lib/db.ts`. They are real rows in the
   database, and they are not real people.
5. **No email, calendar, payments or video integration.** Accepting a request stores a
   decision and the screens say no notification is sent.

## 9. The demo sequence

The full three minute script is in `docs/DEMO_SCRIPT.md`. The short version: load the
labeled demo scenario, run the assessment, generate and save a roadmap, open the factor
breakdown behind a mentor match, ask the agent for a next action and approve it, watch the
deliberately overdue milestone be the trigger, then show the mentor hub and finally break
the provider key to show the error path.

## 10. Three weaknesses a skeptical judge would raise

1. **No model call has ever been made against the real provider here.** The integration is
   complete, schema validated and failure tested, but every model path was verified through
   a stub. Until a key is set and the flow is run once, the honest claim is "configured,
   not observed". That is the first thing to do before any demo.
2. **The adaptation agent's trigger set is narrow.** It reasons over stored dates and
   untouched steps, which is real but limited; new evidence and mentor feedback do not yet
   feed it, so a judge who asks "what makes it adapt?" gets an honest but small answer.
3. **Two products live in one app.** The signed in screens read the database while the
   marketing and community screens read bundled files, so a judge clicking around can find
   a screen where nothing they do is saved. The banners say so, which is better than
   pretending, but the split is a product decision that has not been resolved.
