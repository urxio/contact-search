import { NextResponse } from "next/server"
import { getCurrentSession } from "@/lib/auth"
import { pool } from "@/lib/db"

export async function GET() {
  const current = await getCurrentSession()
  if (!current) return NextResponse.json({ user: null, memberships: [] }, { status: 401 })
  const memberships = await pool.query(
    `SELECT c.name,c.slug,COALESCE(m.role,'admin') role,m.display_name,(m.id IS NULL) support_access
       FROM congregations c
       LEFT JOIN congregation_memberships m
         ON m.congregation_id=c.id AND m.user_id=$1 AND m.status='active'
      WHERE c.status='active' AND (m.id IS NOT NULL OR $2::boolean)
      ORDER BY c.name`,
    [current.user.id, current.user.isPlatformAdmin],
  )
  return NextResponse.json({
    user: current.user,
    memberships: memberships.rows.map((row: { name: string; slug: string; role: string; display_name: string | null; support_access: boolean }) => ({
      name: row.name,
      slug: row.slug,
      role: row.role,
      displayName: row.display_name,
      supportAccess: row.support_access,
    })),
  })
}
