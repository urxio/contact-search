import { NextRequest, NextResponse } from "next/server"

import { requireMembership } from "@/lib/auth"
import { pool } from "@/lib/db"
import { localDateForTimeZone, statsPeriodRange, validStatsDate, validStatsPeriod, validTimeZone } from "@/lib/personal-stats"
import { apiError, assertMultiTenantEnabled, RouteContext } from "../../_shared"

type Contributor = { userId: number; activeSeconds: number; potentiallyFrench: number; checkedContacts: number }

function average(values: number[]) {
  return values.length ? Math.round(values.reduce((total, value) => total + value, 0) / values.length) : 0
}

function percentile(value: number, values: number[]) {
  if (!values.length) return null
  return Math.round((values.filter((candidate) => candidate <= value).length / values.length) * 100)
}

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
    const contributorsResult = await pool.query(
      `WITH member_activity AS (
         SELECT user_id, SUM(active_seconds)::int active_seconds
           FROM search_activity_buckets
          WHERE congregation_id=$1
            AND bucket_started_at >= ($2::date AT TIME ZONE $4)
            AND bucket_started_at < ($3::date AT TIME ZONE $4)
          GROUP BY user_id
       ), member_impact AS (
         SELECT owner_user_id user_id,
                SUM(potentially_french)::int potentially_french,
                SUM(potentially_french + not_french + duplicate)::int checked_contacts
           FROM submissions
          WHERE congregation_id=$1 AND owner_user_id IS NOT NULL
            AND submitted_at >= ($2::date AT TIME ZONE $4)
            AND submitted_at < ($3::date AT TIME ZONE $4)
          GROUP BY owner_user_id
       )
       SELECT membership.user_id,
              COALESCE(activity.active_seconds, 0)::int active_seconds,
              COALESCE(impact.potentially_french, 0)::int potentially_french,
              COALESCE(impact.checked_contacts, 0)::int checked_contacts
         FROM congregation_memberships membership
         LEFT JOIN member_activity activity ON activity.user_id=membership.user_id
         LEFT JOIN member_impact impact ON impact.user_id=membership.user_id
        WHERE membership.congregation_id=$1 AND membership.status='active'
          AND (COALESCE(activity.active_seconds, 0)>0 OR COALESCE(impact.potentially_french, 0)>0 OR COALESCE(impact.checked_contacts, 0)>0)`,
      [auth.congregation.id, startDate, endDate, timeZone],
    )
    const dailyActivity = activity.rows.map((row) => ({ date: row.date, activeSeconds: Number(row.active_seconds) }))
    const contributors: Contributor[] = contributorsResult.rows.map((row) => ({
      userId: Number(row.user_id), activeSeconds: Number(row.active_seconds), potentiallyFrench: Number(row.potentially_french), checkedContacts: Number(row.checked_contacts),
    }))
    const mine = contributors.find((contributor) => contributor.userId === Number(auth.user.id)) ?? { userId: Number(auth.user.id), activeSeconds: 0, potentiallyFrench: 0, checkedContacts: 0 }
    const contributorCount = contributors.length
    const comparisonAvailable = contributorCount >= 3 && mine.activeSeconds + mine.potentiallyFrench + mine.checkedContacts > 0
    const totalActiveSeconds = dailyActivity.reduce((total, day) => total + day.activeSeconds, 0)
    const totalFrenchNames = contributors.reduce((total, contributor) => total + contributor.potentiallyFrench, 0)
    const totalCheckedContacts = contributors.reduce((total, contributor) => total + contributor.checkedContacts, 0)
    return NextResponse.json({
      period, anchor, timeZone, startDate, endDate, dailyActivity, totalActiveSeconds,
      activeDays: dailyActivity.filter((day) => day.activeSeconds > 0).length,
      impact: { potentiallyFrench: mine.potentiallyFrench, checkedContacts: mine.checkedContacts, congregationFrenchNames: totalFrenchNames, congregationCheckedContacts: totalCheckedContacts, congregationShare: totalFrenchNames ? Math.round((mine.potentiallyFrench / totalFrenchNames) * 100) : 0 },
      comparison: comparisonAvailable ? {
        contributorCount,
        time: { average: average(contributors.map((contributor) => contributor.activeSeconds)), percentile: percentile(mine.activeSeconds, contributors.map((contributor) => contributor.activeSeconds)) },
        frenchNames: { average: average(contributors.map((contributor) => contributor.potentiallyFrench)), percentile: percentile(mine.potentiallyFrench, contributors.map((contributor) => contributor.potentiallyFrench)) },
      } : null,
    })
  } catch (error) {
    return apiError(error)
  }
}
