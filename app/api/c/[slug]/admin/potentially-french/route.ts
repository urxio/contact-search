import { NextRequest, NextResponse } from "next/server"
import { pool } from "@/lib/db"
import { auditEvent, requireCongregationAdmin, validateMutationOrigin } from "@/lib/auth"
import { apiError, assertMultiTenantEnabled, integer, RouteContext } from "../../../_shared"
import { parseContactRefs, updateContactStatus, updateManyStatusesAtomic } from "../_contacts"
import { createFrenchExport, isFrenchExportAction, listFrenchContacts, parseStateValue, updateFrenchExport } from "@/lib/french-exports"

export async function GET(_req: NextRequest, { params }: RouteContext) {
  try {
    assertMultiTenantEnabled()
    const auth = await requireCongregationAdmin(params.slug)
    return NextResponse.json(await listFrenchContacts(pool, auth.congregation.id))
  } catch (error) { return apiError(error) }
}

// POST — records an export batch for the chosen contacts and returns the rows
// to write into the CSV. Body: { contacts: ContactRef[], stateValue?: string }
export async function POST(req: NextRequest, { params }: RouteContext) {
  try {
    assertMultiTenantEnabled()
    validateMutationOrigin(req)
    const auth = await requireCongregationAdmin(params.slug)
    const body = await req.json()
    const contacts = parseContactRefs(body.contacts)
    if (!contacts.length) return NextResponse.json({ error: "Choose at least one contact to export." }, { status: 400 })
    const stateValue = parseStateValue(body.stateValue)
    if (stateValue === null) return NextResponse.json({ error: "State must be 20 characters or fewer." }, { status: 400 })
    const client = await pool.connect()
    let batch
    try {
      batch = await createFrenchExport(client, { scope: auth.congregation.id, userId: auth.user.id, contacts, stateValue })
    } finally { client.release() }
    if (!batch) return NextResponse.json({ error: "Those contacts were already exported or are no longer Potentially French." }, { status: 409 })
    await auditEvent({ actorUserId: auth.user.id, congregationId: auth.congregation.id,
      action: "potentially_french.exported", targetType: "french_contact_export",
      targetId: String(batch.id), metadata: { contactCount: batch.contacts.length } })
    return NextResponse.json({ export: batch })
  } catch (error) { return apiError(error) }
}

export async function PATCH(req: NextRequest, { params }: RouteContext) {
  try {
    assertMultiTenantEnabled()
    validateMutationOrigin(req)
    const auth = await requireCongregationAdmin(params.slug)
    const body = await req.json()
    if (isFrenchExportAction(body.action)) {
      const exportId = integer(body.exportId)
      if (!exportId) return NextResponse.json({ error: "Missing exportId." }, { status: 400 })
      if (!await updateFrenchExport(pool, auth.congregation.id, exportId, body.action)) {
        return NextResponse.json({ error: "Export batch not found." }, { status: 404 })
      }
      await auditEvent({ actorUserId: auth.user.id, congregationId: auth.congregation.id,
        action: `potentially_french.${body.action}`, targetType: "french_contact_export", targetId: String(exportId) })
      return NextResponse.json({ success: true })
    }
    if (body.action === "removeDuplicates") {
      const contacts = parseContactRefs(body.contacts)
      if (!contacts.length) return NextResponse.json({ error: "Choose at least one duplicate contact." }, { status: 400 })
      const client = await pool.connect()
      try {
        if (!await updateManyStatusesAtomic(client, auth.congregation.id, contacts, "Duplicate")) {
          return NextResponse.json({ error: "One or more contacts were not found." }, { status: 404 })
        }
      } finally { client.release() }
      return NextResponse.json({ success: true, removedCount: contacts.length })
    }
    const submissionId = integer(body.submissionId)
    const contactId = String(body.contactId ?? "").trim()
    if (!submissionId || !contactId) return NextResponse.json({ error: "Missing submissionId or contactId." }, { status: 400 })
    const status = body.action === "duplicate" ? "Duplicate" : "Not French"
    const client = await pool.connect()
    try {
      await client.query("BEGIN")
      if (!await updateContactStatus(client, auth.congregation.id, { submissionId, contactId }, status)) {
        await client.query("ROLLBACK")
        return NextResponse.json({ error: "Contact not found." }, { status: 404 })
      }
      await client.query("COMMIT")
    } catch (error) { await client.query("ROLLBACK"); throw error } finally { client.release() }
    await auditEvent({ actorUserId: auth.user.id, congregationId: auth.congregation.id,
      action: "potentially_french.reclassified", targetType: "submission_contact",
      targetId: `${submissionId}:${contactId}`, metadata: { status } })
    return NextResponse.json({ success: true })
  } catch (error) { return apiError(error) }
}
