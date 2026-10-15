/**
 * The CSRF decision for state-changing requests.
 *
 * Extracted from the router so it can be tested directly: it is a security
 * control, and a security control that is only reachable from behind a session
 * is hard to prove. The rule itself is one line: a foreign Origin, or a
 * cross site `Sec-Fetch-Site`, is rejected: but "we return 403 for a cross site
 * mutation" deserves a test rather than a comment.
 *
 * The router deliberately runs this *after* the session check, so an anonymous
 * probe learns nothing beyond "sign in required"; the 403 branch is what a
 * signed-in victim's browser would hit.
 */

import { isSameOriginRequest } from '@freebuff/auth'

export type CsrfVerdict = { ok: true } | { ok: false; status: number; message: string }

export function csrfVerdict(request: Request, appOrigin: string | undefined): CsrfVerdict {
  if (!appOrigin) {
    return { ok: false, status: 503, message: 'Auth is not configured (APP_ORIGIN is missing).' }
  }
  if (!isSameOriginRequest(request, appOrigin)) {
    return { ok: false, status: 403, message: 'Cross origin request rejected' }
  }
  return { ok: true }
}
