import { NextRequest, NextResponse } from "next/server"

import { auditEvent, requireCongregationAdmin, validateMutationOrigin } from "@/lib/auth"
import { pool } from "@/lib/db"
import { orderedTeamAreas, UNASSIGNED_TEAM_AREA } from "@/lib/team-areas"
import { apiError, assertMultiTenantEnabled, RouteContext } from "../../../_shared"

export async function POST(req: NextRequest, { params }: RouteContext) {
  try {
    assertMultiTenantEnabled()
    validateMutationOrigin(req)
    const auth = await requireCongregationAdmin(params.slug)
    const name = String((await req.json())?.name ?? "").trim()
    if (!name || name.length > 100 || name.toLocaleLowerCase() === UNASSIGNED_TEAM_AREA.toLocaleLowerCase()) {
      return NextResponse.json({ error: "Enter an area name up to 100 characters. Unassigned is reserved." }, { status: 400 })
    }

    const client = await pool.connect()
    let areas: string[]
    try {
      await client.query("BEGIN")
      const congregation = await client.query(`SELECT settings FROM congregations WHERE id = $1 FOR UPDATE`, [auth.congregation.id])
      const settings = congregation.rows[0]?.settings ?? {}
      const existing = await client.query(`SELECT DISTINCT territory FROM zt_zipcodes WHERE congregation_id = $1`, [auth.congregation.id])
      const currentAreas = existing.rows.map((row) => String(row.territory ?? "").trim()).filter(Boolean)
      const ordered = orderedTeamAreas(currentAreas, settings.teamProgressAreaOrder)
      if (ordered.some((area) => area.toLocaleLowerCase() === name.toLocaleLowerCase())) {
        await client.query("ROLLBACK")
        return NextResponse.json({ error: "An area with that name already exists." }, { status: 409 })
      }
      areas = orderedTeamAreas([...ordered, name], [...ordered, name])
      await client.query(
        `UPDATE congregations SET settings = settings || $2::jsonb, updated_at = NOW() WHERE id = $1`,
        [auth.congregation.id, JSON.stringify({ teamProgressAreaOrder: areas })],
      )
      await client.query("COMMIT")
    } catch (error) {
      await client.query("ROLLBACK")
      throw error
    } finally {
      client.release()
    }
    await auditEvent({ actorUserId: auth.user.id, congregationId: auth.congregation.id,
      action: "team.area.created", targetType: "area", targetId: name, metadata: { area: name } })
    return NextResponse.json({ success: true, areas }, { status: 201 })
  } catch (error) {
    return apiError(error)
  }
}
