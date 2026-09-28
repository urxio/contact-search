import { NextRequest, NextResponse } from "next/server"
import { pool } from "@/lib/db"
import { auditEvent, issueInvitation, requireCongregationAdmin, validateMutationOrigin } from "@/lib/auth"
import { apiError, assertMultiTenantEnabled, integer } from "../../../../_shared"

type RefreshContext = { params: { slug: string; id: string } }

export async function POST(req: NextRequest, { params }: RefreshContext) {
  try {
    assertMultiTenantEnabled()
    validateMutationOrigin(req)
    const auth = await requireCongregationAdmin(params.slug)
    const id = integer(params.id)
    if (!id) return NextResponse.json({ error: "Invalid invitation id." }, { status: 400 })

    const result = await pool.query(
      `SELECT email, role, legacy_identity_id AS "legacyIdentityId"
       FROM invitations
       WHERE id = $1 AND congregation_id = $2 AND accepted_at IS NULL
         AND revoked_at IS NULL AND expires_at <= NOW()`,
      [id, auth.congregation.id],
    )
    const invitation = result.rows[0]
    if (!invitation) return NextResponse.json({ error: "Expired invitation not found." }, { status: 404 })

    const issued = await issueInvitation({
      congregationId: auth.congregation.id,
      email: invitation.email,
      role: invitation.role,
      legacyIdentityId: invitation.legacyIdentityId,
      createdByUserId: auth.user.id,
    })
    await auditEvent({ actorUserId: auth.user.id, congregationId: auth.congregation.id,
      action: "invitation.refreshed", targetType: "invitation", targetId: String(id),
      metadata: { email: invitation.email, expiresAt: issued.expiresAt.toISOString() } })
    return NextResponse.json({
      inviteUrl: new URL(`/join/${issued.token}`, req.nextUrl.origin).toString(),
      expiresAt: issued.expiresAt,
    }, { status: 201 })
  } catch (error) {
    return apiError(error)
  }
}
