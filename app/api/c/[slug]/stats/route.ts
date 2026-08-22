import { NextRequest, NextResponse } from "next/server"

import { requireMembership } from "@/lib/auth"
import { pool } from "@/lib/db"
import { activityStreak, uncoveredPageRanges, validTimeZone } from "@/lib/personal-stats"
import { apiError, assertMultiTenantEnabled, RouteContext } from "../../_shared"

const monthPattern = /^\d{4}-(0[1-9]|1[0-2])$/

function shiftMonth(month: string, amount: number) {
  const [year, monthNumber] = month.split("-").map(Number)
  const shifted = new Date(Date.UTC(year, monthNumber - 1 + amount, 1))
  return `${shifted.getUTCFullYear()}-${String(shifted.getUTCMonth() + 1).padStart(2, "0")}`
}

export async function GET(request: NextRequest, { params }: RouteContext) {
  try {
    assertMultiTenantEnabled()
    const auth = await requireMembership(params.slug)
    const requestedMonth = request.nextUrl.searchParams.get("month") ?? new Date().toISOString().slice(0, 7)
    if (!monthPattern.test(requestedMonth)) {
      return NextResponse.json({ error: "Month must use YYYY-MM format." }, { status: 400 })
    }
    const timeZone = validTimeZone(request.nextUrl.searchParams.get("timeZone") || "UTC")
    const args = [auth.congregation.id, auth.user.id, `${requestedMonth}-01`, timeZone]
    const yearlyArgs = [auth.congregation.id, auth.user.id, `${shiftMonth(requestedMonth, -11)}-01`, timeZone]
    const teamArgs = [auth.congregation.id, `${requestedMonth}-01`, timeZone]
    const period = `bucket_started_at >= ($3::date AT TIME ZONE $4) AND bucket_started_at < (($3::date + INTERVAL '1 month') AT TIME ZONE $4)`
    const datedPeriod = (column: string) => `${column} >= ($3::date AT TIME ZONE $4) AND ${column} < (($3::date + INTERVAL '1 month') AT TIME ZONE $4)`
    const teamPeriod = `bucket_started_at >= ($2::date AT TIME ZONE $3) AND bucket_started_at < (($2::date + INTERVAL '1 month') AT TIME ZONE $3)`
    const teamDatedPeriod = (column: string) => `${column} >= ($2::date AT TIME ZONE $3) AND ${column} < (($2::date + INTERVAL '1 month') AT TIME ZONE $3)`

    const [dailyResult, yearlyResult, personalResult, teamResult, milestoneResult, assignedResult, availableResult, territoryResult, draftResult] = await Promise.all([
      pool.query(
        `SELECT TO_CHAR(bucket_started_at AT TIME ZONE $4,'YYYY-MM-DD') date,SUM(active_seconds)::int active_seconds
         FROM search_activity_buckets WHERE congregation_id=$1 AND user_id=$2 AND ${period}
        GROUP BY date ORDER BY date`, args,
      ),
      pool.query(
        `SELECT TO_CHAR(bucket_started_at AT TIME ZONE $4,'YYYY-MM-DD') date,SUM(active_seconds)::int active_seconds
         FROM search_activity_buckets
         WHERE congregation_id=$1 AND user_id=$2
           AND bucket_started_at >= ($3::date AT TIME ZONE $4)
           AND bucket_started_at < (($3::date + INTERVAL '12 months') AT TIME ZONE $4)
         GROUP BY date ORDER BY date`, yearlyArgs,
      ),
      pool.query(
        `SELECT
           (SELECT COUNT(*)::int FROM submissions WHERE congregation_id=$1 AND owner_user_id=$2 AND ${datedPeriod("submitted_at")}) submissions,
           (SELECT COALESCE(SUM(contact_count),0)::int FROM submissions WHERE congregation_id=$1 AND owner_user_id=$2 AND ${datedPeriod("submitted_at")}) contacts_submitted,
           (SELECT COUNT(*)::int FROM zt_segments WHERE congregation_id=$1 AND owner_user_id=$2 AND status='Completed' AND ${datedPeriod("updated_at")}) completed_segments`, args,
      ),
      pool.query(
        `SELECT
           (SELECT COALESCE(SUM(active_seconds),0)::int FROM search_activity_buckets WHERE congregation_id=$1 AND ${teamPeriod}) active_seconds,
           (SELECT COALESCE(SUM(contact_count),0)::int FROM submissions WHERE congregation_id=$1 AND ${teamDatedPeriod("submitted_at")}) contacts_submitted,
           (SELECT COUNT(*)::int FROM zt_segments WHERE congregation_id=$1 AND status='Completed' AND ${teamDatedPeriod("updated_at")}) completed_segments,
           (SELECT COUNT(DISTINCT user_id)::int FROM (
              SELECT user_id FROM search_activity_buckets WHERE congregation_id=$1 AND ${teamPeriod}
              UNION SELECT owner_user_id FROM submissions WHERE congregation_id=$1 AND owner_user_id IS NOT NULL AND ${teamDatedPeriod("submitted_at")}
              UNION SELECT owner_user_id FROM zt_segments WHERE congregation_id=$1 AND owner_user_id IS NOT NULL AND status='Completed' AND ${teamDatedPeriod("updated_at")}
            ) contributors) contributors`, teamArgs,
      ),
      pool.query(
        `SELECT * FROM (
           SELECT 'submission' kind,s.submitted_at happened_at,
                  COALESCE(m.display_name,u.display_name,s.user_id,'Member') display_name,
                  s.contact_count,NULL::text zipcode,NULL::int page_start,NULL::int page_end
             FROM submissions s
             LEFT JOIN users u ON u.id=s.owner_user_id
             LEFT JOIN congregation_memberships m ON m.user_id=s.owner_user_id AND m.congregation_id=s.congregation_id
            WHERE s.congregation_id=$1 AND ${teamDatedPeriod("s.submitted_at")}
           UNION ALL
           SELECT 'completion',s.updated_at,COALESCE(m.display_name,u.display_name,s.owner,'Member'),
                  NULL::int,z.zipcode,s.page_start,COALESCE(s.page_end,z.total_pages)
             FROM zt_segments s
             JOIN zt_zipcodes z ON z.id=s.zipcode_id AND z.congregation_id=s.congregation_id
             LEFT JOIN users u ON u.id=s.owner_user_id
             LEFT JOIN congregation_memberships m ON m.user_id=s.owner_user_id AND m.congregation_id=s.congregation_id
            WHERE s.congregation_id=$1 AND s.status='Completed' AND ${teamDatedPeriod("s.updated_at")}
         ) events ORDER BY happened_at DESC LIMIT 8`, teamArgs,
      ),
      pool.query(
        `SELECT s.id,s.status,s.page_start,COALESCE(s.page_end,z.total_pages) page_end,s.stopped_at_page,
                z.zipcode,z.city,z.territory,cp.id package_id,cp.name package_name
           FROM zt_segments s
           JOIN zt_zipcodes z ON z.id=s.zipcode_id AND z.congregation_id=s.congregation_id
           LEFT JOIN contact_packages cp ON cp.segment_id=s.id AND cp.congregation_id=s.congregation_id
          WHERE s.congregation_id=$1 AND s.owner_user_id=$2 AND s.status<>'Completed'
          ORDER BY CASE s.status WHEN 'In progress' THEN 0 ELSE 1 END,s.updated_at DESC`, [auth.congregation.id, auth.user.id],
      ),
      pool.query(
        `SELECT cp.id package_id,cp.name package_name,cp.contact_count,z.zipcode,z.city,z.territory,
                s.page_start,COALESCE(s.page_end,z.total_pages) page_end
           FROM contact_packages cp
           JOIN zt_segments s ON s.id=cp.segment_id AND s.congregation_id=cp.congregation_id
           JOIN zt_zipcodes z ON z.id=s.zipcode_id AND z.congregation_id=s.congregation_id
          WHERE cp.congregation_id=$1 AND cp.visibility='shared' AND s.owner_user_id IS NULL AND s.status='Not started'
          ORDER BY cp.created_at DESC`, [auth.congregation.id],
      ),
      pool.query(
        `SELECT z.id,z.city,z.zipcode,z.territory,z.total_pages,s.page_start,s.page_end
           FROM zt_zipcodes z LEFT JOIN zt_segments s ON s.zipcode_id=z.id AND s.congregation_id=z.congregation_id
          WHERE z.congregation_id=$1 ORDER BY z.territory,z.city,z.zipcode,s.page_start`, [auth.congregation.id],
      ),
      pool.query(`SELECT territory_zipcode FROM contact_drafts WHERE congregation_id=$1 AND user_id=$2`, [auth.congregation.id, auth.user.id]),
    ])

    const dailyActivity = dailyResult.rows.map((row) => ({ date: row.date, activeSeconds: Number(row.active_seconds) }))
    const yearlyActivity = yearlyResult.rows.map((row) => ({ date: row.date, activeSeconds: Number(row.active_seconds) }))
    const totalActiveSeconds = dailyActivity.reduce((total, day) => total + day.activeSeconds, 0)
    const yearlyActiveSeconds = yearlyActivity.reduce((total, day) => total + day.activeSeconds, 0)
    const today = new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date())
    type ZipcodeCoverage = { id: number; city: string; zipcode: string; territory: string; totalPages: number; ranges: Array<{ pageStart: number; pageEnd: number | null }> }
    const zipcodes = new Map<number, ZipcodeCoverage>()
    for (const row of territoryResult.rows) {
      const id = Number(row.id)
      const zipcode: ZipcodeCoverage = zipcodes.get(id) ?? { id, city: row.city, zipcode: row.zipcode, territory: row.territory, totalPages: Number(row.total_pages), ranges: [] }
      if (row.page_start != null) zipcode.ranges.push({ pageStart: Number(row.page_start), pageEnd: row.page_end == null ? null : Number(row.page_end) })
      zipcodes.set(id, zipcode)
    }
    const currentZipcode = draftResult.rows[0]?.territory_zipcode || ""
    const openRanges = Array.from(zipcodes.values()).flatMap((zipcode) =>
      uncoveredPageRanges(zipcode.totalPages, zipcode.ranges).map((range) => ({
        ...range, zipcodeId: zipcode.id, zipcode: zipcode.zipcode, city: zipcode.city, territory: zipcode.territory,
        pageCount: range.pageEnd - range.pageStart + 1,
      })),
    ).sort((left, right) => Number(right.zipcode === currentZipcode) - Number(left.zipcode === currentZipcode) || right.pageCount - left.pageCount || left.zipcode.localeCompare(right.zipcode))

    const personal = personalResult.rows[0] ?? {}
    const team = teamResult.rows[0] ?? {}
    return NextResponse.json({
      month: requestedMonth,
      timeZone,
      personal: {
        dailyActivity, yearlyActivity, totalActiveSeconds, yearlyActiveSeconds, activeDays: dailyActivity.length,
        currentStreak: activityStreak(dailyActivity, requestedMonth, today),
        submissions: Number(personal.submissions ?? 0), contactsSubmitted: Number(personal.contacts_submitted ?? 0),
        completedSegments: Number(personal.completed_segments ?? 0),
      },
      team: {
        activeSeconds: Number(team.active_seconds ?? 0), contactsSubmitted: Number(team.contacts_submitted ?? 0),
        completedSegments: Number(team.completed_segments ?? 0), contributors: Number(team.contributors ?? 0),
        highlights: milestoneResult.rows.map((row) => ({
          kind: row.kind, happenedAt: row.happened_at, displayName: row.display_name,
          contactCount: row.contact_count == null ? null : Number(row.contact_count), zipcode: row.zipcode,
          pageStart: row.page_start == null ? null : Number(row.page_start), pageEnd: row.page_end == null ? null : Number(row.page_end),
        })),
      },
      assignedSegments: assignedResult.rows.map((row) => ({
        id: Number(row.id), status: row.status, pageStart: Number(row.page_start), pageEnd: Number(row.page_end),
        stoppedAtPage: row.stopped_at_page == null ? null : Number(row.stopped_at_page), zipcode: row.zipcode,
        city: row.city, territory: row.territory, packageId: row.package_id == null ? null : Number(row.package_id), packageName: row.package_name,
      })),
      availablePackages: availableResult.rows.map((row) => ({
        packageId: Number(row.package_id), packageName: row.package_name, contactCount: Number(row.contact_count),
        zipcode: row.zipcode, city: row.city, territory: row.territory, pageStart: Number(row.page_start), pageEnd: Number(row.page_end),
      })),
      openRanges,
    })
  } catch (error) {
    return apiError(error)
  }
}
