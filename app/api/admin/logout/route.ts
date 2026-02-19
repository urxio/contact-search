import { NextRequest, NextResponse } from "next/server"

export async function POST(req: NextRequest) {
  // Redirect to the main site homepage after sign-out
  const res = NextResponse.redirect(new URL("/", req.url))
  res.cookies.set("admin_session", "", { maxAge: 0, path: "/" })
  return res
}
