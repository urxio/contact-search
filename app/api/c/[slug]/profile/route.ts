import { NextRequest, NextResponse } from "next/server"

import { auditEvent, requireMembership, validateMutationOrigin } from "@/lib/auth"
import { pool } from "@/lib/db"
import { apiError, assertMultiTenantEnabled, RouteContext } from "../../_shared"

const validTheme = new Set(["light", "dark"])
const validWorkspaceView = new Set(["search", "team", "stats"])

export async function GET(_request: NextRequest, { params }: RouteContext) {
  try {
    assertMultiTenantEnabled()
    const auth = await requireMembership(params.slug)
    return NextResponse.json({
      profile: {
        email: auth.user.email,
        displayName: auth.user.displayName,
        congregationDisplayName: auth.membership?.displayName ?? auth.user.displayName,
        role: auth.membership?.role ?? "admin",
        preferences: auth.user.preferences ?? {},
      },
    })
  } catch (error) {
    return apiError(error)
  }
}

export async function PATCH(request: NextRequest, { params }: RouteContext) {
  try {
    assertMultiTenantEnabled()
    validateMutationOrigin(request)
    const auth = await requireMembership(params.slug)
    const body = await request.json()

    const displayName = body.displayName === undefined ? undefined : String(body.displayName).trim()
    const congregationDisplayName = body.congregationDisplayName === undefined
      ? undefined
      : String(body.congregationDisplayName).trim()
    if (displayName !== undefined && (displayName.length < 2 || displayName.length > 80)) {
      return NextResponse.json({ error: "Your name must be between 2 and 80 characters." }, { status: 400 })
    }
    if (congregationDisplayName !== undefined && (congregationDisplayName.length < 2 || congregationDisplayName.length > 80)) {
      return NextResponse.json({ error: "Your congregation name must be between 2 and 80 characters." }, { status: 400 })
    }
    if (congregationDisplayName !== undefined && !auth.membership) {
      return NextResponse.json({ error: "A congregation membership is required to change this name." }, { status: 404 })
    }

    const preferences: Record<string, string> = {}
    if (body.preferences?.theme !== undefined) {
      if (!validTheme.has(body.preferences.theme)) {
        return NextResponse.json({ error: "Theme must be light or dark." }, { status: 400 })
      }
      preferences.theme = body.preferences.theme
    }
    if (body.preferences?.defaultWorkspaceView !== undefined) {
      if (!validWorkspaceView.has(body.preferences.defaultWorkspaceView)) {
        return NextResponse.json({ error: "Default workspace view must be Search, Team Progress, or Personal Stats." }, { status: 400 })
      }
      preferences.defaultWorkspaceView = body.preferences.defaultWorkspaceView
    }

    const updatedFields = [
      ...(displayName !== undefined ? ["displayName"] : []),
      ...(congregationDisplayName !== undefined ? ["congregationDisplayName"] : []),
      ...Object.keys(preferences).map((key) => `preferences.${key}`),
    ]

    // Preferences affect one user row, so save them and their audit event in
    // one atomic statement. This keeps the common settings interaction fast
    // over a serverless database connection.
    if (displayName === undefined && congregationDisplayName === undefined && Object.keys(preferences).length) {
      const result = await pool.query(
        `WITH updated AS (
           UPDATE users
              SET preferences=preferences || $2::jsonb,updated_at=NOW()
            WHERE id=$1
        RETURNING preferences
         ), audited AS (
           INSERT INTO audit_events(actor_user_id,congregation_id,action,target_type,target_id,metadata)
           SELECT $1,$3,'profile.updated','user',$1::text,$4::jsonb FROM updated
         )
         SELECT preferences FROM updated`,
        [
          auth.user.id,
          JSON.stringify(preferences),
          auth.congregation.id,
          JSON.stringify({ fields: updatedFields }),
        ],
      )
      return NextResponse.json({ ok: true, preferences: result.rows[0]?.preferences ?? preferences })
    }

    const client = await pool.connect()
    try {
      await client.query("BEGIN")
      if (displayName !== undefined || Object.keys(preferences).length) {
        await client.query(
          `UPDATE users
              SET display_name=COALESCE($2,display_name),
                  preferences=preferences || $3::jsonb,
                  updated_at=NOW()
            WHERE id=$1`,
          [auth.user.id, displayName ?? null, JSON.stringify(preferences)],
        )
      }
      if (congregationDisplayName !== undefined) {
        await client.query(
          `UPDATE congregation_memberships
              SET display_name=$3,updated_at=NOW()
            WHERE user_id=$1 AND congregation_id=$2 AND status='active'`,
          [auth.user.id, auth.congregation.id, congregationDisplayName],
        )
      }
      await client.query("COMMIT")
    } catch (error) {
      await client.query("ROLLBACK")
      throw error
    } finally {
      client.release()
    }

    await auditEvent({
      actorUserId: auth.user.id,
      congregationId: auth.congregation.id,
      action: "profile.updated",
      targetType: "user",
      targetId: String(auth.user.id),
      metadata: { fields: updatedFields },
    })

    return NextResponse.json({ ok: true, preferences })
  } catch (error) {
    return apiError(error)
  }
}
