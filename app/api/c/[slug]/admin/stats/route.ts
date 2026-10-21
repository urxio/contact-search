import { NextRequest, NextResponse } from "next/server"
import { requireCongregationAdmin } from "@/lib/auth"
import { pool } from "@/lib/db"
import { coverageRanges, pagesIn } from "@/lib/zip-coverage"
import { apiError, assertMultiTenantEnabled, RouteContext } from "../../../_shared"

const WEEKS = 12

// Congregation-wide totals for the Admin > Statistics page.
export async function GET(_req: NextRequest, { params }: RouteContext) {
  try {
    assertMultiTenantEnabled()
    const auth = await requireCongregationAdmin(params.slug)
    const id = auth.congregation.id
    const [totals, weekly, members, activeMembers, zipcodes, segments] = await Promise.all([
      pool.query(
        `SELECT COUNT(*)::int submissions,
                COALESCE(SUM(potentially_french),0)::int potentially_french,
                COALESCE(SUM(potentially_french+not_french+duplicate),0)::int checked_contacts,
                COUNT(*) FILTER (WHERE review_status<>'reviewed' AND NOT archived)::int pending_reviews
           FROM submissions WHERE congregation_id=$1`,
        [id],
      ),
      pool.query(
        `SELECT TO_CHAR(DATE_TRUNC('week',submitted_at),'YYYY-MM-DD') week,
                SUM(potentially_french+not_french+duplicate)::int checked_contacts,
                SUM(potentially_french)::int potentially_french
           FROM submissions
          WHERE congregation_id=$1 AND submitted_at >= DATE_TRUNC('week',NOW()) - ($2::int - 1) * INTERVAL '1 week'
          GROUP BY week ORDER BY week`,
        [id, WEEKS],
      ),
      pool.query(
        `SELECT COALESCE(NULLIF(TRIM(m.display_name),''),u.display_name,MIN(s.user_id)) name,
                SUM(s.potentially_french+s.not_french+s.duplicate)::int checked_contacts,
                SUM(s.potentially_french)::int potentially_french
           FROM submissions s
           LEFT JOIN users u ON u.id=s.owner_user_id
           LEFT JOIN congregation_memberships m ON m.user_id=s.owner_user_id AND m.congregation_id=s.congregation_id
          WHERE s.congregation_id=$1 AND s.submitted_at >= NOW() - INTERVAL '30 days'
          GROUP BY COALESCE(s.owner_user_id::text,LOWER(TRIM(s.user_id))),m.display_name,u.display_name
          ORDER BY checked_contacts DESC LIMIT 5`,
        [id],
      ),
      pool.query(
        `SELECT COUNT(DISTINCT user_id)::int active FROM search_activity_buckets
          WHERE congregation_id=$1 AND bucket_started_at >= NOW() - INTERVAL '30 days'`,
        [id],
      ),
      pool.query(`SELECT id,total_pages FROM zt_zipcodes WHERE congregation_id=$1`, [id]),
      pool.query(`SELECT zipcode_id,page_start,page_end,status,owner_user_id FROM zt_segments WHERE congregation_id=$1`, [id]),
    ])

    let totalPages = 0
    let completedPages = 0
    let openPages = 0
    for (const zip of zipcodes.rows) {
      const pages = Number(zip.total_pages)
      const ranges = coverageRanges(pages, segments.rows.filter((row) => Number(row.zipcode_id) === Number(zip.id)).map((row) => ({
        pageStart: Number(row.page_start), pageEnd: row.page_end == null ? null : Number(row.page_end),
        status: String(row.status), ownerUserId: row.owner_user_id == null ? null : Number(row.owner_user_id), hasExcel: false,
      })))
      totalPages += pages
      completedPages += pagesIn(ranges, "completed")
      openPages += pagesIn(ranges, "open")
    }

    // Fill weeks with no submissions so the chart keeps a steady axis.
    const byWeek = new Map(weekly.rows.map((row) => [String(row.week), row]))
    const monday = new Date()
    monday.setUTCHours(0, 0, 0, 0)
    monday.setUTCDate(monday.getUTCDate() - ((monday.getUTCDay() + 6) % 7))
    const weeks = Array.from({ length: WEEKS }, (_, index) => {
      const date = new Date(monday)
      date.setUTCDate(date.getUTCDate() - (WEEKS - 1 - index) * 7)
      const week = date.toISOString().slice(0, 10)
      const row = byWeek.get(week)
      return { week, checkedContacts: Number(row?.checked_contacts ?? 0), potentiallyFrench: Number(row?.potentially_french ?? 0) }
    })

    const total = totals.rows[0] ?? {}
    return NextResponse.json({
      submissions: Number(total.submissions ?? 0),
      potentiallyFrench: Number(total.potentially_french ?? 0),
      checkedContacts: Number(total.checked_contacts ?? 0),
      pendingReviews: Number(total.pending_reviews ?? 0),
      activeMembers: Number(activeMembers.rows[0]?.active ?? 0),
      pages: { total: totalPages, completed: completedPages, open: openPages },
      weeks,
      topMembers: members.rows.map((row) => ({ name: String(row.name), checkedContacts: Number(row.checked_contacts), potentiallyFrench: Number(row.potentially_french) })),
    })
  } catch (error) {
    return apiError(error)
  }
}
