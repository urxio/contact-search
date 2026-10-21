import { NextRequest, NextResponse } from "next/server"
import { requireCongregationAdmin } from "@/lib/auth"
import { pool } from "@/lib/db"
import { orderedTeamAreas } from "@/lib/team-areas"
import { coverageRanges, pagesIn, uploadBatchPages } from "@/lib/zip-coverage"
import { apiError, assertMultiTenantEnabled, RouteContext } from "../../../_shared"

// Page-by-page coverage for every ZIP code, so admins can see which ranges still need an Excel.
export async function GET(_req: NextRequest, { params }: RouteContext) {
  try {
    assertMultiTenantEnabled()
    const auth = await requireCongregationAdmin(params.slug)
    const [zipcodes, segments] = await Promise.all([
      pool.query(`SELECT id,city,zipcode,total_pages,territory FROM zt_zipcodes WHERE congregation_id=$1`, [auth.congregation.id]),
      pool.query(
        `SELECT s.zipcode_id,s.page_start,s.page_end,s.status,s.owner_user_id,
                EXISTS(SELECT 1 FROM contact_packages cp WHERE cp.segment_id=s.id AND cp.congregation_id=s.congregation_id) has_excel
           FROM zt_segments s WHERE s.congregation_id=$1`,
        [auth.congregation.id],
      ),
    ])
    const byZip = new Map<number, typeof segments.rows>()
    for (const row of segments.rows) byZip.set(Number(row.zipcode_id), [...(byZip.get(Number(row.zipcode_id)) ?? []), row])
    const settings = (auth.congregation.settings ?? {}) as { teamProgressAreaOrder?: unknown; uploadBatchPages?: unknown }
    const areas = orderedTeamAreas(zipcodes.rows.map((row) => String(row.territory)), settings.teamProgressAreaOrder)
    const rows = zipcodes.rows.map((zip) => {
      const totalPages = Number(zip.total_pages)
      const ranges = coverageRanges(totalPages, (byZip.get(Number(zip.id)) ?? []).map((row) => ({
        pageStart: Number(row.page_start), pageEnd: row.page_end == null ? null : Number(row.page_end),
        status: String(row.status), ownerUserId: row.owner_user_id == null ? null : Number(row.owner_user_id), hasExcel: Boolean(row.has_excel),
      })))
      return {
        zipcode: String(zip.zipcode), city: String(zip.city), area: String(zip.territory), totalPages, ranges,
        openPages: pagesIn(ranges, "open"), availablePages: pagesIn(ranges, "available"),
        claimedPages: pagesIn(ranges, "claimed"), completedPages: pagesIn(ranges, "completed"),
      }
    })
    return NextResponse.json({ rows, areas, batchPages: uploadBatchPages(settings.uploadBatchPages) })
  } catch (error) {
    return apiError(error)
  }
}
