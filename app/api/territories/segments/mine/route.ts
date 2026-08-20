import { NextRequest, NextResponse } from "next/server"
import { ensureSchema, pool } from "@/lib/db"

export async function GET(req: NextRequest) {
  await ensureSchema()
  const owner = req.nextUrl.searchParams.get("owner")?.trim()
  if (!owner) return NextResponse.json({ error: "Owner is required." }, { status: 400 })

  const result = await pool.query(`
    SELECT s.*, z.city, z.zipcode, z.total_pages
    FROM zt_segments s
    JOIN zt_zipcodes z ON z.id = s.zipcode_id
    WHERE LOWER(TRIM(s.owner)) = LOWER($1)
    ORDER BY CASE s.status
      WHEN 'In progress' THEN 0 WHEN 'Not started' THEN 1 ELSE 2 END,
      z.city, z.zipcode, s.page_start
  `, [owner.toLowerCase()])
  return NextResponse.json(result.rows)
}
