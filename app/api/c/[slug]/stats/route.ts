import { NextRequest, NextResponse } from "next/server"

import { requireMembership } from "@/lib/auth"
import { pool } from "@/lib/db"
import { validTimeZone } from "@/lib/personal-stats"
import { apiError, assertMultiTenantEnabled, RouteContext } from "../../_shared"

const monthPattern = /^\d{4}-(0[1-9]|1[0-2])$/

export async function GET(request: NextRequest, { params }: RouteContext) {
  try {
    assertMultiTenantEnabled()
    const auth = await requireMembership(params.slug)
    const requestedMonth = request.nextUrl.searchParams.get("month") ?? new Date().toISOString().slice(0, 7)
    if (!monthPattern.test(requestedMonth)) {
      return NextResponse.json({ error: "Month must use YYYY-MM format." }, { status: 400 })
    }
    const timeZone = validTimeZone(request.nextUrl.searchParams.get("timeZone") || "UTC")
    const result = await pool.query(
      `SELECT TO_CHAR(bucket_started_at AT TIME ZONE $4,'YYYY-MM-DD') date,
              SUM(active_seconds)::int active_seconds
         FROM search_activity_buckets
        WHERE congregation_id=$1 AND user_id=$2
          AND bucket_started_at >= ($3::date AT TIME ZONE $4)
          AND bucket_started_at < (($3::date + INTERVAL '1 month') AT TIME ZONE $4)
        GROUP BY date ORDER BY date`,
      [auth.congregation.id, auth.user.id, `${requestedMonth}-01`, timeZone],
    )
    const dailyActivity = result.rows.map((row) => ({ date: row.date, activeSeconds: Number(row.active_seconds) }))
    return NextResponse.json({
      month: requestedMonth,
      timeZone,
      dailyActivity,
      totalActiveSeconds: dailyActivity.reduce((total, day) => total + day.activeSeconds, 0),
      activeDays: dailyActivity.length,
    })
  } catch (error) {
    return apiError(error)
  }
}
