import { NextRequest, NextResponse } from "next/server"
import { pool } from "@/lib/db"
import { auditEvent, requireCongregationAdmin, requireMembership, validateMutationOrigin } from "@/lib/auth"
import { apiError, assertMultiTenantEnabled, integer, RouteContext } from "../../../_shared"

export async function GET(_req: NextRequest, { params }: RouteContext) {
  try {
    assertMultiTenantEnabled()
    const auth = await requireMembership(params.slug)
    const result = await pool.query(
      `SELECT z.id, z.city, z.zipcode, z.total_pages, z.territory,
        COUNT(s.id)::int AS segment_count,
        COALESCE(COUNT(s.id) FILTER (WHERE s.status = 'Completed'), 0)::int AS completed,
        COALESCE(COUNT(s.id) FILTER (WHERE s.status = 'In progress'), 0)::int AS in_progress,
        COALESCE(COUNT(s.id) FILTER (WHERE s.status = 'Not started'), 0)::int AS not_started
       FROM zt_zipcodes z
       LEFT JOIN zt_segments s
         ON s.zipcode_id = z.id AND s.congregation_id = z.congregation_id
       WHERE z.congregation_id = $1
       GROUP BY z.id
       ORDER BY z.territory, z.city, z.zipcode`,
      [auth.congregation.id],
    )
    return NextResponse.json(result.rows)
  } catch (error) {
    return apiError(error)
  }
}

export async function POST(req: NextRequest, { params }: RouteContext) {
  try {
    assertMultiTenantEnabled()
    validateMutationOrigin(req)
    const auth = await requireCongregationAdmin(params.slug)
    const body = await req.json()
    const city = String(body.city ?? "").trim()
    const zipcode = String(body.zipcode ?? "").trim()
    const territory = String(body.territory ?? "").trim()
    const totalPages = Number.parseInt(String(body.total_pages ?? ""), 10)
    if (!city || !/^\d{5}$/.test(zipcode) || !territory || !Number.isSafeInteger(totalPages) || totalPages < 1) {
      return NextResponse.json({ error: "City, a five-digit zipcode, territory, and total pages are required." }, { status: 400 })
    }
    const result = await pool.query(
      `INSERT INTO zt_zipcodes (congregation_id, city, zipcode, total_pages, territory)
       VALUES ($1,$2,$3,$4,$5)
       ON CONFLICT (congregation_id, zipcode) DO NOTHING
       RETURNING *`,
      [auth.congregation.id, city, zipcode, totalPages, territory],
    )
    if (!result.rows[0]) return NextResponse.json({ error: "Zipcode already exists." }, { status: 409 })
    await auditEvent({
      actorUserId: auth.user.id,
      congregationId: auth.congregation.id,
      action: "team.zipcode.created",
      targetType: "zipcode",
      targetId: String(result.rows[0].id),
    })
    return NextResponse.json(result.rows[0], { status: 201 })
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
    const id = integer(body.id)
    const city = String(body.city ?? "").trim()
    const zipcode = String(body.zipcode ?? "").trim()
    const territory = String(body.territory ?? "").trim()
    const totalPages = integer(body.total_pages)
    if (!id || !city || !/^\d{5}$/.test(zipcode) || !territory || !totalPages) {
      return NextResponse.json({ error: "Valid territory details are required." }, { status: 400 })
    }
    try {
      const result = await pool.query(
        `UPDATE zt_zipcodes SET city = $3, zipcode = $4, territory = $5, total_pages = $6
         WHERE id = $1 AND congregation_id = $2 RETURNING *`,
        [id, auth.congregation.id, city, zipcode, territory, totalPages],
      )
      if (!result.rows[0]) return NextResponse.json({ error: "Zipcode not found." }, { status: 404 })
      await auditEvent({ actorUserId: auth.user.id, congregationId: auth.congregation.id,
        action: "team.zipcode.updated", targetType: "zipcode", targetId: String(id) })
      return NextResponse.json(result.rows[0])
    } catch (error: any) {
      if (error?.code === "23505") return NextResponse.json({ error: "Zipcode already exists." }, { status: 409 })
      if (error?.code === "23514") return NextResponse.json({ error: "Total pages cannot be below an existing segment." }, { status: 409 })
      throw error
    }
  } catch (error) { return apiError(error) }
}

export async function DELETE(req: NextRequest, { params }: RouteContext) {
  try {
    assertMultiTenantEnabled()
    validateMutationOrigin(req)
    const auth = await requireCongregationAdmin(params.slug)
    const id = integer(req.nextUrl.searchParams.get("id"))
    if (!id) return NextResponse.json({ error: "Zipcode id is required." }, { status: 400 })
    const result = await pool.query(
      `DELETE FROM zt_zipcodes WHERE id = $1 AND congregation_id = $2 RETURNING id`,
      [id, auth.congregation.id],
    )
    if (!result.rows[0]) return NextResponse.json({ error: "Zipcode not found." }, { status: 404 })
    await auditEvent({ actorUserId: auth.user.id, congregationId: auth.congregation.id,
      action: "team.zipcode.deleted", targetType: "zipcode", targetId: String(id) })
    return NextResponse.json({ success: true })
  } catch (error) { return apiError(error) }
}
