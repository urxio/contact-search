import type { PoolClient } from "pg"

export type SegmentConflict = {
  segmentId: number
  owner: string
  ownerUserId: number | null
  pageStart: number
  pageEnd: number
  status: string
  packageName: string | null
}

export class SegmentConflictError extends Error {
  status = 409 as const
  constructor(public conflict: SegmentConflict) {
    super(`Pages ${conflict.pageStart}-${conflict.pageEnd} are already covered${conflict.owner ? ` by ${conflict.owner}` : ""}.`)
  }
}

/**
 * Serializes range writes for one congregation/ZIP and rejects inclusive overlap.
 * Call inside a transaction, immediately before inserting or updating a segment.
 */
export async function assertNoSegmentConflict(client: PoolClient, input: {
  congregationId: number
  zipcodeId: number
  pageStart: number
  pageEnd: number
  excludeSegmentId?: number | null
}) {
  await client.query(
    `SELECT pg_advisory_xact_lock(hashtextextended($1::text || ':' || $2::text,0))`,
    [input.congregationId, input.zipcodeId],
  )
  const result = await client.query(
    `SELECT s.id, s.owner, s.owner_user_id, s.page_start,
            COALESCE(s.page_end,z.total_pages) page_end, s.status,
            CASE WHEN cp.visibility='shared' THEN cp.name END package_name
       FROM zt_segments s
       JOIN zt_zipcodes z ON z.id=s.zipcode_id AND z.congregation_id=s.congregation_id
       LEFT JOIN contact_packages cp ON cp.segment_id=s.id AND cp.congregation_id=s.congregation_id
      WHERE s.congregation_id=$1 AND s.zipcode_id=$2
        AND ($5::int IS NULL OR s.id<>$5)
        AND s.page_start <= $4
        AND COALESCE(s.page_end,z.total_pages) >= $3
      ORDER BY s.page_start,s.id
      LIMIT 1`,
    [input.congregationId, input.zipcodeId, input.pageStart, input.pageEnd, input.excludeSegmentId ?? null],
  )
  const row = result.rows[0]
  if (!row) return
  throw new SegmentConflictError({
    segmentId: Number(row.id), owner: row.owner || "", ownerUserId: row.owner_user_id == null ? null : Number(row.owner_user_id),
    pageStart: Number(row.page_start), pageEnd: Number(row.page_end), status: row.status, packageName: row.package_name || null,
  })
}
