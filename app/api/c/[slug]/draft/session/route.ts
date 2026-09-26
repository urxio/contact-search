import { NextRequest, NextResponse } from "next/server"
import { pool } from "@/lib/db"
import { requireMembership, validateMutationOrigin } from "@/lib/auth"
import { claimDraftEditSession, isDraftEditSessionId } from "@/lib/draft-edit-sessions"
import { apiError, assertMultiTenantEnabled, RouteContext } from "../../../_shared"

export async function POST(req: NextRequest, { params }: RouteContext) {
  try {
    assertMultiTenantEnabled()
    validateMutationOrigin(req)
    const auth = await requireMembership(params.slug)
    const body = await req.json()
    const action = body?.action
    const sessionId = body?.sessionId
    if ((action !== "open" && action !== "switch") || !isDraftEditSessionId(sessionId)) {
      return NextResponse.json({ error: "A valid editing session is required." }, { status: 400 })
    }

    const client = await pool.connect()
    try {
      await client.query("BEGIN")
      const result = await claimDraftEditSession(client, {
        userId: auth.user.id,
        congregationId: auth.congregation.id,
        sessionId,
        switchEditing: action === "switch",
      })
      await client.query("COMMIT")
      if (!result.acquired) {
        return NextResponse.json({
          error: "This Excel is being edited on another device.",
          code: "DRAFT_EDITING_ELSEWHERE",
          server: result.server,
        }, { status: 409 })
      }
      return NextResponse.json({ draft: result.draft })
    } catch (error) {
      await client.query("ROLLBACK").catch(() => undefined)
      throw error
    } finally {
      client.release()
    }
  } catch (error) {
    return apiError(error)
  }
}
