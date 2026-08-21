import { NextRequest, NextResponse } from "next/server"
import { pool } from "@/lib/db"
import { requireMembership, validateMutationOrigin } from "@/lib/auth"
import { apiError, assertMultiTenantEnabled, RouteContext } from "../../_shared"

function serialize(row: any) {
  return {
    contacts: row?.contacts || [],
    globalNotes: row?.global_notes || "",
    territoryZipcode: row?.territory_zipcode || "",
    territoryPageRange: row?.territory_page_range || "",
    lastVerifiedId: row?.last_verified_contact_id || null,
    revision: row?.revision || 0,
    updatedAt: row?.updated_at || null,
  }
}

export async function GET(_req: NextRequest, { params }: RouteContext) {
  try {
    assertMultiTenantEnabled()
    const auth = await requireMembership(params.slug)
    const result = await pool.query(
      `SELECT contacts, global_notes, territory_zipcode, territory_page_range,
              last_verified_contact_id, revision, updated_at
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
    if (!Array.isArray(body?.contacts) || !Number.isInteger(body?.revision) || body.revision < 0) {
      return NextResponse.json({ error: "Contacts and revision are required." }, { status: 400 })
    }

    const result = await pool.query(
      `INSERT INTO contact_drafts
        (user_id, congregation_id, contacts, global_notes, territory_zipcode,
         territory_page_range, last_verified_contact_id, revision, updated_at)
       SELECT $1,$2,$3,$4,$5,$6,$7,1,NOW()
       WHERE $8::int = 0 OR EXISTS (
         SELECT 1 FROM contact_drafts current
         WHERE current.user_id = $1 AND current.congregation_id = $2 AND current.revision = $8
       )
       ON CONFLICT (user_id, congregation_id) DO UPDATE SET
         contacts = EXCLUDED.contacts,
         global_notes = EXCLUDED.global_notes,
         territory_zipcode = EXCLUDED.territory_zipcode,
         territory_page_range = EXCLUDED.territory_page_range,
         last_verified_contact_id = EXCLUDED.last_verified_contact_id,
         revision = contact_drafts.revision + 1,
         updated_at = NOW()
       WHERE contact_drafts.revision = $8
       RETURNING contacts, global_notes, territory_zipcode, territory_page_range,
                 last_verified_contact_id, revision, updated_at`,
      [
        auth.user.id,
        auth.congregation.id,
        JSON.stringify(body.contacts),
        String(body.globalNotes ?? ""),
        String(body.territoryZipcode ?? ""),
        String(body.territoryPageRange ?? ""),
        body.lastVerifiedId ? String(body.lastVerifiedId) : null,
        body.revision,
      ],
    )
    if (!result.rows[0]) {
      const server = await pool.query(
        `SELECT contacts, global_notes, territory_zipcode, territory_page_range,
                last_verified_contact_id, revision, updated_at
         FROM contact_drafts WHERE congregation_id = $1 AND user_id = $2`,
        [auth.congregation.id, auth.user.id],
      )
      return NextResponse.json(
        { error: "Draft conflict.", server: serialize(server.rows[0]) },
        { status: 409 },
      )
    }
    return NextResponse.json(serialize(result.rows[0]))
  } catch (error) {
    return apiError(error)
  }
}

export async function DELETE(req: NextRequest, { params }: RouteContext) {
  try {
    assertMultiTenantEnabled()
    validateMutationOrigin(req)
    const auth = await requireMembership(params.slug)
    await pool.query(
      `DELETE FROM contact_drafts WHERE congregation_id = $1 AND user_id = $2`,
      [auth.congregation.id, auth.user.id],
    )
    return NextResponse.json({ success: true })
  } catch (error) {
    return apiError(error)
  }
}
