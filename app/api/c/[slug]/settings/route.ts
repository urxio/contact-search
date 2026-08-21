import { NextRequest, NextResponse } from "next/server"
import { pool } from "@/lib/db"
import { auditEvent, requireCongregationAdmin, requireMembership, validateMutationOrigin } from "@/lib/auth"
import { apiError, assertMultiTenantEnabled, RouteContext } from "../../_shared"

export async function GET(_req: NextRequest, { params }: RouteContext) {
  try {
    assertMultiTenantEnabled()
    const auth = await requireMembership(params.slug)
    return NextResponse.json({
      congregation: auth.congregation,
      canManage: auth.user.isPlatformAdmin || auth.membership?.role === "admin",
    })
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
    const name = body.name === undefined ? null : String(body.name).trim()
    const slug = body.slug === undefined ? null : String(body.slug).trim().toLowerCase()
    if (name !== null && (name.length < 2 || name.length > 100)) {
      return NextResponse.json({ error: "Name must be between 2 and 100 characters." }, { status: 400 })
    }
    if (slug !== null && !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) {
      return NextResponse.json({ error: "Slug may contain lowercase letters, numbers, and single hyphens." }, { status: 400 })
    }
    const settingsPatch: Record<string, unknown> = {}
    if (body.searchZipcodes !== undefined) {
      if (!Array.isArray(body.searchZipcodes) || body.searchZipcodes.some((zip: unknown) => !/^\d{5}$/.test(String(zip)))) {
        return NextResponse.json({ error: "Search ZIP codes must be five digits." }, { status: 400 })
      }
      settingsPatch.searchTerritoryZipcodes = Array.from(new Set(body.searchZipcodes.map(String)))
    }
    if (body.teamTerritories !== undefined) {
      if (!Array.isArray(body.teamTerritories)) {
        return NextResponse.json({ error: "Team territories must be a list." }, { status: 400 })
      }
      settingsPatch.teamTerritories = body.teamTerritories
    }
    try {
      const result = await pool.query(
        `UPDATE congregations SET
           name = COALESCE($2, name), slug = COALESCE($3, slug),
           settings = settings || $4::jsonb, updated_at = NOW()
         WHERE id = $1 RETURNING id, name, slug, status, settings`,
        [auth.congregation.id, name, slug, JSON.stringify(settingsPatch)],
      )
      await auditEvent({ actorUserId: auth.user.id, congregationId: auth.congregation.id,
        action: "congregation.settings_updated", targetType: "congregation",
        targetId: String(auth.congregation.id), metadata: { fields: Object.keys(body) } })
      return NextResponse.json({ congregation: result.rows[0] })
    } catch (error: any) {
      if (error?.code === "23505") return NextResponse.json({ error: "That slug is already in use." }, { status: 409 })
      throw error
    }
  } catch (error) {
    return apiError(error)
  }
}
