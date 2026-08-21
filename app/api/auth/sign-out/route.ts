import { NextRequest, NextResponse } from "next/server"
import { auditEvent, authErrorResponse, destroyAuthSession, getCurrentSession, validateMutationOrigin } from "@/lib/auth"

export async function POST(request: NextRequest) {
  try { validateMutationOrigin(request); const current = await getCurrentSession(); await destroyAuthSession(current?.sessionId); if(current) await auditEvent({actorUserId:current.user.id,action:"auth.signed_out",targetType:"user",targetId:String(current.user.id)}); return NextResponse.json({ ok: true }) }
  catch (error) { return authErrorResponse(error) }
}
