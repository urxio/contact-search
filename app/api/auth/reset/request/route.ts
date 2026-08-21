import { NextRequest, NextResponse } from "next/server"
import { authErrorResponse, issuePasswordReset, requireUser, validateMutationOrigin } from "@/lib/auth"
import { pool } from "@/lib/db"

export async function POST(request: NextRequest) {
  try {
    validateMutationOrigin(request); const actor = await requireUser(); const { email } = await request.json()
    if (typeof email !== "string") return NextResponse.json({ error: "Email is required" }, { status: 400 })
    const target = await pool.query(`SELECT id FROM users WHERE email=lower(trim($1))`, [email])
    if (!target.rowCount) return NextResponse.json({ error: "User not found" }, { status: 404 })
    const targetId = Number(target.rows[0].id)
    if (!actor.isPlatformAdmin && actor.id !== targetId) {
      const allowed = await pool.query(`SELECT 1 FROM congregation_memberships a JOIN congregation_memberships t ON t.congregation_id=a.congregation_id WHERE a.user_id=$1 AND a.role='admin' AND a.status='active' AND t.user_id=$2 AND t.status='active'`, [actor.id, targetId])
      if (!allowed.rowCount) return NextResponse.json({ error: "User not found" }, { status: 404 })
    }
    const reset = await issuePasswordReset({ userId: targetId, createdByUserId: actor.id })
    return NextResponse.json(reset)
  } catch (error) { return authErrorResponse(error) }
}
