import { NextRequest, NextResponse } from "next/server"
import { pool } from "@/lib/db"
import { requireMembership, validateMutationOrigin } from "@/lib/auth"
import { apiError, assertMultiTenantEnabled, canManageAll, integer, RouteContext } from "../../../_shared"

export async function POST(req: NextRequest, { params }: RouteContext) {
  try {
    assertMultiTenantEnabled(); validateMutationOrigin(req)
    const auth = await requireMembership(params.slug)
    if (!canManageAll(auth)) return NextResponse.json({ error: "Not found" }, { status: 404 })
    const body = await req.json()
    const instructionId = integer(body?.instructionId)
    const revision = Number(body?.revision)
    if (!instructionId || !Number.isSafeInteger(revision) || revision < 1) return NextResponse.json({ error: "Instruction and revision are required." }, { status: 400 })
    const instruction = await pool.query(`SELECT id FROM platform_admin_instructions WHERE id=$1 AND revision=$2`, [instructionId, revision])
    if (!instruction.rowCount) return NextResponse.json({ error: "Instruction not found." }, { status: 404 })
    await pool.query(`INSERT INTO platform_admin_instruction_views(user_id,instruction_id,instruction_revision)
      VALUES($1,$2,$3) ON CONFLICT(user_id,instruction_id,instruction_revision) DO NOTHING`, [auth.user.id, instructionId, revision])
    return NextResponse.json({ success: true })
  } catch (error) { return apiError(error) }
}
