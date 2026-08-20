import { NextRequest, NextResponse } from "next/server"
import { ensureSchema, pool } from "@/lib/db"

export async function GET() {
  try {
    await ensureSchema()
    const result = await pool.query(`
      SELECT z.id, z.city, z.zipcode, z.total_pages, z.territory,
        COUNT(s.id)::int AS segment_count,
        COALESCE(SUM(CASE WHEN s.status = 'Completed' THEN 1 ELSE 0 END), 0)::int AS completed,
        COALESCE(SUM(CASE WHEN s.status = 'In progress' THEN 1 ELSE 0 END), 0)::int AS in_progress,
        COALESCE(SUM(CASE WHEN s.status = 'Not started' THEN 1 ELSE 0 END), 0)::int AS not_started
      FROM zt_zipcodes z
      LEFT JOIN zt_segments s ON s.zipcode_id = z.id
      GROUP BY z.id
      ORDER BY z.territory, z.city, z.zipcode
    `)
    return NextResponse.json(result.rows)
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    await ensureSchema()
    const body = await req.json()
    const city = String(body.city ?? "").trim()
    const zipcode = String(body.zipcode ?? "").trim()
    const territory = String(body.territory ?? "Lacy Boulevard").trim()
    const totalPages = Number.parseInt(String(body.total_pages ?? "0"), 10)

    if (!city || !/^\d{5}$/.test(zipcode) || !territory || totalPages < 1) {
      return NextResponse.json(
        { error: "City, a five-digit zipcode, territory, and total pages are required." },
        { status: 400 },
      )
    }

    const result = await pool.query(
      `INSERT INTO zt_zipcodes (city, zipcode, total_pages, territory)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (zipcode) DO NOTHING
       RETURNING *`,
      [city, zipcode, totalPages, territory],
    )
    if (!result.rows[0]) {
      return NextResponse.json({ error: "Zipcode already exists." }, { status: 409 })
    }
    return NextResponse.json(result.rows[0], { status: 201 })
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
