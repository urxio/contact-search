import { NextRequest, NextResponse } from "next/server"

const AUTH_COOKIE_NAME = "search_helper_session"

function legacyApi(pathname: string) {
  return pathname === "/api/submissions" ||
    pathname.startsWith("/api/admin/") ||
    pathname.startsWith("/api/territories/")
}

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl

  if (process.env.MULTI_TENANT_ENABLED !== "true") {
    if (pathname === "/admin/login") return NextResponse.next()
    if (pathname.startsWith("/admin")) {
      const session = req.cookies.get("admin_session")
      if (session?.value !== process.env.ADMIN_PASSWORD) {
        return NextResponse.redirect(new URL("/admin/login", req.url))
      }
    }
    return NextResponse.next()
  }

  // The global v1 APIs cannot safely infer a congregation. Disable them at
  // cutover rather than risk a cross-congregation read or mutation.
  if (legacyApi(pathname)) {
    return NextResponse.json({ error: "This endpoint has moved to a congregation workspace." }, { status: 404 })
  }
  if (pathname.startsWith("/api/")) return NextResponse.next()

  const isPublic = pathname.startsWith("/auth/") || pathname === "/setup" || pathname.startsWith("/join/")
  if (isPublic) return NextResponse.next()

  if (!req.cookies.has(AUTH_COOKIE_NAME)) {
    const signIn = new URL("/auth/sign-in", req.url)
    signIn.searchParams.set("next", `${pathname}${req.nextUrl.search}`)
    return NextResponse.redirect(signIn)
  }

  if (pathname === "/" || pathname.startsWith("/territories") || pathname.startsWith("/admin")) {
    return NextResponse.redirect(new URL("/workspaces", req.url))
  }

  return NextResponse.next()
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|icon.svg|.*\\..*).*)"],
}
