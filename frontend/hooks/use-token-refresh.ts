"use client"

import { useEffect, useRef } from "react"
import { useSession } from "next-auth/react"

/**
 * Proactively refreshes the access token before it expires.
 *
 * NextAuth's `jwt()` callback already refreshes tokens lazily (on session
 * access), but if a user stays on a page without triggering a session read,
 * the access token can silently expire and the next API call will 401.
 *
 * This hook sets a timeout to call `update()` ~60s before the access token
 * expires, which triggers the `jwt()` callback → `refreshAccessToken()`.
 * It re-aligns the timer whenever the session changes (new tokens, etc.).
 *
 * The refresh token itself is also rotated on every access-token refresh
 * (the backend's `/auth/refresh` endpoint returns a new refresh+access pair),
 * so keeping the access token alive automatically keeps the refresh token
 * alive too.
 */
export function useTokenRefresh() {
  const { data: session, status, update } = useSession()
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    // Only run when authenticated and we have an expiry timestamp.
    if (status !== "authenticated" || !session?.accessToken) return

    // Fire the refresh 60s before the access token expires. This aligns
    // with the 60s safety margin in the jwt() callback — if the proactive
    // timer somehow misses (tab throttled, etc.), the lazy check in jwt()
    // catches it on the next session access.
    const SAFETY_MS = 60_000
    const expiresAt = session.accessTokenExpires ?? Date.now() + 900_000
    const delay = Math.max(expiresAt - Date.now() - SAFETY_MS, 10_000)

    function scheduleRefresh(ms: number) {
      if (timerRef.current) clearTimeout(timerRef.current)
      timerRef.current = setTimeout(async () => {
        try {
          await update()
        } catch {
          // update() never throws — errors are captured as session.error.
        }
        // Re-schedule is handled by the effect re-running when
        // session.accessToken changes after update().
      }, ms)
    }

    scheduleRefresh(delay)

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current)
    }
    // Re-run when the access token or expiry changes (i.e. after a refresh).
  }, [session?.accessToken, session?.accessTokenExpires, status, update])
}
