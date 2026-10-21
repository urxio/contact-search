import { NextRequest, NextResponse } from "next/server"
import { requireCongregationAdmin } from "@/lib/auth"
import { pool } from "@/lib/db"
import { ACTIVITY_FILTERS, activityFilter, CLAIM_KINDS, decodeCursor, encodeCursor, type ActivityKind } from "@/lib/admin-activity"
import { apiError, assertMultiTenantEnabled, integer, RouteContext } from "../../../_shared"

const PAGE_SIZE = 30
const ALL_KINDS: ActivityKind[] = ["joined", "uploaded", "uploaded_claimed", "claimed", "opened", "assigned", "released", "claimed_pages", "completed", "status", "submitted", "zip_added"]

// Member activity for Admin > Statistics, built from the audit log. Completions recorded
// before completions were logged fall back to the segment's last update time.
const ACTIVITY_SQL = `
WITH ev AS (
  SELECT 'a'||a.id AS key, a.created_at AS at, a.actor_user_id, a.metadata, a.target_type, a.target_id,
    CASE a.action
      WHEN 'invitation.accepted' THEN 'joined'
      WHEN 'contact_package.created' THEN 'uploaded'
      WHEN 'contact_package.created_and_opened' THEN 'uploaded_claimed'
      WHEN 'contact_package.opened' THEN CASE WHEN a.metadata->>'previousOwnerUserId' = a.actor_user_id::text THEN 'opened' ELSE 'claimed' END
      WHEN 'contact_package.assigned' THEN 'assigned'
      WHEN 'contact_package.released' THEN 'released'
      WHEN 'team.segment.created' THEN 'claimed_pages'
      WHEN 'team.segment.status_changed' THEN CASE WHEN a.metadata->>'status' = 'Completed' THEN 'completed' ELSE 'status' END
      WHEN 'submission.created' THEN 'submitted'
      WHEN 'team.zipcode.created' THEN 'zip_added'
    END AS kind
  FROM audit_events a
  WHERE a.congregation_id=$1 AND a.action IN ('invitation.accepted','contact_package.created','contact_package.created_and_opened',
    'contact_package.opened','contact_package.assigned','contact_package.released','team.segment.created',
    'team.segment.status_changed','submission.created','team.zipcode.created')
  UNION ALL
  SELECT 'c'||a.id||'-'||seg.id, a.created_at, a.actor_user_id, '{}'::jsonb, 'segment', seg.id, 'completed'
  FROM audit_events a
  CROSS JOIN LATERAL jsonb_array_elements_text(COALESCE(a.metadata->'completedSegmentIds','[]'::jsonb)) AS seg(id)
  WHERE a.congregation_id=$1 AND a.action='submission.created'
  UNION ALL
  SELECT 's'||s.id, s.updated_at, s.owner_user_id, '{}'::jsonb, 'segment', s.id::text, 'completed'
  FROM zt_segments s
  WHERE s.congregation_id=$1 AND s.status='Completed' AND NOT EXISTS (
    SELECT 1 FROM audit_events a WHERE a.congregation_id=$1 AND (
      (a.action='team.segment.status_changed' AND a.target_id=s.id::text AND a.metadata->>'status'='Completed') OR
      (a.action='submission.created' AND a.metadata->'completedSegmentIds' @> to_jsonb(s.id))))
)
SELECT ev.key, ev.at, ev.kind, ev.actor_user_id,
  COALESCE(NULLIF(TRIM(m.display_name),''), u.display_name, NULLIF(TRIM(s.owner),''), 'Someone') actor_name,
  COALESCE(NULLIF(TRIM(tm.display_name),''), tu.display_name) target_name,
  cp.name package_name,
  COALESCE(z.zipcode, ev.metadata->>'zipcode', sub.territory_zipcode) zipcode, z.city,
  COALESCE((ev.metadata->>'pageStart')::int, s.page_start) page_start,
  COALESCE((ev.metadata->>'pageEnd')::int, s.page_end, CASE WHEN s.id IS NOT NULL THEN z.total_pages END) page_end,
  sub.territory_page_range, sub.contact_count, ev.metadata->>'status' status,
  (s.id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM zt_segments o
    WHERE o.congregation_id=$1 AND o.zipcode_id=s.zipcode_id AND o.id<s.id)) first_in_zip
FROM ev
LEFT JOIN contact_packages cp ON ev.target_type='contact_package' AND cp.id::text=ev.target_id AND cp.congregation_id=$1
LEFT JOIN zt_segments s ON s.congregation_id=$1
  AND s.id::text = CASE WHEN ev.target_type='segment' THEN ev.target_id ELSE cp.segment_id::text END
LEFT JOIN zt_zipcodes z ON z.congregation_id=$1
  AND z.id::text = CASE WHEN ev.target_type='zipcode' THEN ev.target_id ELSE s.zipcode_id::text END
LEFT JOIN submissions sub ON ev.target_type='submission' AND sub.id::text=ev.target_id AND sub.congregation_id=$1
LEFT JOIN users u ON u.id=ev.actor_user_id
LEFT JOIN congregation_memberships m ON m.user_id=ev.actor_user_id AND m.congregation_id=$1
LEFT JOIN users tu ON tu.id = CASE WHEN ev.metadata->>'assignedToUserId' ~ '^[0-9]+$' THEN (ev.metadata->>'assignedToUserId')::bigint END
LEFT JOIN congregation_memberships tm ON tm.user_id=tu.id AND tm.congregation_id=$1
WHERE ev.kind = ANY($2::text[])
  AND ($3::timestamptz IS NULL OR (ev.at, ev.key) < ($3::timestamptz, $4::text))
  AND ($5::bigint IS NULL OR ev.actor_user_id=$5)
ORDER BY ev.at DESC, ev.key DESC
LIMIT $6`

export async function GET(req: NextRequest, { params }: RouteContext) {
  try {
    assertMultiTenantEnabled()
    const auth = await requireCongregationAdmin(params.slug)
    const search = req.nextUrl.searchParams
    const kinds = ACTIVITY_FILTERS[activityFilter(search.get("filter"))] ?? ALL_KINDS
    const cursor = decodeCursor(search.get("cursor"))
    const memberId = integer(search.get("member"))
    const result = await pool.query(ACTIVITY_SQL,
      [auth.congregation.id, kinds, cursor?.at ?? null, cursor?.key ?? null, memberId, PAGE_SIZE + 1])
    const rows = result.rows.slice(0, PAGE_SIZE)
    const last = rows[rows.length - 1]
    const events = rows.map((row) => ({
      id: String(row.key),
      at: new Date(row.at).toISOString(),
      kind: row.kind as ActivityKind,
      actor: { id: row.actor_user_id == null ? null : Number(row.actor_user_id), name: String(row.actor_name) },
      targetName: row.target_name ?? null,
      packageName: row.package_name ?? null,
      zipcode: row.zipcode ?? null,
      city: row.city ?? null,
      pageStart: row.page_start == null ? null : Number(row.page_start),
      pageEnd: row.page_end == null ? null : Number(row.page_end),
      pageRange: row.territory_page_range || null,
      contactCount: row.contact_count == null ? null : Number(row.contact_count),
      status: row.status ?? null,
      firstInZip: CLAIM_KINDS.has(row.kind) && Boolean(row.first_in_zip),
    }))
    return NextResponse.json({
      events,
      nextCursor: result.rows.length > PAGE_SIZE && last ? encodeCursor({ at: new Date(last.at).toISOString(), key: String(last.key) }) : null,
    })
  } catch (error) {
    return apiError(error)
  }
}
