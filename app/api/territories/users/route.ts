import { NextRequest, NextResponse } from "next/server"
import { ensureSchema, pool } from "@/lib/db"

export async function GET() {
  await ensureSchema()
  const result = await pool.query(`
    SELECT name FROM (
      SELECT name FROM zt_users
      UNION
      SELECT DISTINCT TRIM(owner) FROM zt_segments
      WHERE owner IS NOT NULL AND TRIM(owner) <> ''
    ) users
    ORDER BY name
  `)
  return NextResponse.json(result.rows.map((row: { name: string }) => row.name))
}

export async function POST(req: NextRequest) {
  await ensureSchema()
  const name = String((await req.json()).name ?? "").trim()
  if (!name) return NextResponse.json({ error: "Name is required." }, { status: 400 })
  await pool.query(`INSERT INTO zt_users (name) VALUES ($1) ON CONFLICT (name) DO NOTHING`, [name])
  return NextResponse.json({ success: true })
}
