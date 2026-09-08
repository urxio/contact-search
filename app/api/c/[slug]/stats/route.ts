import { NextRequest, NextResponse } from "next/server"

import { requireMembership } from "@/lib/auth"
import { pool } from "@/lib/db"
import { localDateForTimeZone, statsPeriodRange, validStatsDate, validStatsPeriod, validTimeZone } from "@/lib/personal-stats"
import { apiError, assertMultiTenantEnabled, RouteContext } from "../../_shared"

export async function GET(request: NextRequest, { params }: RouteContext) {
  try {
    assertMultiTenantEnabled()
    const auth = await requireMembership(params.slug)
    const timeZone = validTimeZone(request.nextUrl.searchParams.get("timeZone") || "UTC")
    const period = validStatsPeriod(request.nextUrl.searchParams.get("period"))
    const anchor = validStatsDate(request.nextUrl.searchParams.get("date")) ?? localDateForTimeZone(timeZone)
    if (anchor > localDateForTimeZone(timeZone)) return NextResponse.json({ error: "Future periods are not available." }, { status: 400 })
    const { startDate, endDate } = statsPeriodRange(period, anchor)
    const activity = await pool.query(
      `SELECT TO_CHAR(bucket_started_at AT TIME ZONE $5, 'YYYY-MM-DD') date,
              SUM(active_seconds)::int active_seconds
         FROM search_activity_buckets
        WHERE congregation_id=$1 AND user_id=$2
          AND bucket_started_at >= ($3::date AT TIME ZONE $5)
          AND bucket_started_at < ($4::date AT TIME ZONE $5)
        GROUP BY date ORDER BY date`,
      [auth.congregation.id, auth.user.id, startDate, endDate, timeZone],
    )
    const impact = await pool.query(
      `SELECT COALESCE(SUM(potentially_french), 0)::int potentially_french,
              COALESCE(SUM(potentially_french + not_french + duplicate), 0)::int checked_contacts
         FROM submissions
        WHERE congregation_id=$1 AND owner_user_id=$2
          AND submitted_at >= ($3::date AT TIME ZONE $5)
          AND submitted_at < ($4::date AT TIME ZONE $5)`,
      [auth.congregation.id, auth.user.id, startDate, endDate, timeZone],
    )
    const dailyActivity = activity.rows.map((row) => ({ date: row.date, activeSeconds: Number(row.active_seconds) }))
    const impactTotals = impact.rows[0] ?? { potentially_french: 0, checked_contacts: 0 }
    const totalActiveSeconds = dailyActivity.reduce((total, day) => total + day.activeSeconds, 0)
    return NextResponse.json({
      period, anchor, timeZone, startDate, endDate, dailyActivity, totalActiveSeconds,
      activeDays: dailyActivity.filter((day) => day.activeSeconds > 0).length,
      impact: { potentiallyFrench: Number(impactTotals.potentially_french), checkedContacts: Number(impactTotals.checked_contacts) },
    })
  } catch (error) {
    return apiError(error)
  }
}
