import { NextRequest, NextResponse } from "next/server"
import { pool } from "@/lib/db"
import { requireMembership } from "@/lib/auth"
import { apiError, assertMultiTenantEnabled, RouteContext } from "../../../../_shared"

export async function GET(_req: NextRequest, { params }: RouteContext) {
  try {
    assertMultiTenantEnabled()
    const auth = await requireMembership(params.slug)
    const result = await pool.query(
      `SELECT s.*, z.city, z.zipcode, z.total_pages, cp.id package_id
       FROM zt_segments s
       JOIN zt_zipcodes z ON z.id = s.zipcode_id AND z.congregation_id = s.congregation_id
       LEFT JOIN contact_packages cp ON cp.segment_id=s.id AND cp.congregation_id=s.congregation_id
       WHERE s.congregation_id = $1 AND s.owner_user_id = $2
       ORDER BY CASE s.status WHEN 'In progress' THEN 0 WHEN 'Not started' THEN 1 ELSE 2 END,
                z.city, z.zipcode, s.page_start`,
      [auth.congregation.id, auth.user.id],
    )
    return NextResponse.json(result.rows)
  } catch (error) {
    return apiError(error)
  }
}
