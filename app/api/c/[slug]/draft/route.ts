import { NextRequest, NextResponse } from "next/server"
import { DraftConflictError, serializeDraft as serialize } from "@/lib/contact-packages"
import { PackageAssignmentError, saveMemberDraft } from "@/lib/package-drafts"
import { DraftEditSessionConflict, isDraftEditSessionId, assertDraftEditSession } from "@/lib/draft-edit-sessions"
import { pool } from "@/lib/db"
import { requireMembership, validateMutationOrigin } from "@/lib/auth"
import { apiError, assertMultiTenantEnabled, RouteContext } from "../../_shared"

export async function GET(_req: NextRequest, { params }: RouteContext) {
  try {
    assertMultiTenantEnabled()
    const auth = await requireMembership(params.slug)
    const result = await pool.query(
      `SELECT contacts, global_notes, territory_zipcode, territory_page_range,
              last_verified_contact_id, revision, updated_at, package_id, package_assignment_revision
       FROM contact_drafts WHERE congregation_id = $1 AND user_id = $2`,
      [auth.congregation.id, auth.user.id],
    )
    return NextResponse.json(serialize(result.rows[0]))
  } catch (error) {
    return apiError(error)
  }
}

export async function PUT(req: NextRequest, { params }: RouteContext) {
  try {
    assertMultiTenantEnabled()
    validateMutationOrigin(req)
    const auth = await requireMembership(params.slug)
    const body = await req.json()
    if (!Array.isArray(body?.contacts) || !Number.isInteger(body?.revision) || body.revision < 0 || !isDraftEditSessionId(body?.draftSessionId)) {
      return NextResponse.json({ error: "Contacts and revision are required." }, { status: 400 })
    }

    if (body.packageId != null && (!Number.isSafeInteger(body.packageId) || body.packageId < 1)) {
      return NextResponse.json({ error: "Invalid Excel." }, { status: 400 })
    }
    const client = await pool.connect()
    try {
      await client.query("BEGIN")
      const draft = await saveMemberDraft(client, {
        userId: auth.user.id, congregationId: auth.congregation.id, revision: body.revision,
        draftSessionId: body.draftSessionId,
        contacts: body.contacts, globalNotes: String(body.globalNotes ?? ""),
        territoryZipcode: String(body.territoryZipcode ?? ""), territoryPageRange: String(body.territoryPageRange ?? ""),
        lastVerifiedId: body.lastVerifiedId ?? body.lastVerifiedContactId ?? null, packageId: body.packageId,
        packageAssignmentRevision: body.packageAssignmentRevision,
      })
      await client.query("COMMIT")
      return NextResponse.json(draft)
    } catch (error) {
      await client.query("ROLLBACK")
      if (error instanceof DraftEditSessionConflict) {
        return NextResponse.json({ error: error.message, code: error.code, server: error.server }, { status: 409 })
      }
      if (error instanceof DraftConflictError || error instanceof PackageAssignmentError) {
        return NextResponse.json({ error: error.message, server: error.server }, { status: 409 })
      }
      throw error
    } finally { client.release() }
  } catch (error) {
    return apiError(error)
  }
}

export async function DELETE(req: NextRequest, { params }: RouteContext) {
  try {
    assertMultiTenantEnabled()
    validateMutationOrigin(req)
    const auth = await requireMembership(params.slug)
    const body = await req.json()
    if (!isDraftEditSessionId(body?.draftSessionId)) {
      return NextResponse.json({ error: "A valid editing session is required." }, { status: 400 })
    }
    const client = await pool.connect()
    try {
      await client.query("BEGIN")
      await assertDraftEditSession(client, {
        userId: auth.user.id,
        congregationId: auth.congregation.id,
        sessionId: body.draftSessionId,
      })
      await client.query(
        `DELETE FROM contact_drafts WHERE congregation_id = $1 AND user_id = $2`,
        [auth.congregation.id, auth.user.id],
      )
      await client.query("COMMIT")
      return NextResponse.json({ success: true })
    } catch (error) {
      await client.query("ROLLBACK").catch(() => undefined)
      if (error instanceof DraftEditSessionConflict) {
        return NextResponse.json({ error: error.message, code: error.code, server: error.server }, { status: 409 })
      }
      throw error
    } finally { client.release() }
  } catch (error) {
    return apiError(error)
  }
}
