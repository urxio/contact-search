import { NextRequest, NextResponse } from "next/server"
import { auditEvent, requirePlatformAdmin, validateMutationOrigin } from "@/lib/auth"
import { pool } from "@/lib/db"
import { serializeInstruction, validateInstructionText } from "@/lib/congregation-instructions"
import { apiError, assertMultiTenantEnabled, integer } from "../../c/_shared"

// Instructions the platform admin writes for every congregation admin. Only the
// platform admin can change them; admins read them on the Instructions page.
const COLUMNS = `id,title,body,position,revision,created_at,updated_at`
const SELECT = `SELECT ${COLUMNS} FROM platform_admin_instructions ORDER BY position ASC,id ASC`

export async function POST(req: NextRequest) {
  const client = await pool.connect()
  try {
    assertMultiTenantEnabled(); validateMutationOrigin(req)
    const user = await requirePlatformAdmin()
    const body = await req.json()
    const title = validateInstructionText(body?.title, 120)
    const instructionBody = validateInstructionText(body?.body, 750000)
    if (!title || !instructionBody) return NextResponse.json({ error: "Title and instructions are required (120 and 750,000 characters maximum)." }, { status: 400 })
    await client.query("BEGIN")
    // Reserve the first position for the new instruction without a transient unique-position collision.
    await client.query(`UPDATE platform_admin_instructions SET position=position+1000000`)
    await client.query(`UPDATE platform_admin_instructions SET position=position-999999`)
    const result = await client.query(`INSERT INTO platform_admin_instructions(title,body,position,created_by_user_id)
      VALUES($1,$2,0,$3) RETURNING ${COLUMNS}`, [title, instructionBody, user.id])
    const instruction = serializeInstruction(result.rows[0])
    await client.query("COMMIT")
    await auditEvent({ actorUserId: user.id, action: "platform_admin_instruction.created", targetType: "platform_admin_instruction", targetId: String(instruction.id) })
    return NextResponse.json({ instruction }, { status: 201 })
  } catch (error) { await client.query("ROLLBACK").catch(() => undefined); return apiError(error) } finally { client.release() }
}

export async function PATCH(req: NextRequest) {
  const client = await pool.connect()
  try {
    assertMultiTenantEnabled(); validateMutationOrigin(req)
    const user = await requirePlatformAdmin()
    const body = await req.json()
    await client.query("BEGIN")
    if (Array.isArray(body?.order)) {
      const order: Array<number | null> = body.order.map(integer)
      if (order.length === 0 || order.some((id) => !id) || new Set(order).size !== order.length) {
        await client.query("ROLLBACK"); return NextResponse.json({ error: "A complete, unique instruction order is required." }, { status: 400 })
      }
      const existing = await client.query(`SELECT id FROM platform_admin_instructions ORDER BY position,id FOR UPDATE`)
      const existingIds = new Set(existing.rows.map((row) => Number(row.id)))
      if (existing.rows.length !== order.length || order.some((id) => !id || !existingIds.has(id))) {
        await client.query("ROLLBACK"); return NextResponse.json({ error: "Instruction order is out of date." }, { status: 409 })
      }
      // Avoid a transient unique-position collision while swapping cards.
      await client.query(`UPDATE platform_admin_instructions SET position=position+$1`, [order.length])
      for (const [position, id] of order.entries()) await client.query(`UPDATE platform_admin_instructions SET position=$1 WHERE id=$2`, [position, id])
      await auditEvent({ actorUserId: user.id, action: "platform_admin_instruction.reordered", targetType: "platform_admin_instruction" })
      const result = await client.query(SELECT); await client.query("COMMIT")
      return NextResponse.json({ instructions: result.rows.map(serializeInstruction) })
    }
    const id = integer(body?.id)
    const title = validateInstructionText(body?.title, 120)
    const instructionBody = validateInstructionText(body?.body, 750000)
    if (!id || !title || !instructionBody) { await client.query("ROLLBACK"); return NextResponse.json({ error: "Instruction ID, title, and instructions are required." }, { status: 400 }) }
    const result = await client.query(`UPDATE platform_admin_instructions SET title=$1,body=$2,revision=revision+1,updated_at=NOW()
      WHERE id=$3 RETURNING ${COLUMNS}`, [title, instructionBody, id])
    if (!result.rowCount) { await client.query("ROLLBACK"); return NextResponse.json({ error: "Instruction not found." }, { status: 404 }) }
    const instruction = serializeInstruction(result.rows[0])
    await auditEvent({ actorUserId: user.id, action: "platform_admin_instruction.updated", targetType: "platform_admin_instruction", targetId: String(id) })
    await client.query("COMMIT")
    return NextResponse.json({ instruction })
  } catch (error) { await client.query("ROLLBACK").catch(() => undefined); return apiError(error) } finally { client.release() }
}

export async function DELETE(req: NextRequest) {
  const client = await pool.connect()
  try {
    assertMultiTenantEnabled(); validateMutationOrigin(req)
    const user = await requirePlatformAdmin()
    const id = integer(req.nextUrl.searchParams.get("id"))
    if (!id) return NextResponse.json({ error: "Instruction not found." }, { status: 404 })
    await client.query("BEGIN")
    const result = await client.query(`DELETE FROM platform_admin_instructions WHERE id=$1 RETURNING position`, [id])
    if (!result.rowCount) { await client.query("ROLLBACK"); return NextResponse.json({ error: "Instruction not found." }, { status: 404 }) }
    const deletedPosition = Number(result.rows[0].position)
    await client.query(`UPDATE platform_admin_instructions SET position=position+$1 WHERE position>$2`, [1000000, deletedPosition])
    await client.query(`UPDATE platform_admin_instructions SET position=position-$1-1 WHERE position>$2`, [1000000, deletedPosition])
    await auditEvent({ actorUserId: user.id, action: "platform_admin_instruction.deleted", targetType: "platform_admin_instruction", targetId: String(id) })
    await client.query("COMMIT")
    return NextResponse.json({ success: true })
  } catch (error) { await client.query("ROLLBACK").catch(() => undefined); return apiError(error) } finally { client.release() }
}
