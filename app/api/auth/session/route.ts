import { NextResponse } from "next/server"
import { getCurrentSession } from "@/lib/auth"
import { pool } from "@/lib/db"

export async function GET() {
  const current = await getCurrentSession()
  if (!current) return NextResponse.json({ user: null, memberships: [] }, { status: 401 })
  const memberships = await pool.query(`SELECT c.name,c.slug,m.role,m.display_name FROM congregation_memberships m JOIN congregations c ON c.id=m.congregation_id WHERE m.user_id=$1 AND m.status='active' AND c.status='active' ORDER BY c.name`, [current.user.id])
  return NextResponse.json({ user: current.user, memberships: memberships.rows.map((row: { name: string; slug: string; role: string; display_name: string | null }) => ({ name: row.name, slug: row.slug, role: row.role, displayName: row.display_name })) })
}
