import { NextRequest, NextResponse } from "next/server"
import { pool } from "@/lib/db"
import { requireMembership, validateMutationOrigin } from "@/lib/auth"
import { apiError, assertMultiTenantEnabled, RouteContext } from "../../../_shared"

const UPDATE_ID = /^[a-z0-9][a-z0-9-]{0,63}$/

export async function POST(req: NextRequest, { params }: RouteContext) {
  try {
    assertMultiTenantEnabled(); validateMutationOrigin(req)
    const auth = await requireMembership(params.slug)
    const body = await req.json().catch(() => null)
    const updateId = typeof body?.updateId === "string" ? body.updateId : ""
    if (!UPDATE_ID.test(updateId)) return NextResponse.json({ error: "A valid update id is required." }, { status: 400 })
    // Idempotent per-user append, so the card stays dismissed on every device.
    await pool.query(
      `UPDATE users
          SET preferences=jsonb_set(preferences,'{seenUpdates}',
                CASE WHEN COALESCE(preferences->'seenUpdates','[]'::jsonb) ? $2::text
                     THEN COALESCE(preferences->'seenUpdates','[]'::jsonb)
                     ELSE COALESCE(preferences->'seenUpdates','[]'::jsonb) || to_jsonb($2::text) END,true)
        WHERE id=$1`,
      [auth.user.id, updateId],
    )
    return NextResponse.json({ ok: true })
  } catch (error) { return apiError(error) }
}
