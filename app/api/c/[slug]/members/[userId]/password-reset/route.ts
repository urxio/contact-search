import { NextRequest, NextResponse } from "next/server"
import { pool } from "@/lib/db"
import { issuePasswordReset, requireCongregationAdmin, validateMutationOrigin } from "@/lib/auth"
import { apiError, assertMultiTenantEnabled, integer } from "../../../../_shared"

type Context = { params: { slug: string; userId: string } }

export async function POST(req: NextRequest, { params }: Context) {
  try {
    assertMultiTenantEnabled()
    validateMutationOrigin(req)
    const auth = await requireCongregationAdmin(params.slug)
    const userId = integer(params.userId)
    if (!userId) return NextResponse.json({ error: "Member not found." }, { status: 404 })
    const membership = await pool.query(
      `SELECT 1 FROM congregation_memberships
       WHERE congregation_id = $1 AND user_id = $2 AND status = 'active'`,
      [auth.congregation.id, userId],
    )
    if (!membership.rows[0]) return NextResponse.json({ error: "Member not found." }, { status: 404 })
    const issued = await issuePasswordReset({ userId, createdByUserId: auth.user.id })
    return NextResponse.json({ token: issued.token,
      resetUrl: new URL(`/auth/reset/${issued.token}`, req.nextUrl.origin).toString(), expiresAt: issued.expiresAt },
      { status: 201 })
  } catch (error) { return apiError(error) }
}
