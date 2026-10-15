/**
 * Sign in with Freebuff: identity for every request.
 *
 * The auth instance is created once per isolate (it caches OIDC discovery and
 * signing keys) and then reused, so a per-request rebuild cannot silently
 * disable session refresh. `baseUrl` always comes from configuration
 * (`APP_ORIGIN`), never from the request's Host header.
 */

import { createFreebuffAuth, type FreebuffAuth } from '@freebuff/auth'
import type { Env } from '../env'

const LOOPBACK = /^http:\/\/(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/

let instance: FreebuffAuth | null = null
let instanceKey = ''

/**
 * Returns the configured auth instance, or null when the environment has no
 * auth variables (which is a misconfiguration for anything but a bare local
 * smoke test: every user-scoped endpoint then answers 401).
 */
export function freebuffAuth(env: Env): FreebuffAuth | null {
  if (!env.FREEBUFF_CLIENT_ID || !env.APP_ORIGIN) return null

  const key = `${env.FREEBUFF_CLIENT_ID}|${env.FREEBUFF_ISSUER ?? ''}|${env.APP_ORIGIN}`
  if (!instance || instanceKey !== key) {
    instance = createFreebuffAuth({
      clientId: env.FREEBUFF_CLIENT_ID,
      issuer: env.FREEBUFF_ISSUER,
      baseUrl: env.APP_ORIGIN,
      // Only ever true for a loopback origin, so a deployed (https) site can
      // never be downgraded to http by configuration drift.
      allowInsecureLocalhost: LOOPBACK.test(env.APP_ORIGIN),
    })
    instanceKey = key
  }
  return instance
}

/**
 * The signed-in visitor, or null.
 *
 * Must be called inside `auth.wrap(...)` so that an expired session is
 * refreshed and its cookies travel back on the response.
 */
export async function currentUser(request: Request, env: Env) {
  const auth = freebuffAuth(env)
  if (!auth) return null
  return auth.getUser(request)
}
