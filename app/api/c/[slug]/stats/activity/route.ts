import { NextRequest, NextResponse } from "next/server"

import { requireMembership, validateMutationOrigin } from "@/lib/auth"
import { pool } from "@/lib/db"
import { apiError, assertMultiTenantEnabled, RouteContext } from "../../../_shared"

const BUCKET_MS = 30_000
const MAX_CLOCK_SKEW_MS = 5 * 60_000

export async function POST(request: NextRequest, { params }: RouteContext) {
  try {
    assertMultiTenantEnabled()
    validateMutationOrigin(request)
    const auth = await requireMembership(params.slug)
    const body = await request.json()
    const startedAt = new Date(String(body?.bucketStartedAt ?? ""))
    const activeSeconds = Number(body?.activeSeconds)
    if (!Number.isInteger(activeSeconds) || activeSeconds < 1 || activeSeconds > 30 || Number.isNaN(startedAt.getTime())) {
      return NextResponse.json({ error: "A valid activity bucket is required." }, { status: 400 })
    }
    const bucketTime = Math.floor(startedAt.getTime() / BUCKET_MS) * BUCKET_MS
    if (Math.abs(Date.now() - bucketTime) > MAX_CLOCK_SKEW_MS) {
      return NextResponse.json({ error: "Activity bucket is outside the accepted time window." }, { status: 400 })
    }
    await pool.query(
      `INSERT INTO search_activity_buckets(congregation_id,user_id,bucket_started_at,active_seconds)
       VALUES($1,$2,$3,$4)
       ON CONFLICT(congregation_id,user_id,bucket_started_at) DO UPDATE
       SET active_seconds=GREATEST(search_activity_buckets.active_seconds,EXCLUDED.active_seconds),updated_at=NOW()`,
      [auth.congregation.id, auth.user.id, new Date(bucketTime), activeSeconds],
    )
    return NextResponse.json({ ok: true })
  } catch (error) {
    return apiError(error)
  }
}
