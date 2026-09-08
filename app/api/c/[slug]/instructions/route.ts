import { NextRequest, NextResponse } from "next/server"
import { pool } from "@/lib/db"
import { auditEvent, requireCongregationAdmin, requireMembership, validateMutationOrigin } from "@/lib/auth"
import { serializeInstruction, validateInstructionText } from "@/lib/congregation-instructions"
import { apiError, assertMultiTenantEnabled, integer, RouteContext } from "../../_shared"

const SELECT = `SELECT id,title,body,position,revision,created_at,updated_at
  FROM congregation_instructions WHERE congregation_id=$1 ORDER BY position ASC,id ASC`

export async function GET(_req: NextRequest, { params }: RouteContext) {
  try {
    assertMultiTenantEnabled()
    const auth = await requireMembership(params.slug)
    const notificationsOnly = _req.nextUrl.searchParams.get("notifications") === "unviewed"
    const result = await pool.query(notificationsOnly
      ? `SELECT ci.id,ci.title,ci.body,ci.position,ci.revision,ci.created_at,ci.updated_at
          FROM congregation_instructions ci
          WHERE ci.congregation_id=$1 AND NOT EXISTS (
            SELECT 1 FROM congregation_instruction_views civ
            WHERE civ.congregation_id=ci.congregation_id AND civ.user_id=$2
              AND civ.instruction_id=ci.id AND civ.instruction_revision=ci.revision
          ) ORDER BY ci.position ASC,ci.id ASC`
      : SELECT,
    notificationsOnly ? [auth.congregation.id, auth.user.id] : [auth.congregation.id])
    return NextResponse.json({ instructions: result.rows.map(serializeInstruction) })
  } catch (error) { return apiError(error) }
}

export async function POST(req: NextRequest, { params }: RouteContext) {
  const client = await pool.connect()
  try {
    assertMultiTenantEnabled(); validateMutationOrigin(req)
    const auth = await requireCongregationAdmin(params.slug)
    const body = await req.json()
    const title = validateInstructionText(body?.title, 120)
    const instructionBody = validateInstructionText(body?.body, 750000)
    if (!title || !instructionBody) return NextResponse.json({ error: "Title and instructions are required (120 and 750,000 characters maximum)." }, { status: 400 })
    await client.query("BEGIN")
    // Reserve the first position for the new instruction without a transient unique-position collision.
    await client.query(`UPDATE congregation_instructions SET position=position+1000000 WHERE congregation_id=$1`, [auth.congregation.id])
    await client.query(`UPDATE congregation_instructions SET position=position-999999 WHERE congregation_id=$1`, [auth.congregation.id])
    const result = await client.query(`INSERT INTO congregation_instructions(congregation_id,title,body,position,created_by_user_id)
      VALUES($1,$2,$3,0,$4)
      RETURNING id,title,body,position,revision,created_at,updated_at`, [auth.congregation.id, title, instructionBody, auth.user.id])
    const instruction = serializeInstruction(result.rows[0])
    await client.query("COMMIT")
    await auditEvent({ actorUserId: auth.user.id, congregationId: auth.congregation.id, action: "congregation_instruction.created", targetType: "congregation_instruction", targetId: String(instruction.id) })
    return NextResponse.json({ instruction }, { status: 201 })
  } catch (error) { await client.query("ROLLBACK").catch(() => undefined); return apiError(error) } finally { client.release() }
}

export async function PATCH(req: NextRequest, { params }: RouteContext) {
  const client = await pool.connect()
  try {
    assertMultiTenantEnabled(); validateMutationOrigin(req)
    const auth = await requireCongregationAdmin(params.slug)
    const body = await req.json()
    await client.query("BEGIN")
    if (Array.isArray(body?.order)) {
      const order = body.order.map(integer)
      if (order.length === 0 || order.some((id: number | null) => !id) || new Set(order).size !== order.length) {
        await client.query("ROLLBACK"); return NextResponse.json({ error: "A complete, unique instruction order is required." }, { status: 400 })
      }
      const existing = await client.query(`SELECT id FROM congregation_instructions WHERE congregation_id=$1 ORDER BY position,id FOR UPDATE`, [auth.congregation.id])
      if (existing.rows.length !== order.length || existing.rows.some((row, index) => Number(row.id) !== order[index])) {
        await client.query("ROLLBACK"); return NextResponse.json({ error: "Instruction order is out of date." }, { status: 409 })
      }
      // Avoid a transient unique-position collision while swapping cards.
      await client.query(`UPDATE congregation_instructions SET position=position+$2 WHERE congregation_id=$1`, [auth.congregation.id, order.length])
      for (const [position, id] of order.entries()) await client.query(`UPDATE congregation_instructions SET position=$1 WHERE id=$2 AND congregation_id=$3`, [position, id, auth.congregation.id])
      await auditEvent({ actorUserId: auth.user.id, congregationId: auth.congregation.id, action: "congregation_instruction.reordered", targetType: "congregation" })
      const result = await client.query(SELECT, [auth.congregation.id]); await client.query("COMMIT")
      return NextResponse.json({ instructions: result.rows.map(serializeInstruction) })
    }
    const id = integer(body?.id)
    const title = validateInstructionText(body?.title, 120)
    const instructionBody = validateInstructionText(body?.body, 750000)
    if (!id || !title || !instructionBody) { await client.query("ROLLBACK"); return NextResponse.json({ error: "Instruction ID, title, and instructions are required." }, { status: 400 }) }
    const result = await client.query(`UPDATE congregation_instructions SET title=$1,body=$2,revision=revision+1,updated_at=NOW()
      WHERE id=$3 AND congregation_id=$4 RETURNING id,title,body,position,revision,created_at,updated_at`, [title, instructionBody, id, auth.congregation.id])
    if (!result.rowCount) { await client.query("ROLLBACK"); return NextResponse.json({ error: "Instruction not found." }, { status: 404 }) }
    const instruction = serializeInstruction(result.rows[0])
    await auditEvent({ actorUserId: auth.user.id, congregationId: auth.congregation.id, action: "congregation_instruction.updated", targetType: "congregation_instruction", targetId: String(id) })
    await client.query("COMMIT")
    return NextResponse.json({ instruction })
  } catch (error) { await client.query("ROLLBACK").catch(() => undefined); return apiError(error) } finally { client.release() }
}

export async function DELETE(req: NextRequest, { params }: RouteContext) {
  const client = await pool.connect()
  try {
    assertMultiTenantEnabled(); validateMutationOrigin(req)
    const auth = await requireCongregationAdmin(params.slug)
    const id = integer(req.nextUrl.searchParams.get("id"))
    if (!id) return NextResponse.json({ error: "Instruction not found." }, { status: 404 })
    await client.query("BEGIN")
    const result = await client.query(`DELETE FROM congregation_instructions WHERE id=$1 AND congregation_id=$2 RETURNING position`, [id, auth.congregation.id])
    if (!result.rowCount) { await client.query("ROLLBACK"); return NextResponse.json({ error: "Instruction not found." }, { status: 404 }) }
    const deletedPosition = Number(result.rows[0].position)
    await client.query(`UPDATE congregation_instructions SET position=position+$2 WHERE congregation_id=$1 AND position>$3`, [auth.congregation.id, 1000000, deletedPosition])
    await client.query(`UPDATE congregation_instructions SET position=position-$2-1 WHERE congregation_id=$1 AND position>$3`, [auth.congregation.id, 1000000, deletedPosition])
    await auditEvent({ actorUserId: auth.user.id, congregationId: auth.congregation.id, action: "congregation_instruction.deleted", targetType: "congregation_instruction", targetId: String(id) })
    await client.query("COMMIT")
    return NextResponse.json({ success: true })
  } catch (error) { await client.query("ROLLBACK").catch(() => undefined); return apiError(error) } finally { client.release() }
}
