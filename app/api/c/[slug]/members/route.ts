import { NextRequest, NextResponse } from "next/server"
import { pool } from "@/lib/db"
import { auditEvent, requireCongregationAdmin, validateMutationOrigin } from "@/lib/auth"
import { apiError, assertMultiTenantEnabled, integer, RouteContext } from "../../_shared"

export async function GET(_req: NextRequest, { params }: RouteContext) {
  try {
    assertMultiTenantEnabled()
    const auth = await requireCongregationAdmin(params.slug)
    const [members, legacy] = await Promise.all([
      pool.query(
        `SELECT m.id, m.user_id AS "userId", u.email, u.display_name AS "displayName",
                m.display_name AS "congregationDisplayName", m.role, m.status,
                m.created_at AS "createdAt"
         FROM congregation_memberships m JOIN users u ON u.id = m.user_id
         WHERE m.congregation_id = $1 ORDER BY COALESCE(m.display_name, u.display_name)`,
        [auth.congregation.id],
      ),
      pool.query(
        `SELECT id, display_name AS "displayName", normalized_name AS "normalizedName"
         FROM legacy_identities WHERE congregation_id = $1 AND linked_user_id IS NULL
         ORDER BY display_name`,
        [auth.congregation.id],
      ),
    ])
    return NextResponse.json({ members: members.rows, legacyIdentities: legacy.rows })
  } catch (error) {
    return apiError(error)
  }
}

export async function PATCH(req: NextRequest, { params }: RouteContext) {
  try {
    assertMultiTenantEnabled()
    validateMutationOrigin(req)
    const auth = await requireCongregationAdmin(params.slug)
    const body = await req.json()
    const userId = integer(body.userId)
    if (!userId) return NextResponse.json({ error: "Invalid user id." }, { status: 400 })
    const role = body.role === undefined ? null : String(body.role)
    const status = body.status === undefined ? null : String(body.status)
    if (role && !["member", "admin"].includes(role)) return NextResponse.json({ error: "Invalid role." }, { status: 400 })
    if (status && !["active", "inactive"].includes(status)) return NextResponse.json({ error: "Invalid status." }, { status: 400 })
    if (userId === auth.user.id && (role === "member" || status === "inactive")) {
      return NextResponse.json({ error: "You cannot remove your own admin access." }, { status: 400 })
    }
    const displayName = body.congregationDisplayName === undefined ? null : String(body.congregationDisplayName).trim()
    const result = await pool.query(
      `UPDATE congregation_memberships SET
         role = COALESCE($4, role), status = COALESCE($5, status),
         display_name = CASE WHEN $6::boolean THEN NULLIF($3, '') ELSE display_name END,
         updated_at = NOW()
       WHERE congregation_id = $1 AND user_id = $2 RETURNING *`,
      [auth.congregation.id, userId, displayName, role, status, body.congregationDisplayName !== undefined],
    )
    if (!result.rows[0]) return NextResponse.json({ error: "Member not found." }, { status: 404 })
    await auditEvent({ actorUserId: auth.user.id, congregationId: auth.congregation.id,
      action: "membership.updated", targetType: "user", targetId: String(userId),
      metadata: { role, status } })
    return NextResponse.json({ membership: result.rows[0] })
  } catch (error) {
    return apiError(error)
  }
}

export async function DELETE(req: NextRequest, { params }: RouteContext) {
  try {
    assertMultiTenantEnabled()
    validateMutationOrigin(req)
    const auth = await requireCongregationAdmin(params.slug)
    const userId = integer(req.nextUrl.searchParams.get("userId"))
    if (!userId) return NextResponse.json({ error: "Invalid user id." }, { status: 400 })
    if (userId === auth.user.id) return NextResponse.json({ error: "You cannot remove yourself." }, { status: 400 })
    const result = await pool.query(
      `UPDATE congregation_memberships SET status = 'inactive', updated_at = NOW()
       WHERE congregation_id = $1 AND user_id = $2 AND status <> 'inactive' RETURNING id`,
      [auth.congregation.id, userId],
    )
    if (!result.rows[0]) return NextResponse.json({ error: "Member not found." }, { status: 404 })
    await auditEvent({ actorUserId: auth.user.id, congregationId: auth.congregation.id,
      action: "membership.removed", targetType: "user", targetId: String(userId) })
    return NextResponse.json({ success: true })
  } catch (error) {
    return apiError(error)
  }
}
