# PathFinders: three minute demo script

Everything below runs on real stored records. Nothing on screen is a canned reply, and the
deterministic fallback is always labelled as the demo engine when no provider key is set.

## Before you start

```bash
npm ci
cp .dev.vars.example .dev.vars     # fill FREEBUFF_CLIENT_ID, FREEBUFF_ISSUER, APP_ORIGIN
                                   # set AI_DEMO_MODE=true, or set AI_API_KEY for the real model
npm run db:local:reset             # optional: start from an empty local database
npm run dev:api                    # Worker on :8787 (D1 local, /api)
npm run dev                        # interface on :3000, proxies /api and /auth
```

Open http://localhost:3000 and sign in. The signed-in screens read your own account, so
there is no fixture to pretend with.

Watch the two labels while you demo: a green chip means the model produced the text, an
amber chip means the deterministic demo engine did because no key is configured.

## 0:00 to 0:25 — a real profile

1. `#/dashboard` shows your workspace: step progress, overdue count and profile completion
   are counted from stored rows, not hardcoded.
2. On an empty account, press **Load the demo scenario**. It writes a labeled sample
   profile, one goal and a three milestone roadmap, and marks the account
   `demo_seeded_at`, so the amber "Seeded demo scenario" banner appears. One milestone is
   deliberately two days overdue: that is the adaptation trigger later.
3. Say out loud: every field the seed found already filled in was left alone.

## 0:25 to 0:50 — assess

1. `#/assess`, state your goal in your own words plus one thing you have built, and press
   **Analyse my gaps**.
2. Point at one gap: it carries an evidence line, a priority and a confidence, and its
   strengths are split into *evidenced* and *self reported*. No job requirements, no
   statistics, no citations.
3. If your profile is thin, the screen answers with the two questions that would unblock
   it instead of inventing findings. Show that if you can.

## 0:50 to 1:20 — plan, with the human in the loop

1. `#/roadmaps`, press **Generate a roadmap** (or **Regenerate a plan**).
2. The plan arrives as a **proposal**, with its engine labelled. Edit one milestone title
   in place. The proposal says plainly that nothing is saved yet.
3. Press **Save this plan to my roadmap**. The message reports what was written, and every
   new step starts as not started. The agent never marks work complete.

## 1:20 to 1:50 — match, with the arithmetic on screen

1. `#/mentors` lists only mentors that exist in the database, ranked by the deterministic
   engine.
2. Open the **How the 78 was computed** block: each factor, its weight, its 0 to 100
   normalised value, and whether it was dropped because one side had no data.
3. Read the disclaimer aloud: a fit score for ranking, not a probability of success. The
   summary chip says whether the model wrote the sentence or the app did.
4. Press **Request mentorship** on one card and send it. The request stores the same score
   the mentor will see.

## 1:50 to 2:30 — the signature part: the agent, and the overdue milestone

1. `#/agent` (or the workspace's **Next recommended action**) shows the agent's reading of
   your state: steps done, overdue, not touched in a week.
2. Press **Propose a next action**. The proposal cites its trigger and its evidence, for
   example *"Add a queue was due 2 days ago"*, and shows the model's own confidence.
3. Press **Edit first**, change the wording, then **Approve**. The response says exactly
   what changed, and the history below keeps the decision with its timestamp.
4. Approve nothing for a moment and point at the empty state: the app is waiting for a
   person, and no write happens until one of those buttons is pressed.

## 2:30 to 3:00 — the mentor side, then the honest edge

1. Sign in as a mentor account and open `#/dashboard`: incoming requests show the context
   the server exposes and nothing more, accepting stores the decision, and the screen says
   plainly that no email is sent.
2. Break it on purpose: unset the provider key, press regenerate, and show the error with
   the env var it names. Then stop the Worker and reload: the app says the backend is not
   answering rather than showing a plausible plan.

## What to say if a judge asks what is not supported

No payments, no calendar integration, no email, no video, no vector database. Mentor
availability is matched only when both sides stored it. Session copilot and evidence
attachments (Slice 5) are not built: there is no way to attach a project to a milestone
from the interface yet.

## One paragraph technical explainer

PathFinders keeps a Cloudflare Worker and D1 backend and adds three server-side modules: a
profile driven gap analysis, a goal and hours aware roadmap generator, and a controlled
adaptation agent. Every model call goes through one provider adapter that enforces a JSON
schema, a character budget, a timeout, bounded retries, per-user rate limits and a cache
key, and it either returns validated structured data or throws a typed error the interface
renders as an error with a retry. The app, not the model, decides: the deterministic
matching engine computes and orders candidates before any model call and the model may only
rephrase what was computed, roadmap generation returns a proposal that is re-validated
server side on save, and the agent's writes happen only through an explicit approve or edit
decision, idempotently, with the reasoning, evidence and outcome kept in a history table.
Identity comes from the Freebuff session cookie on every request, user scoped rows are
queried by the session subject, cross-origin mutations are rejected, and when no provider
key is configured the deterministic demo engine answers with a visible label instead of
pretending to be the model.
