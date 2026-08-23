import { NextRequest, NextResponse } from "next/server"
import { pool } from "@/lib/db"
import { auditEvent, issueInvitation, requireCongregationAdmin, validateMutationOrigin } from "@/lib/auth"
import { apiError, assertMultiTenantEnabled, integer, RouteContext } from "../../_shared"

export async function GET(_req: NextRequest, { params }: RouteContext) {
  try {
    assertMultiTenantEnabled()
    const auth = await requireCongregationAdmin(params.slug)
    const result = await pool.query(
      `SELECT i.id, i.email, i.role, i.expires_at AS "expiresAt", i.accepted_at AS "acceptedAt",
              i.revoked_at AS "revokedAt", i.created_at AS "createdAt",
              l.display_name AS "legacyDisplayName", u.display_name AS "createdByDisplayName"
       FROM invitations i
       LEFT JOIN legacy_identities l ON l.id = i.legacy_identity_id
       LEFT JOIN users u ON u.id = i.created_by_user_id
       WHERE i.congregation_id = $1 ORDER BY i.created_at DESC`,
      [auth.congregation.id],
    )
    return NextResponse.json({ invitations: result.rows })
  } catch (error) {
    return apiError(error)
  }
}

export async function POST(req: NextRequest, { params }: RouteContext) {
  try {
    assertMultiTenantEnabled()
    validateMutationOrigin(req)
    const auth = await requireCongregationAdmin(params.slug)
    const body = await req.json()
    const email = String(body.email ?? "").trim().toLowerCase()
    const role = body.role === "admin" ? "admin" : body.role === "member" ? "member" : null
    const legacyIdentityId = body.legacyIdentityId == null ? null : integer(body.legacyIdentityId)
    if (!/^\S+@\S+\.\S+$/.test(email) || !role || (body.legacyIdentityId != null && !legacyIdentityId)) {
      return NextResponse.json({ error: "A valid email and role are required." }, { status: 400 })
    }
    if (legacyIdentityId) {
      const legacy = await pool.query(
        `SELECT id FROM legacy_identities
         WHERE id = $1 AND congregation_id = $2 AND linked_user_id IS NULL`,
        [legacyIdentityId, auth.congregation.id],
      )
      if (!legacy.rows[0]) return NextResponse.json({ error: "Historical identity not found." }, { status: 404 })
    }
    const issued = await issueInvitation({
      congregationId: auth.congregation.id,
      email,
      role,
      legacyIdentityId,
      createdByUserId: auth.user.id,
    })
    const inviteUrl = new URL(`/join/${issued.token}`, req.nextUrl.origin).toString()
    await auditEvent({ actorUserId: auth.user.id, congregationId: auth.congregation.id,
      action: "invitation.created", targetType: "invitation",
      metadata: { email, role, legacyIdentityId, expiresAt: issued.expiresAt.toISOString() } })
    return NextResponse.json({ token: issued.token, inviteUrl, expiresAt: issued.expiresAt }, { status: 201 })
  } catch (error) {
    return apiError(error)
  }
}

export async function DELETE(req: NextRequest, { params }: RouteContext) {
  try {
    assertMultiTenantEnabled()
    validateMutationOrigin(req)
    const auth = await requireCongregationAdmin(params.slug)
    const id = integer(req.nextUrl.searchParams.get("id"))
    if (!id) return NextResponse.json({ error: "Invalid invitation id." }, { status: 400 })
    const result = await pool.query(
      `UPDATE invitations SET revoked_at = NOW()
       WHERE id = $1 AND congregation_id = $2 AND accepted_at IS NULL AND revoked_at IS NULL
       RETURNING id`,
      [id, auth.congregation.id],
    )
    if (!result.rows[0]) return NextResponse.json({ error: "Invitation not found." }, { status: 404 })
    await auditEvent({ actorUserId: auth.user.id, congregationId: auth.congregation.id,
      action: "invitation.revoked", targetType: "invitation", targetId: String(id) })
    return NextResponse.json({ success: true })
  } catch (error) {
    return apiError(error)
  }
}
