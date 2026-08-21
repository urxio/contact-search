import { NextRequest, NextResponse } from "next/server"
import { authErrorResponse, auditEvent, AuthError, createAuthSession, hashPassword, validateMutationOrigin } from "@/lib/auth"
import { ensureSchema, pool } from "@/lib/db"

export async function GET() { await ensureSchema(); const result = await pool.query(`SELECT EXISTS(SELECT 1 FROM users WHERE is_platform_admin) configured`); return NextResponse.json({ available: !result.rows[0].configured }) }

export async function POST(request: NextRequest) {
  try {
    validateMutationOrigin(request); await ensureSchema()
    const { token, email, displayName, password } = await request.json()
    if (!process.env.PLATFORM_SETUP_TOKEN || token !== process.env.PLATFORM_SETUP_TOKEN) return NextResponse.json({ error: "Setup token is invalid" }, { status: 401 })
    if (typeof email !== "string" || typeof displayName !== "string" || !displayName.trim()) return NextResponse.json({ error: "Name and email are required" }, { status: 400 })
    const passwordHash = await hashPassword(password)
    const client = await pool.connect(); let userId = 0
    try {
      await client.query("BEGIN"); await client.query(`SELECT pg_advisory_xact_lock(hashtext('search-helper-platform-setup'))`)
      const configured = await client.query(`SELECT 1 FROM users WHERE is_platform_admin`)
      if (configured.rowCount) throw new AuthError(404, "Setup is already complete")
      const result = await client.query(`INSERT INTO users(email,display_name,password_hash,is_platform_admin) VALUES(lower(trim($1)),$2,$3,true) RETURNING id`, [email, displayName.trim(), passwordHash]); userId = Number(result.rows[0].id)
      await client.query(`INSERT INTO congregation_memberships(user_id,congregation_id,role,display_name) SELECT $1,id,'admin',$2 FROM congregations WHERE slug='central-french-alexandria'`, [userId, displayName.trim()])
      await client.query("COMMIT")
    } catch (error) { await client.query("ROLLBACK"); throw error } finally { client.release() }
    await auditEvent({ actorUserId: userId, action: "platform.setup_completed", targetType: "user", targetId: String(userId) }); await createAuthSession(userId)
    return NextResponse.json({ ok: true })
  } catch (error) { return authErrorResponse(error) }
}
