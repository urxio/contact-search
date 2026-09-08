import { NextRequest, NextResponse } from "next/server"
import { pool } from "@/lib/db"
import { requireMembership, validateMutationOrigin } from "@/lib/auth"
import { apiError, assertMultiTenantEnabled, integer, RouteContext } from "../../../_shared"

export async function POST(req: NextRequest, { params }: RouteContext) {
  try {
    assertMultiTenantEnabled(); validateMutationOrigin(req)
    const auth = await requireMembership(params.slug)
    const body = await req.json()
    const instructionId = integer(body?.instructionId)
    const revision = Number(body?.revision)
    if (!instructionId || !Number.isSafeInteger(revision) || revision < 1) return NextResponse.json({ error: "Instruction and revision are required." }, { status: 400 })
    const instruction = await pool.query(`SELECT id FROM congregation_instructions WHERE id=$1 AND congregation_id=$2 AND revision=$3`, [instructionId, auth.congregation.id, revision])
    if (!instruction.rowCount) return NextResponse.json({ error: "Instruction not found." }, { status: 404 })
    await pool.query(`INSERT INTO congregation_instruction_views(user_id,congregation_id,instruction_id,instruction_revision)
      VALUES($1,$2,$3,$4) ON CONFLICT(user_id,instruction_id,instruction_revision) DO NOTHING`, [auth.user.id, auth.congregation.id, instructionId, revision])
    return NextResponse.json({ success: true })
  } catch (error) { return apiError(error) }
}
