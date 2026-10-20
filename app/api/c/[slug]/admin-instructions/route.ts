import { NextRequest, NextResponse } from "next/server"
import { pool } from "@/lib/db"
import { requireMembership } from "@/lib/auth"
import { serializeInstruction } from "@/lib/congregation-instructions"
import { apiError, assertMultiTenantEnabled, canManageAll, RouteContext } from "../../_shared"

// Platform-written admin instructions this admin has not seen in their latest revision.
export async function GET(_req: NextRequest, { params }: RouteContext) {
  try {
    assertMultiTenantEnabled()
    const auth = await requireMembership(params.slug)
    if (!canManageAll(auth)) return NextResponse.json({ error: "Not found" }, { status: 404 })
    const result = await pool.query(`SELECT pai.id,pai.title,pai.body,pai.position,pai.revision,pai.created_at,pai.updated_at
      FROM platform_admin_instructions pai
      WHERE NOT EXISTS (
        SELECT 1 FROM platform_admin_instruction_views v
        WHERE v.user_id=$1 AND v.instruction_id=pai.id AND v.instruction_revision=pai.revision
      ) ORDER BY pai.position ASC,pai.id ASC`, [auth.user.id])
    return NextResponse.json({ instructions: result.rows.map(serializeInstruction) })
  } catch (error) { return apiError(error) }
}
