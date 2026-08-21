import { NextRequest, NextResponse } from "next/server"
import { pool } from "@/lib/db"
import { auditEvent, issueInvitation, requirePlatformAdmin, validateMutationOrigin } from "@/lib/auth"
import { apiError, assertMultiTenantEnabled } from "../../c/_shared"

export async function GET() {
  try {
    assertMultiTenantEnabled()
    await requirePlatformAdmin()
    const result = await pool.query(
      `SELECT c.id, c.name, c.slug, c.status, c.settings,
              COUNT(m.id) FILTER (WHERE m.status = 'active')::int AS "memberCount"
       FROM congregations c LEFT JOIN congregation_memberships m ON m.congregation_id = c.id
       GROUP BY c.id ORDER BY c.name`,
    )
    return NextResponse.json({ congregations: result.rows })
  } catch (error) { return apiError(error) }
}

export async function POST(req: NextRequest) {
  try {
    assertMultiTenantEnabled()
    validateMutationOrigin(req)
    const user = await requirePlatformAdmin()
    const body = await req.json()
    const name = String(body.name ?? "").trim()
    const slug = String(body.slug ?? "").trim().toLowerCase()
    const adminEmail = String(body.adminEmail ?? "").trim().toLowerCase()
    if (name.length < 2 || name.length > 100 || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) {
      return NextResponse.json({ error: "A valid name and slug are required." }, { status: 400 })
    }
    if (adminEmail && !/^\S+@\S+\.\S+$/.test(adminEmail)) {
      return NextResponse.json({ error: "Enter a valid administrator email." }, { status: 400 })
    }
    try {
      const result = await pool.query(
        `INSERT INTO congregations (name, slug, settings) VALUES ($1,$2,'{}'::jsonb)
         RETURNING id, name, slug, status, settings`,
        [name, slug],
      )
      const congregation = result.rows[0]
      let invitation: { token: string; expiresAt: Date } | null = null
      if (adminEmail) {
        invitation = await issueInvitation({ congregationId: Number(congregation.id), email: adminEmail,
          role: "admin", createdByUserId: user.id })
      }
      await auditEvent({ actorUserId: user.id, congregationId: Number(congregation.id),
        action: "congregation.created", targetType: "congregation", targetId: String(congregation.id),
        metadata: { name, slug, firstAdminEmail: adminEmail || null } })
      return NextResponse.json({ congregation,
        ...(invitation ? { token: invitation.token,
          inviteUrl: new URL(`/join/${invitation.token}`, req.nextUrl.origin).toString(), expiresAt: invitation.expiresAt } : {}) },
        { status: 201 })
    } catch (error: any) {
      if (error?.code === "23505") return NextResponse.json({ error: "That slug is already in use." }, { status: 409 })
      throw error
    }
  } catch (error) { return apiError(error) }
}
