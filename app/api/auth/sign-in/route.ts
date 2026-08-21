import { NextRequest, NextResponse } from "next/server"
import { authErrorResponse, signIn, validateMutationOrigin } from "@/lib/auth"

export async function POST(request: NextRequest) {
  try {
    validateMutationOrigin(request)
    const body = await request.json()
    if (typeof body.email !== "string" || typeof body.password !== "string") return NextResponse.json({ error: "Email and password are required" }, { status: 400 })
    const user = await signIn(body.email, body.password)
    return NextResponse.json({ user: { id: user.id, email: user.email, displayName: user.displayName, isPlatformAdmin: user.isPlatformAdmin } })
  } catch (error) { return authErrorResponse(error) }
}
