/** Bindings and configuration available to the Worker. */
export interface Env {
  /** D1 database (provisioned by Sites, or local for `wrangler dev`). */
  DB: D1Database
  /** Static asset binding; absent when running the Worker without assets. */
  ASSETS?: Fetcher

  /* ---- AI provider (see worker/lib/ai/config.ts) ---- */
  /** AI provider key: a Worker secret. Never exposed to the browser. */
  AI_API_KEY?: string
  AI_PROVIDER?: string
  AI_MODEL?: string
  AI_MODEL_LITE?: string
  AI_EMBED_MODEL?: string
  /** Numeric limits, as strings (Worker vars are strings). */
  AI_TIMEOUT_MS?: string
  AI_MAX_RETRIES?: string
  AI_MAX_INPUT_CHARS?: string
  AI_RATE_LIMIT_PER_HOUR?: string
  AI_DEDUPE_WINDOW_MS?: string
  /** Local development only: serve the deterministic engine instead of erroring. */
  AI_DEMO_MODE?: string

  /* ---- Trust & moderation ---- */
  /**
   * Comma-separated Freebuff `sub` values allowed to review mentor verification
   * submissions. A server side variable only: no route grants it to a user, and
   * it is never read from a request body or header.
   */
  MODERATOR_SUBS?: string
  /**
   * `'true'` turns verification into a matching gate: mentors whose status is
   * `unverified` or `pending` stop being recommended. Default is off, because a
   * fresh deployment with a single reviewer would otherwise show every student
   * an empty list. `rejected` and `suspended` mentors are excluded either way.
   */
  MENTOR_VERIFICATION_REQUIRED?: string

  /* ---- Back-compat with the original Gemini-only variable names ---- */
  GEMINI_API_KEY?: string
  GEMINI_MODEL?: string
  GEMINI_MODEL_LITE?: string
  GEMINI_EMBED_MODEL?: string

  /**
   * Sign in with Freebuff. All three are PUBLIC configuration (no secret) and
   * are injected on deploy by the hosting platform; locally they come from
   * `.dev.vars` (see `.dev.vars.example`).
   */
  FREEBUFF_CLIENT_ID?: string
  FREEBUFF_ISSUER?: string
  /** The site's canonical origin. Never derived from the request Host header. */
  APP_ORIGIN?: string
}
