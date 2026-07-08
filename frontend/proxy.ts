import { auth } from "@/auth"

// Protect everything under /app except the auth page itself.
export default auth((req) => {
  const { pathname, origin } = req.nextUrl
  const isAuthed = !!req.auth
  const isAuthPage = pathname.startsWith("/app/auth")

  if (pathname.startsWith("/app") && !isAuthPage && !isAuthed) {
    const url = new URL("/app/auth", origin)
    url.searchParams.set("callbackUrl", pathname)
    return Response.redirect(url)
  }

  // Already signed in — skip the auth page.
  if (isAuthPage && isAuthed) {
    return Response.redirect(new URL("/app", origin))
  }
})

export const config = {
  matcher: ["/app/:path*"],
}
