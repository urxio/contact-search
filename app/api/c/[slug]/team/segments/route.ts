import { NextRequest, NextResponse } from "next/server"
import { pool } from "@/lib/db"
import { auditEvent, requireMembership, validateMutationOrigin } from "@/lib/auth"
import { apiError, assertMultiTenantEnabled, canManageAll, integer, RouteContext } from "../../../_shared"

const VALID_STATUSES = new Set(["Not started", "In progress", "Completed"])

export async function GET(req: NextRequest, { params }: RouteContext) {
  try {
    assertMultiTenantEnabled()
    const auth = await requireMembership(params.slug)
    const zipcode = req.nextUrl.searchParams.get("zipcode")?.trim()
    if (!zipcode) return NextResponse.json({ error: "Zipcode is required." }, { status: 400 })
    const zipResult = await pool.query(
      `SELECT id, city, zipcode, total_pages, territory
       FROM zt_zipcodes WHERE congregation_id = $1 AND zipcode = $2`,
      [auth.congregation.id, zipcode],
    )
    if (!zipResult.rows[0]) return NextResponse.json({ error: "Zipcode not found." }, { status: 404 })
    const segments = await pool.query(
      `SELECT s.id, s.page_start, s.page_end, s.owner, s.owner_user_id,
              s.stopped_at_page, s.status, s.notes, s.updated_at,
              (s.owner_user_id = $3) AS is_mine
       FROM zt_segments s
       WHERE s.congregation_id = $1 AND s.zipcode_id = $2
       ORDER BY s.page_start`,
      [auth.congregation.id, zipResult.rows[0].id, auth.user.id],
    )
    return NextResponse.json({ zipcode: zipResult.rows[0], segments: segments.rows })
  } catch (error) {
    return apiError(error)
  }
}

export async function POST(req: NextRequest, { params }: RouteContext) {
  try {
    assertMultiTenantEnabled()
    validateMutationOrigin(req)
    const auth = await requireMembership(params.slug)
    const body = await req.json()
    const zipcode = String(body.zipcode ?? "").trim()
    const pageStart = integer(body.page_start)
    const pageEnd = body.page_end === null || body.page_end === "" || body.page_end === undefined
      ? null : integer(body.page_end)
    if (!zipcode || !pageStart || (body.page_end != null && body.page_end !== "" && !pageEnd) || (pageEnd && pageEnd < pageStart)) {
      return NextResponse.json({ error: "Enter a valid page range." }, { status: 400 })
    }
    const zipResult = await pool.query(
      `SELECT id, total_pages FROM zt_zipcodes WHERE congregation_id = $1 AND zipcode = $2`,
      [auth.congregation.id, zipcode],
    )
    const zip = zipResult.rows[0]
    if (!zip) return NextResponse.json({ error: "Zipcode not found." }, { status: 404 })
    if (pageStart > zip.total_pages || (pageEnd && pageEnd > zip.total_pages)) {
      return NextResponse.json({ error: "Page range exceeds this territory." }, { status: 400 })
    }
    const owner = auth.membership?.displayName || auth.user.displayName
    const result = await pool.query(
      `INSERT INTO zt_segments
        (congregation_id, zipcode_id, page_start, page_end, owner, owner_user_id)
       VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
      [auth.congregation.id, zip.id, pageStart, pageEnd, owner, auth.user.id],
    )
    return NextResponse.json(result.rows[0], { status: 201 })
  } catch (error) {
    return apiError(error)
  }
}

export async function PATCH(req: NextRequest, { params }: RouteContext) {
  try {
    assertMultiTenantEnabled()
    validateMutationOrigin(req)
    const auth = await requireMembership(params.slug)
    const body = await req.json()
    const id = integer(body.id)
    const pageStart = integer(body.page_start)
    const pageEnd = body.page_end == null || body.page_end === "" ? null : integer(body.page_end)
    const stoppedAt = body.stopped_at_page == null || body.stopped_at_page === "" ? null : integer(body.stopped_at_page)
    const status = String(body.status ?? "")
    if (!id || !pageStart || (body.page_end != null && body.page_end !== "" && !pageEnd) ||
        (pageEnd && pageEnd < pageStart) || !VALID_STATUSES.has(status) ||
        (stoppedAt && (stoppedAt < pageStart || (pageEnd && stoppedAt > pageEnd)))) {
      return NextResponse.json({ error: "Invalid segment update." }, { status: 400 })
    }
    const manageable = canManageAll(auth)
    const result = await pool.query(
      `UPDATE zt_segments s SET
         page_start = $3, page_end = $4, stopped_at_page = $5,
         status = $6, notes = COALESCE($7, notes), updated_at = NOW()
       FROM zt_zipcodes z
       WHERE s.id = $1 AND s.congregation_id = $2
         AND z.id = s.zipcode_id AND z.congregation_id = s.congregation_id
         AND $3 <= z.total_pages AND ($4::int IS NULL OR $4 <= z.total_pages)
         AND ($8::boolean OR s.owner_user_id = $9)
       RETURNING s.*`,
      [id, auth.congregation.id, pageStart, pageEnd, stoppedAt, status,
       body.notes === undefined ? null : String(body.notes), manageable, auth.user.id],
    )
    if (!result.rows[0]) return NextResponse.json({ error: "Segment not found." }, { status: 404 })
    return NextResponse.json(result.rows[0])
  } catch (error) {
    return apiError(error)
  }
}

export async function DELETE(req: NextRequest, { params }: RouteContext) {
  try {
    assertMultiTenantEnabled()
    validateMutationOrigin(req)
    const auth = await requireMembership(params.slug)
    const id = integer(req.nextUrl.searchParams.get("id"))
    if (!id) return NextResponse.json({ error: "Segment id is required." }, { status: 400 })
    const result = await pool.query(
      `DELETE FROM zt_segments WHERE id = $1 AND congregation_id = $2
       AND ($3::boolean OR owner_user_id = $4) RETURNING id`,
      [id, auth.congregation.id, canManageAll(auth), auth.user.id],
    )
    if (!result.rows[0]) return NextResponse.json({ error: "Segment not found." }, { status: 404 })
    await auditEvent({ actorUserId: auth.user.id, congregationId: auth.congregation.id,
      action: "team.segment.deleted", targetType: "segment", targetId: String(id) })
    return NextResponse.json({ success: true })
  } catch (error) {
    return apiError(error)
  }
}
