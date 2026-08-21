import { NextRequest, NextResponse } from "next/server"
import { authErrorResponse, consumePasswordReset, validateMutationOrigin } from "@/lib/auth"

export async function POST(request: NextRequest) {
  try { validateMutationOrigin(request); const { token, password } = await request.json(); await consumePasswordReset(token, password); return NextResponse.json({ ok: true }) }
  catch (error) { return authErrorResponse(error) }
}
