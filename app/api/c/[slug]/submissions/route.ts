import { NextRequest, NextResponse } from "next/server"
import { pool } from "@/lib/db"
import { auditEvent, requireMembership, validateMutationOrigin } from "@/lib/auth"
import { apiError, assertMultiTenantEnabled, integer, RouteContext } from "../../_shared"

type Contact = { status?: string; [key: string]: unknown }

export async function POST(req: NextRequest, { params }: RouteContext) {
  try {
    assertMultiTenantEnabled()
    validateMutationOrigin(req)
    const auth = await requireMembership(params.slug)
    const body = await req.json()
    const requestedRevision = integer(body?.draftRevision)
    if (!requestedRevision) {
      return NextResponse.json({ error: "A valid draftRevision is required." }, { status: 400 })
    }

    const client = await pool.connect()
    try {
      await client.query("BEGIN")
      const draftResult = await client.query(
        `SELECT contacts, global_notes, territory_zipcode, territory_page_range, revision
         FROM contact_drafts
         WHERE congregation_id = $1 AND user_id = $2
         FOR UPDATE`,
        [auth.congregation.id, auth.user.id],
      )
      const draft = draftResult.rows[0]
      if (!draft) {
        await client.query("ROLLBACK")
        return NextResponse.json({ error: "Draft not found." }, { status: 404 })
      }
      if (draft.revision !== requestedRevision) {
        await client.query("ROLLBACK")
        return NextResponse.json(
          { error: "Draft conflict.", serverRevision: draft.revision },
          { status: 409 },
        )
      }

      const contacts = Array.isArray(draft.contacts) ? draft.contacts as Contact[] : []
      const count = (status: string) => contacts.filter((contact) => contact.status === status).length
      const displayName = auth.membership?.displayName || auth.user.displayName
      const inserted = await client.query(
        `INSERT INTO submissions
          (congregation_id, owner_user_id, user_id, contact_count, potentially_french,
           not_french, duplicate, not_checked, global_notes, territory_zipcode,
           territory_page_range, contacts)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
         RETURNING id, submitted_at`,
        [
          auth.congregation.id,
          auth.user.id,
          displayName,
          contacts.length,
          count("Potentially French"),
          count("Not French"),
          count("Duplicate"),
          count("Not checked"),
          draft.global_notes || "",
          draft.territory_zipcode || "",
          draft.territory_page_range || "",
          JSON.stringify(contacts),
        ],
      )
      await client.query("COMMIT")
      await auditEvent({
        actorUserId: auth.user.id,
        congregationId: auth.congregation.id,
        action: "submission.created",
        targetType: "submission",
        targetId: String(inserted.rows[0].id),
        metadata: { draftRevision: requestedRevision, contactCount: contacts.length },
      })
      return NextResponse.json({ success: true, ...inserted.rows[0] }, { status: 201 })
    } catch (error) {
      await client.query("ROLLBACK")
      throw error
    } finally {
      client.release()
    }
  } catch (error) {
    return apiError(error)
  }
}
