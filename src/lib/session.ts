/**
 * Who the visitor is, according to the server.
 *
 * The interface previously held a user object in localStorage, which meant anyone
 * could edit it and the app would believe them. It now asks the backend, which reads
 * the Freebuff session cookie and answers 401 when there is none. Nothing here decides
 * access: it only decides what to render. Every protected endpoint re-checks.
 */
import { useCallback, useEffect, useState } from 'react'
import { ApiError, api, type ApiProfile } from './api.ts';

export type Session =
  | { status: 'loading' }
  | { status: 'signed_out' }
  | { status: 'error'; error: ApiError }
  | {
      status: 'ready'
      profile: ApiProfile
      role: 'mentee' | 'mentor' | ''
      roleChosen: boolean
      completion: number
      onboardingComplete: boolean
      isMentor: boolean
    }

export type UseSession = {
  session: Session
  refresh: () => Promise<void>
}

/** Where to send someone to sign in, coming back to the screen they were on. */
export function signInHref(returnTo?: string): string {
  const target = returnTo ?? `${window.location.pathname}${window.location.hash}`
  return `/auth/freebuff/signin?returnTo=${encodeURIComponent(target)}`
}

/**
 * Sign out is a POST, never a link: a GET that ends a session can be triggered by any
 * image tag on any page.
 */
export function signOut(): void {
  const form = document.createElement('form')
  form.method = 'POST'
  form.action = '/auth/freebuff/signout'
  document.body.appendChild(form)
  form.submit()
}

export function useSession(): UseSession {
  const [session, setSession] = useState<Session>({ status: 'loading' })

  const refresh = useCallback(async () => {
    try {
      const result = await api.profile()
      setSession({
        status: 'ready',
        profile: result.profile,
        role: result.role,
        roleChosen: result.roleChosen,
        completion: result.completion,
        onboardingComplete: result.onboardingComplete,
        isMentor: result.role === 'mentor',
      })
    } catch (error) {
      if (error instanceof ApiError && error.kind === 'signed_out') {
        setSession({ status: 'signed_out' })
        return
      }
      // A backend that is not running locally is not "signed out": saying so would be a
      // lie that sends the visitor in a circle.
      setSession({
        status: 'error',
        error:
          error instanceof ApiError
            ? error
            : new ApiError({ kind: 'server', status: 0, message: 'The server could not be reached.' }),
      })
    }
  }, [])

  useEffect(() => {
    let alive = true
    void (async () => {
      try {
        const result = await api.profile()
        if (!alive) return
        setSession({
          status: 'ready',
          profile: result.profile,
          role: result.role,
          roleChosen: result.roleChosen,
          completion: result.completion,
          onboardingComplete: result.onboardingComplete,
          isMentor: result.role === 'mentor',
        })
      } catch (error) {
        if (!alive) return
        if (error instanceof ApiError && error.kind === 'signed_out') {
          setSession({ status: 'signed_out' })
          return
        }
        setSession({
          status: 'error',
          error:
            error instanceof ApiError
              ? error
              : new ApiError({ kind: 'server', status: 0, message: 'The server could not be reached.' }),
        })
      }
    })()
    return () => {
      alive = false
    }
  }, [])

  return { session, refresh }
}
