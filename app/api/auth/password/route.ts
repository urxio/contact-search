import { NextRequest, NextResponse } from "next/server"
import { authErrorResponse, auditEvent, hashPassword, requireUser, validateMutationOrigin, verifyPassword } from "@/lib/auth"
import { pool } from "@/lib/db"

export async function POST(request: NextRequest) {
  try {
    validateMutationOrigin(request)
    const user = await requireUser(); const body = await request.json()
    if (typeof body.currentPassword !== "string" || typeof body.newPassword !== "string") return NextResponse.json({ error: "Both passwords are required" }, { status: 400 })
    const result = await pool.query(`SELECT password_hash FROM users WHERE id=$1`, [user.id])
    if (!(await verifyPassword(body.currentPassword, result.rows[0].password_hash))) return NextResponse.json({ error: "Current password is incorrect" }, { status: 401 })
    const passwordHash = await hashPassword(body.newPassword)
    await pool.query(`UPDATE users SET password_hash=$1,password_changed_at=NOW() WHERE id=$2`, [passwordHash, user.id])
    await auditEvent({ actorUserId: user.id, action: "password.changed", targetType: "user", targetId: String(user.id) })
    return NextResponse.json({ ok: true })
  } catch (error) { return authErrorResponse(error) }
}
