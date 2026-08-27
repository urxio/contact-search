import { NextRequest, NextResponse } from "next/server"
import type { PoolClient } from "pg"

import { auditEvent, requireCongregationAdmin, validateMutationOrigin } from "@/lib/auth"
import { pool } from "@/lib/db"
import { orderedTeamAreas, UNASSIGNED_TEAM_AREA } from "@/lib/team-areas"
import { AREA_COLOR_VALUES, isAreaCardHexColor } from "@/lib/area-colors"
import { apiError, assertMultiTenantEnabled, RouteContext } from "../../../_shared"

async function loadLockedAreas(client: PoolClient, congregationId: number) {
  const congregation = await client.query(`SELECT settings FROM congregations WHERE id = $1 FOR UPDATE`, [congregationId])
  const areasResult = await client.query(`SELECT DISTINCT territory FROM zt_zipcodes WHERE congregation_id = $1`, [congregationId])
  const settings = congregation.rows[0]?.settings ?? {}
  const areas = areasResult.rows.map((row) => String(row.territory ?? "").trim()).filter(Boolean)
  return { settings, areas, ordered: orderedTeamAreas(areas, settings.teamProgressAreaOrder) }
}

async function saveAreaOrder(client: PoolClient, congregationId: number, areas: string[]) {
  await client.query(
    `UPDATE congregations SET settings = settings || $2::jsonb, updated_at = NOW() WHERE id = $1`,
    [congregationId, JSON.stringify({ teamProgressAreaOrder: areas })],
  )
}

function areaColors(settings: Record<string, unknown>) {
  const colors = settings.teamProgressAreaColors
  if (!colors || typeof colors !== "object" || Array.isArray(colors)) return {} as Record<string, string>
  return Object.fromEntries(Object.entries(colors).filter(([, color]) => typeof color === "string")) as Record<string, string>
}

async function saveAreaColors(client: PoolClient, congregationId: number, colors: Record<string, string>) {
  await client.query(
    `UPDATE congregations SET settings = settings || $2::jsonb, updated_at = NOW() WHERE id = $1`,
    [congregationId, JSON.stringify({ teamProgressAreaColors: colors })],
  )
}

function findArea(areas: string[], requested: string) {
  const key = requested.toLocaleLowerCase()
  return areas.find((area) => area.toLocaleLowerCase() === key)
}

export async function PATCH(req: NextRequest, { params }: RouteContext) {
  try {
    assertMultiTenantEnabled()
    validateMutationOrigin(req)
    const auth = await requireCongregationAdmin(params.slug)
    const body = await req.json()
    const action = String(body?.action ?? "")
    const client = await pool.connect()
    let responseBody: { success: true; areas: string[]; count?: number; areaColors?: Record<string, string> }
    let auditDetails: { action: string; targetId?: string; metadata: Record<string, unknown> }
    try {
      await client.query("BEGIN")
      const state = await loadLockedAreas(client, auth.congregation.id)

      if (action === "rename") {
        const requestedArea = String(body?.area ?? "").trim()
        const name = String(body?.name ?? "").trim()
        const area = findArea(state.areas, requestedArea)
        if (!area) {
          await client.query("ROLLBACK")
          return NextResponse.json({ error: "Area not found." }, { status: 404 })
        }
        if (area.toLocaleLowerCase() === UNASSIGNED_TEAM_AREA.toLocaleLowerCase()) {
          await client.query("ROLLBACK")
          return NextResponse.json({ error: "Unassigned cannot be renamed." }, { status: 400 })
        }
        if (!name || name.length > 100 || name.toLocaleLowerCase() === UNASSIGNED_TEAM_AREA.toLocaleLowerCase()) {
          await client.query("ROLLBACK")
          return NextResponse.json({ error: "Enter an area name up to 100 characters. Unassigned is reserved." }, { status: 400 })
        }
        const conflict = state.areas.find((value) => value !== area && value.toLocaleLowerCase() === name.toLocaleLowerCase())
        if (conflict) {
          await client.query("ROLLBACK")
          return NextResponse.json({ error: "An area with that name already exists." }, { status: 409 })
        }

        const updated = await client.query(
          `UPDATE zt_zipcodes SET territory = $3 WHERE congregation_id = $1 AND territory = $2`,
          [auth.congregation.id, area, name],
        )
        const nextAreas = state.areas.map((value) => value === area ? name : value)
        const preferred = state.ordered.map((value) => value === area ? name : value)
        const ordered = orderedTeamAreas(nextAreas, preferred)
        await saveAreaOrder(client, auth.congregation.id, ordered)
        const colors = areaColors(state.settings)
        const colorKey = Object.keys(colors).find((key) => key.toLocaleLowerCase() === area.toLocaleLowerCase())
        if (colorKey) {
          colors[name] = colors[colorKey]
          delete colors[colorKey]
          await saveAreaColors(client, auth.congregation.id, colors)
        }
        responseBody = { success: true, areas: ordered, count: updated.rowCount ?? 0, areaColors: colors }
        auditDetails = { action: "team.area.renamed", targetId: area,
          metadata: { from: area, to: name, zipcodeCount: updated.rowCount ?? 0 } }
      } else if (action === "reorder") {
        const requested = Array.isArray(body?.areas)
          ? body.areas.map((value: unknown) => String(value ?? "").trim()).filter(Boolean)
          : []
        const currentKeys = new Set(state.areas.map((area) => area.toLocaleLowerCase()))
        const requestedKeys = requested.map((area: string) => area.toLocaleLowerCase())
        if (requestedKeys.length !== currentKeys.size || new Set(requestedKeys).size !== currentKeys.size
          || requestedKeys.some((key: string) => !currentKeys.has(key))) {
          await client.query("ROLLBACK")
          return NextResponse.json({ error: "Area list changed. Reload settings and try again." }, { status: 409 })
        }
        const ordered = orderedTeamAreas(state.areas, requested)
        await saveAreaOrder(client, auth.congregation.id, ordered)
        responseBody = { success: true, areas: ordered }
        auditDetails = { action: "team.areas.reordered", metadata: { areas: ordered } }
      } else if (action === "set-color") {
        const requestedArea = String(body?.area ?? "").trim()
        const color = String(body?.color ?? "").trim()
        const area = findArea(state.areas, requestedArea)
        if (!area) {
          await client.query("ROLLBACK")
          return NextResponse.json({ error: "Area not found." }, { status: 404 })
        }
        if (area.toLocaleLowerCase() === UNASSIGNED_TEAM_AREA.toLocaleLowerCase()) {
          await client.query("ROLLBACK")
          return NextResponse.json({ error: "Unassigned has no area color." }, { status: 400 })
        }
        if (color !== "auto" && !AREA_COLOR_VALUES.includes(color as typeof AREA_COLOR_VALUES[number]) && !isAreaCardHexColor(color)) {
          await client.query("ROLLBACK")
          return NextResponse.json({ error: "Choose a valid area color." }, { status: 400 })
        }
        const colors = areaColors(state.settings)
        const existingKey = Object.keys(colors).find((key) => key.toLocaleLowerCase() === area.toLocaleLowerCase())
        if (existingKey) delete colors[existingKey]
        if (color !== "auto") colors[area] = color
        await saveAreaColors(client, auth.congregation.id, colors)
        responseBody = { success: true, areas: state.ordered, areaColors: colors }
        auditDetails = { action: "team.area.color_updated", targetId: area, metadata: { area, color } }
      } else {
        await client.query("ROLLBACK")
        return NextResponse.json({ error: "Choose rename, reorder, or set-color." }, { status: 400 })
      }
      await client.query("COMMIT")
    } catch (error) {
      await client.query("ROLLBACK")
      throw error
    } finally {
      client.release()
    }
    await auditEvent({ actorUserId: auth.user.id, congregationId: auth.congregation.id,
      action: auditDetails.action, targetType: "area", targetId: auditDetails.targetId, metadata: auditDetails.metadata })
    return NextResponse.json(responseBody)
  } catch (error) {
    return apiError(error)
  }
}

export async function DELETE(req: NextRequest, { params }: RouteContext) {
  try {
    assertMultiTenantEnabled()
    validateMutationOrigin(req)
    const auth = await requireCongregationAdmin(params.slug)
    const requestedArea = String(req.nextUrl.searchParams.get("area") ?? "").trim()
    const client = await pool.connect()
    let responseBody: { success: true; areas: string[]; count: number }
    let auditDetails: { targetId: string; metadata: Record<string, unknown> }
    try {
      await client.query("BEGIN")
      const state = await loadLockedAreas(client, auth.congregation.id)
      const area = findArea(state.areas, requestedArea)
      if (!area) {
        await client.query("ROLLBACK")
        return NextResponse.json({ error: "Area not found." }, { status: 404 })
      }
      if (area.toLocaleLowerCase() === UNASSIGNED_TEAM_AREA.toLocaleLowerCase()) {
        await client.query("ROLLBACK")
        return NextResponse.json({ error: "Unassigned cannot be deleted." }, { status: 400 })
      }
      const updated = await client.query(
        `UPDATE zt_zipcodes SET territory = $3 WHERE congregation_id = $1 AND territory = $2`,
        [auth.congregation.id, area, UNASSIGNED_TEAM_AREA],
      )
      const nextAreas = state.areas.filter((value) => value !== area)
      if (!nextAreas.some((value) => value.toLocaleLowerCase() === UNASSIGNED_TEAM_AREA.toLocaleLowerCase())) {
        nextAreas.push(UNASSIGNED_TEAM_AREA)
      }
      const ordered = orderedTeamAreas(nextAreas, state.ordered.filter((value) => value !== area))
      await saveAreaOrder(client, auth.congregation.id, ordered)
      const colors = areaColors(state.settings)
      const colorKey = Object.keys(colors).find((key) => key.toLocaleLowerCase() === area.toLocaleLowerCase())
      if (colorKey) {
        delete colors[colorKey]
        await saveAreaColors(client, auth.congregation.id, colors)
      }
      await client.query("COMMIT")
      responseBody = { success: true, areas: ordered, count: updated.rowCount ?? 0 }
      auditDetails = { targetId: area,
        metadata: { area, movedTo: UNASSIGNED_TEAM_AREA, zipcodeCount: updated.rowCount ?? 0 } }
    } catch (error) {
      await client.query("ROLLBACK")
      throw error
    } finally {
      client.release()
    }
    await auditEvent({ actorUserId: auth.user.id, congregationId: auth.congregation.id,
      action: "team.area.deleted", targetType: "area", targetId: auditDetails.targetId, metadata: auditDetails.metadata })
    return NextResponse.json(responseBody)
  } catch (error) {
    return apiError(error)
  }
}
