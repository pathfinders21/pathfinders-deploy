/**
 * The failure vocabulary for every AI call.
 *
 * A classifier rather than a message, because the caller has to make a real
 * decision with it: an unconfigured provider is the user's problem to fix with a
 * key, a rate limit is a wait-and-retry, a timeout may be retried immediately,
 * and malformed output must never be written anywhere. Anything the client is
 * told maps 1:1 onto one of these kinds: there is no "something went wrong".
 */

export type AiErrorKind =
  | 'ai_unconfigured'
  | 'ai_rate_limited'
  | 'ai_timeout'
  | 'ai_provider_error'
  | 'ai_invalid_output'
  | 'ai_input_too_large'
  | 'ai_busy'

const STATUS: Record<AiErrorKind, number> = {
  // 503, not 500: the service is not broken, it is not yet configured.
  ai_unconfigured: 503,
  ai_rate_limited: 429,
  ai_timeout: 504,
  ai_provider_error: 502,
  ai_invalid_output: 502,
  ai_input_too_large: 413,
  ai_busy: 409,
}

export class AiError extends Error {
  kind: AiErrorKind
  /** Seconds the client may safely wait before retrying, when known. */
  retryAfter?: number
  /** Whether trying the identical request again could plausibly succeed. */
  retryable: boolean

  constructor(
    kind: AiErrorKind,
    message: string,
    opts: { retryAfter?: number; retryable?: boolean } = {},
  ) {
    super(message)
    this.name = 'AiError'
    this.kind = kind
    this.retryAfter = opts.retryAfter
    // Retryable by default for the transient kinds; a caller that knows better
    // (a 4xx from the provider will fail identically next time) overrides it.
    this.retryable =
      opts.retryable ??
      (kind === 'ai_timeout' || kind === 'ai_provider_error' || kind === 'ai_rate_limited' || kind === 'ai_busy')
  }

  get status(): number {
    return STATUS[this.kind]
  }

  /**
   * The wire shape. `requiredEnv` is included for the one failure the operator
   * can fix without reading code: an unconfigured provider names the variable.
   */
  toPayload(): Record<string, unknown> {
    return {
      ok: false,
      error: this.message,
      code: this.kind,
      retryable: this.retryable,
      ...(this.retryAfter !== undefined ? { retryAfter: this.retryAfter } : {}),
      ...(this.kind === 'ai_unconfigured'
        ? { requiredEnv: ['AI_API_KEY'], configuredVia: 'Sites → Secrets (or .dev.vars locally), then redeploy' }
        : {}),
    }
  }
}
