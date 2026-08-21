import { NextRequest, NextResponse } from "next/server"
import { pool } from "@/lib/db"
import { auditEvent, requireCongregationAdmin, validateMutationOrigin } from "@/lib/auth"
import { getDictionaryFile } from "@/lib/github"
import { normalizeName } from "@/utils/french-name-detection"
import { apiError, assertMultiTenantEnabled, integer, RouteContext } from "../../../_shared"
import { parseContactRefs, recomputeCounters, updateContactStatus, updateManyStatusesAtomic } from "../_contacts"

const normalizeAddress = (address: string | null, city: string | null, zipcode: string | null) =>
  `${address || ""} ${city || ""} ${zipcode || ""}`.toLowerCase().replace(/\s+/g, " ").trim()

async function scan(congregationId: number) {
  const [contacts, dictionary, dismissed, frenchAddresses] = await Promise.all([
    pool.query(
      `SELECT s.id submission_id, s.user_id, s.submitted_at, c->>'id' contact_id,
              c->>'fullName' full_name, c->>'lastName' last_name, c->>'address' address,
              c->>'city' city, c->>'zipcode' zipcode, c->>'phone' phone, c->>'status' status
       FROM submissions s, jsonb_array_elements(s.contacts) c
       WHERE s.congregation_id = $1 AND s.archived = FALSE
         AND COALESCE(c->>'status','') NOT IN ('Potentially French','Duplicate')`,
      [congregationId],
    ),
    getDictionaryFile(),
    pool.query(
      `SELECT submission_id, contact_id FROM dismissed_dictionary_scan_matches WHERE congregation_id = $1`,
      [congregationId],
    ),
    pool.query(
      `SELECT c->>'address' address, c->>'city' city, c->>'zipcode' zipcode
       FROM submissions s, jsonb_array_elements(s.contacts) c
       WHERE s.congregation_id = $1 AND s.archived = FALSE AND c->>'status' = 'Potentially French'`,
      [congregationId],
    ),
  ])
  const names = new Set(dictionary.lines)
  const hidden = new Set(dismissed.rows.map((row: any) => `${row.submission_id}:${row.contact_id}`))
  const coveredAddresses = new Set(frenchAddresses.rows.map((row: any) => normalizeAddress(row.address, row.city, row.zipcode)).filter(Boolean))
  const possible = contacts.rows.map((row: any) => {
    const parts = String(row.full_name || "").trim().split(/\s+/)
    const lastName = String(row.last_name || parts.at(-1) || "")
    return { row, lastName, normalized: normalizeName(lastName) }
  }).filter(({ row, normalized }: any) => normalized && names.has(normalized) &&
    !hidden.has(`${row.submission_id}:${row.contact_id}`) &&
    !coveredAddresses.has(normalizeAddress(row.address, row.city, row.zipcode)))
  const counts = new Map<string, number>()
  for (const { row } of possible) {
    const key = normalizeAddress(row.address, row.city, row.zipcode)
    if (key) counts.set(key, (counts.get(key) || 0) + 1)
  }
  const matches = possible.map(({ row, lastName, normalized }: any) => ({
    submissionId: row.submission_id, contactId: row.contact_id, userId: row.user_id,
    submittedAt: row.submitted_at, fullName: row.full_name || "", lastName,
    matchedName: normalized, address: row.address || "", city: row.city || "",
    zipcode: row.zipcode || "", phone: row.phone || "", status: row.status || "Not checked",
    duplicateAddressCount: counts.get(normalizeAddress(row.address, row.city, row.zipcode)) || 1,
  })).sort((a: any, b: any) => a.lastName.localeCompare(b.lastName))
  return { matches, totalScanned: contacts.rowCount || 0 }
}

export async function GET(_req: NextRequest, { params }: RouteContext) {
  try {
    assertMultiTenantEnabled()
    const auth = await requireCongregationAdmin(params.slug)
    const result = await scan(auth.congregation.id)
    return NextResponse.json({ ...result, matchCount: result.matches.length })
  } catch (error) { return apiError(error) }
}

export async function POST(req: NextRequest, { params }: RouteContext) {
  try {
    assertMultiTenantEnabled()
    validateMutationOrigin(req)
    const auth = await requireCongregationAdmin(params.slug)
    const result = await scan(auth.congregation.id)
    const reviewed = await pool.query(
      `UPDATE submissions SET review_status = 'reviewed'
       WHERE congregation_id = $1 AND archived = FALSE AND review_status IS DISTINCT FROM 'reviewed'
       RETURNING id`,
      [auth.congregation.id],
    )
    await auditEvent({ actorUserId: auth.user.id, congregationId: auth.congregation.id,
      action: "dictionary_scan.run", targetType: "submission",
      metadata: { reviewedCount: reviewed.rowCount || 0, matchCount: result.matches.length } })
    return NextResponse.json({ ...result, matchCount: result.matches.length, reviewedCount: reviewed.rowCount || 0 })
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
      if (!contacts.length) return NextResponse.json({ error: "Choose at least one contact." }, { status: 400 })
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
    if (body.action === "dismiss") {
      const exists = await pool.query(
        `SELECT 1 FROM submissions s, jsonb_array_elements(s.contacts) c
         WHERE s.id = $1 AND s.congregation_id = $2 AND c->>'id' = $3`,
        [submissionId, auth.congregation.id, contactId],
      )
      if (!exists.rows[0]) return NextResponse.json({ error: "Contact not found." }, { status: 404 })
      await pool.query(
        `INSERT INTO dismissed_dictionary_scan_matches (congregation_id, submission_id, contact_id)
         VALUES ($1,$2,$3) ON CONFLICT (congregation_id, submission_id, contact_id) DO NOTHING`,
        [auth.congregation.id, submissionId, contactId],
      )
    } else if (body.action === "update") {
      const allowed = ["fullName", "lastName", "address", "city", "zipcode", "phone"]
      const fields = Object.fromEntries(Object.entries(body.fields || {})
        .filter(([key, value]) => allowed.includes(key) && typeof value === "string"))
      if (!Object.keys(fields).length) return NextResponse.json({ error: "No editable fields provided." }, { status: 400 })
      const result = await pool.query(
        `UPDATE submissions SET contacts = (SELECT jsonb_agg(CASE WHEN elem->>'id' = $3 THEN elem || $4::jsonb ELSE elem END)
         FROM jsonb_array_elements(contacts) elem)
         WHERE id = $1 AND congregation_id = $2
           AND EXISTS (SELECT 1 FROM jsonb_array_elements(contacts) elem WHERE elem->>'id' = $3)
         RETURNING id`,
        [submissionId, auth.congregation.id, contactId, JSON.stringify(fields)],
      )
      if (!result.rows[0]) return NextResponse.json({ error: "Contact not found." }, { status: 404 })
    } else {
      const status = body.action === "markDuplicate" ? "Duplicate" : "Potentially French"
      const client = await pool.connect()
      try {
        await client.query("BEGIN")
        if (!await updateContactStatus(client, auth.congregation.id, { submissionId, contactId }, status)) {
          await client.query("ROLLBACK")
          return NextResponse.json({ error: "Contact not found." }, { status: 404 })
        }
        await client.query("COMMIT")
      } catch (error) { await client.query("ROLLBACK"); throw error } finally { client.release() }
    }
    await auditEvent({ actorUserId: auth.user.id, congregationId: auth.congregation.id,
      action: `dictionary_scan.${String(body.action || "markFrench")}`,
      targetType: "submission_contact", targetId: `${submissionId}:${contactId}` })
    return NextResponse.json({ success: true })
  } catch (error) { return apiError(error) }
}
