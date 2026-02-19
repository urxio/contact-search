import { NextRequest, NextResponse } from "next/server"

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl

  // Allow the login page and its POST action through
  if (pathname === "/admin/login") {
    return NextResponse.next()
  }

  // Protect all /admin/* routes
  if (pathname.startsWith("/admin")) {
    const session = req.cookies.get("admin_session")
    if (session?.value !== process.env.ADMIN_PASSWORD) {
      const loginUrl = new URL("/admin/login", req.url)
      return NextResponse.redirect(loginUrl)
    }
  }

  return NextResponse.next()
}

export const config = {
  matcher: ["/admin/:path*"],
}
