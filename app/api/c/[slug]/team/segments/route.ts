import { NextRequest, NextResponse } from "next/server"
import { pool } from "@/lib/db"
import { auditEvent, requireMembership, validateMutationOrigin } from "@/lib/auth"
import { assertNoSegmentConflict, SegmentConflictError } from "@/lib/team-segments"
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
              (s.owner_user_id = $3) AS is_mine,
              cp.id AS package_id,
              COALESCE(ARRAY(
                SELECT other.id FROM zt_segments other
                WHERE other.congregation_id = s.congregation_id
                  AND other.zipcode_id = s.zipcode_id
                  AND other.id <> s.id
                  AND other.page_start <= COALESCE(s.page_end, $4)
                  AND s.page_start <= COALESCE(other.page_end, $4)
                ORDER BY other.page_start, other.id
              ), '{}') AS conflict_segment_ids
       FROM zt_segments s
       LEFT JOIN contact_packages cp
         ON cp.segment_id = s.id AND cp.congregation_id = s.congregation_id
       WHERE s.congregation_id = $1 AND s.zipcode_id = $2
       ORDER BY s.page_start`,
      [auth.congregation.id, zipResult.rows[0].id, auth.user.id, zipResult.rows[0].total_pages],
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
    const client = await pool.connect()
    try {
      await client.query("BEGIN")
      const zipResult = await client.query(
        `SELECT id, total_pages FROM zt_zipcodes WHERE congregation_id = $1 AND zipcode = $2`,
        [auth.congregation.id, zipcode],
      )
      const zip = zipResult.rows[0]
      if (!zip) { await client.query("ROLLBACK"); return NextResponse.json({ error: "Zipcode not found." }, { status: 404 }) }
      if (pageStart > zip.total_pages || (pageEnd && pageEnd > zip.total_pages)) {
        await client.query("ROLLBACK")
        return NextResponse.json({ error: "Page range exceeds this territory." }, { status: 400 })
      }
      await assertNoSegmentConflict(client, {
        congregationId: auth.congregation.id,
        zipcodeId: Number(zip.id),
        pageStart,
        pageEnd: pageEnd ?? Number(zip.total_pages),
      })
      const owner = auth.membership?.displayName || auth.user.displayName
      const result = await client.query(
        `INSERT INTO zt_segments
          (congregation_id, zipcode_id, page_start, page_end, owner, owner_user_id)
         VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
        [auth.congregation.id, zip.id, pageStart, pageEnd, owner, auth.user.id],
      )
      await client.query("COMMIT")
      return NextResponse.json(result.rows[0], { status: 201 })
    } catch (error) {
      await client.query("ROLLBACK")
      if (error instanceof SegmentConflictError) {
        await auditEvent({ actorUserId: auth.user.id, congregationId: auth.congregation.id,
          action: "team.segment.conflict_rejected", targetType: "segment", metadata: { zipcode, pageStart, pageEnd, conflict: error.conflict } })
        return NextResponse.json({ error: error.message, code: "SEGMENT_CONFLICT", conflict: error.conflict }, { status: 409 })
      }
      throw error
    } finally {
      client.release()
    }
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
    const client = await pool.connect()
    try {
      await client.query("BEGIN")
      const current = await client.query(
        `SELECT s.id, s.zipcode_id, z.total_pages, z.zipcode
         FROM zt_segments s JOIN zt_zipcodes z
           ON z.id=s.zipcode_id AND z.congregation_id=s.congregation_id
         WHERE s.id=$1 AND s.congregation_id=$2
           AND ($3::boolean OR s.owner_user_id=$4)
         FOR UPDATE OF s`,
        [id, auth.congregation.id, canManageAll(auth), auth.user.id],
      )
      const segment = current.rows[0]
      if (!segment) { await client.query("ROLLBACK"); return NextResponse.json({ error: "Segment not found." }, { status: 404 }) }
      if (pageStart > segment.total_pages || (pageEnd && pageEnd > segment.total_pages)) {
        await client.query("ROLLBACK")
        return NextResponse.json({ error: "Page range exceeds this territory." }, { status: 400 })
      }
      await assertNoSegmentConflict(client, {
        congregationId: auth.congregation.id,
        zipcodeId: Number(segment.zipcode_id),
        pageStart,
        pageEnd: pageEnd ?? Number(segment.total_pages),
        excludeSegmentId: id,
      })
      const result = await client.query(
        `UPDATE zt_segments SET page_start=$3, page_end=$4, stopped_at_page=$5,
           status=$6, notes=COALESCE($7,notes), updated_at=NOW()
         WHERE id=$1 AND congregation_id=$2 RETURNING *`,
        [id, auth.congregation.id, pageStart, pageEnd, stoppedAt, status,
         body.notes === undefined ? null : String(body.notes)],
      )
      await client.query("COMMIT")
      return NextResponse.json(result.rows[0])
    } catch (error) {
      await client.query("ROLLBACK")
      if (error instanceof SegmentConflictError) {
        await auditEvent({ actorUserId: auth.user.id, congregationId: auth.congregation.id,
          action: "team.segment.conflict_rejected", targetType: "segment", targetId: String(id), metadata: { conflict: error.conflict } })
        return NextResponse.json({ error: error.message, code: "SEGMENT_CONFLICT", conflict: error.conflict }, { status: 409 })
      }
      throw error
    } finally {
      client.release()
    }
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
    const client = await pool.connect()
    try {
      await client.query("BEGIN")
      const found = await client.query(
        `SELECT s.id, cp.id package_id FROM zt_segments s
         LEFT JOIN contact_packages cp ON cp.segment_id=s.id AND cp.congregation_id=s.congregation_id
         WHERE s.id=$1 AND s.congregation_id=$2
           AND ($3::boolean OR s.owner_user_id=$4)
         FOR UPDATE OF s`,
        [id, auth.congregation.id, canManageAll(auth), auth.user.id],
      )
      const segment = found.rows[0]
      if (!segment) { await client.query("ROLLBACK"); return NextResponse.json({ error: "Segment not found." }, { status: 404 }) }
      if (segment.package_id) {
        await client.query(
          `UPDATE zt_segments SET owner='', owner_user_id=NULL, stopped_at_page=NULL,
             status='Not started', updated_at=NOW() WHERE id=$1 AND congregation_id=$2`,
          [id, auth.congregation.id],
        )
      } else {
        await client.query(`DELETE FROM zt_segments WHERE id=$1 AND congregation_id=$2`, [id, auth.congregation.id])
      }
      await client.query("COMMIT")
      await auditEvent({ actorUserId: auth.user.id, congregationId: auth.congregation.id,
        action: segment.package_id ? "contact_package.released" : "team.segment.deleted",
        targetType: segment.package_id ? "contact_package" : "segment",
        targetId: String(segment.package_id ?? id) })
      return NextResponse.json({ success: true, released: Boolean(segment.package_id) })
    } catch (error) {
      await client.query("ROLLBACK")
      throw error
    } finally {
      client.release()
    }
  } catch (error) {
    return apiError(error)
  }
}
