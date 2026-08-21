import { NextRequest, NextResponse } from "next/server"
import { pool } from "@/lib/db"
import { auditEvent, requireCongregationAdmin, validateMutationOrigin } from "@/lib/auth"
import { apiError, assertMultiTenantEnabled, integer, RouteContext } from "../../../_shared"
import { parseContactRefs, updateContactStatus, updateManyStatusesAtomic } from "../_contacts"

const normalize = (value: string) => (value || "").toLowerCase().replace(/\s+/g, " ").trim()

export async function GET(_req: NextRequest, { params }: RouteContext) {
  try {
    assertMultiTenantEnabled()
    const auth = await requireCongregationAdmin(params.slug)
    const result = await pool.query(
      `SELECT s.id submission_id, s.user_id, s.submitted_at, c->>'id' contact_id,
              c->>'fullName' full_name, c->>'address' address, c->>'city' city,
              c->>'zipcode' zipcode, c->>'phone' phone, c->>'notes' notes
       FROM submissions s, jsonb_array_elements(s.contacts) c
       WHERE s.congregation_id = $1 AND s.archived = FALSE AND c->>'status' = 'Potentially French'`,
      [auth.congregation.id],
    )
    const addressCounts = new Map<string, number>()
    const nameCounts = new Map<string, number>()
    const keyed = result.rows.map((row: any) => {
      const addressKey = normalize(`${row.address || ""} ${row.city || ""} ${row.zipcode || ""}`)
      const nameKey = normalize(row.full_name || "")
      if (addressKey) addressCounts.set(addressKey, (addressCounts.get(addressKey) || 0) + 1)
      if (nameKey) nameCounts.set(nameKey, (nameCounts.get(nameKey) || 0) + 1)
      return { row, addressKey, nameKey }
    })
    const contacts = keyed.map(({ row, addressKey, nameKey }: any) => ({
      submissionId: row.submission_id, contactId: row.contact_id, userId: row.user_id,
      submittedAt: row.submitted_at, fullName: row.full_name || "", address: row.address || "",
      city: row.city || "", zipcode: row.zipcode || "", phone: row.phone || "", notes: row.notes || "",
      duplicateAddressCount: addressKey ? addressCounts.get(addressKey) || 1 : 1,
      duplicateNameCount: nameKey ? nameCounts.get(nameKey) || 1 : 1,
    })).sort((a: any, b: any) => Math.max(b.duplicateAddressCount, b.duplicateNameCount) -
      Math.max(a.duplicateAddressCount, a.duplicateNameCount) || a.fullName.localeCompare(b.fullName))
    return NextResponse.json({ contacts, totalCount: contacts.length,
      duplicateCount: contacts.filter((contact: any) => contact.duplicateAddressCount > 1 || contact.duplicateNameCount > 1).length })
  } catch (error) { return apiError(error) }
}

export async function PATCH(req: NextRequest, { params }: RouteContext) {
  try {
    assertMultiTenantEnabled()
    validateMutationOrigin(req)
    const auth = await requireCongregationAdmin(params.slug)
    const body = await req.json()
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
