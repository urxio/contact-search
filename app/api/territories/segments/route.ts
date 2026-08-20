import { NextRequest, NextResponse } from "next/server"
import { ensureSchema, pool } from "@/lib/db"

const VALID_STATUSES = new Set(["Not started", "In progress", "Completed"])

export async function GET(req: NextRequest) {
  await ensureSchema()
  const zipcode = req.nextUrl.searchParams.get("zipcode")
  if (!zipcode) return NextResponse.json({ error: "Zipcode is required." }, { status: 400 })

  const zipResult = await pool.query(`SELECT * FROM zt_zipcodes WHERE zipcode = $1`, [zipcode])
  if (!zipResult.rows[0]) return NextResponse.json({ error: "Zipcode not found." }, { status: 404 })
  const segments = await pool.query(
    `SELECT id, page_start, page_end, owner, stopped_at_page, status, notes, updated_at
     FROM zt_segments WHERE zipcode_id = $1 ORDER BY page_start`,
    [zipResult.rows[0].id],
  )
  return NextResponse.json({ zipcode: zipResult.rows[0], segments: segments.rows })
}

export async function POST(req: NextRequest) {
  await ensureSchema()
  const body = await req.json()
  const zipcode = String(body.zipcode ?? "").trim()
  const owner = String(body.owner ?? "").trim()
  const pageStart = Number.parseInt(String(body.page_start ?? "0"), 10)
  const pageEnd = body.page_end ? Number.parseInt(String(body.page_end), 10) : null

  if (!zipcode || !owner || pageStart < 1 || (pageEnd !== null && pageEnd < pageStart)) {
    return NextResponse.json({ error: "Enter a valid owner and page range." }, { status: 400 })
  }
  const zipResult = await pool.query(`SELECT id, total_pages FROM zt_zipcodes WHERE zipcode = $1`, [zipcode])
  if (!zipResult.rows[0]) return NextResponse.json({ error: "Zipcode not found." }, { status: 404 })

  const result = await pool.query(
    `INSERT INTO zt_segments (zipcode_id, page_start, page_end, owner)
     VALUES ($1, $2, $3, $4) RETURNING *`,
    [zipResult.rows[0].id, pageStart, pageEnd, owner],
  )
  return NextResponse.json(result.rows[0], { status: 201 })
}

export async function PATCH(req: NextRequest) {
  await ensureSchema()
  const body = await req.json()
  const id = Number.parseInt(String(body.id ?? "0"), 10)
  const status = String(body.status ?? "")
  const pageStart = Number.parseInt(String(body.page_start ?? "0"), 10)
  const pageEnd = body.page_end ? Number.parseInt(String(body.page_end), 10) : null
  const stoppedAt = body.stopped_at_page ? Number.parseInt(String(body.stopped_at_page), 10) : null

  if (!id || pageStart < 1 || (pageEnd !== null && pageEnd < pageStart) || !VALID_STATUSES.has(status)) {
    return NextResponse.json({ error: "Invalid segment update." }, { status: 400 })
  }
  const notes = body.notes === undefined ? null : String(body.notes)
  const result = await pool.query(
    `UPDATE zt_segments SET page_start = $2, page_end = $3, stopped_at_page = $4,
      status = $5, notes = COALESCE($6, notes), updated_at = NOW() WHERE id = $1 RETURNING *`,
    [id, pageStart, pageEnd, stoppedAt, status, notes],
  )
  if (!result.rows[0]) return NextResponse.json({ error: "Segment not found." }, { status: 404 })
  return NextResponse.json(result.rows[0])
}

export async function DELETE(req: NextRequest) {
  await ensureSchema()
  const id = Number.parseInt(req.nextUrl.searchParams.get("id") ?? "0", 10)
  if (!id) return NextResponse.json({ error: "Segment id is required." }, { status: 400 })
  const result = await pool.query(`DELETE FROM zt_segments WHERE id = $1 RETURNING id`, [id])
  if (!result.rows[0]) return NextResponse.json({ error: "Segment not found." }, { status: 404 })
  return NextResponse.json({ success: true })
}
