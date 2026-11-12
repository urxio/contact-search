// Potentially French contacts move through three stages in the admin panel:
//   To export → Exported (a CSV batch was downloaded) → Archived (batch confirmed).
// A contact keeps its "Potentially French" status the whole time, so stats and
// counters are untouched; export state lives in french_contact_exports/_items.

import type { ContactRef } from "@/lib/submission-contacts"

type DatabaseClient = {
  query: (text: string, values?: unknown[]) => Promise<{ rows: any[]; rowCount?: number | null }>
}

/** null = legacy single-tenant admin (no congregation scope). */
export type ExportScope = number | null

export type FrenchContact = {
  submissionId: number
  contactId: string
  userId: string
  submittedAt: string
  fullName: string
  address: string
  city: string
  zipcode: string
  phone: string
  notes: string
}

export type FrenchContactToExport = FrenchContact & {
  duplicateAddressCount: number
  duplicateNameCount: number
  /** Matches a contact already in an export batch by address or name. */
  exportedMatch: "address" | "name" | null
}

export type FrenchExportBatch = {
  id: number
  createdAt: string
  archivedAt: string | null
  stateValue: string
  createdBy: string | null
  contacts: FrenchContact[]
}

export const MAX_STATE_VALUE_LENGTH = 20

const normalize = (value: string) => (value || "").toLowerCase().replace(/\s+/g, " ").trim()
export const frenchAddressKey = (contact: Pick<FrenchContact, "address" | "city" | "zipcode">) =>
  normalize(`${contact.address || ""} ${contact.city || ""} ${contact.zipcode || ""}`)
export const frenchNameKey = (contact: Pick<FrenchContact, "fullName">) => normalize(contact.fullName || "")

function toContact(row: any): FrenchContact {
  return {
    submissionId: Number(row.submissionId ?? row.submission_id),
    contactId: String(row.contactId ?? row.contact_id ?? ""),
    userId: String(row.userId ?? row.user_id ?? ""),
    submittedAt: row.submittedAt ?? row.submitted_at ?? "",
    fullName: row.fullName ?? row.full_name ?? "",
    address: row.address ?? "",
    city: row.city ?? "",
    zipcode: row.zipcode ?? "",
    phone: row.phone ?? "",
    notes: row.notes ?? "",
  }
}

export function withDuplicateCounts(contacts: FrenchContact[], exported: FrenchContact[]): FrenchContactToExport[] {
  const addressCounts = new Map<string, number>()
  const nameCounts = new Map<string, number>()
  for (const contact of contacts) {
    const addressKey = frenchAddressKey(contact)
    const nameKey = frenchNameKey(contact)
    if (addressKey) addressCounts.set(addressKey, (addressCounts.get(addressKey) || 0) + 1)
    if (nameKey) nameCounts.set(nameKey, (nameCounts.get(nameKey) || 0) + 1)
  }
  const exportedAddresses = new Set(exported.map(frenchAddressKey).filter(Boolean))
  const exportedNames = new Set(exported.map(frenchNameKey).filter(Boolean))
  return contacts.map((contact): FrenchContactToExport => {
    const addressKey = frenchAddressKey(contact)
    const nameKey = frenchNameKey(contact)
    return {
      ...contact,
      duplicateAddressCount: addressKey ? addressCounts.get(addressKey) || 1 : 1,
      duplicateNameCount: nameKey ? nameCounts.get(nameKey) || 1 : 1,
      exportedMatch: addressKey && exportedAddresses.has(addressKey) ? "address"
        : nameKey && exportedNames.has(nameKey) ? "name" : null,
    }
  }).sort((a, b) => Math.max(b.duplicateAddressCount, b.duplicateNameCount) -
    Math.max(a.duplicateAddressCount, a.duplicateNameCount) || a.fullName.localeCompare(b.fullName))
}

export async function listFrenchContacts(db: DatabaseClient, scope: ExportScope) {
  const submissionScope = scope === null ? "" : " AND s.congregation_id = $1"
  const [pending, batches] = await Promise.all([
    db.query(
      `SELECT s.id submission_id, s.user_id, s.submitted_at, c->>'id' contact_id,
              c->>'fullName' full_name, c->>'address' address, c->>'city' city,
              c->>'zipcode' zipcode, c->>'phone' phone, c->>'notes' notes
       FROM submissions s, jsonb_array_elements(s.contacts) c
       WHERE s.archived = FALSE AND c->>'status' = 'Potentially French'${submissionScope}
         AND NOT EXISTS (SELECT 1 FROM french_contact_export_items i
                         WHERE i.submission_id = s.id AND i.contact_id = c->>'id')`,
      scope === null ? [] : [scope],
    ),
    db.query(
      `SELECT e.id, e.created_at, e.archived_at, e.state_value, u.display_name created_by,
              COALESCE(jsonb_agg(i.contact ORDER BY i.contact->>'fullName')
                FILTER (WHERE i.export_id IS NOT NULL), '[]'::jsonb) contacts
       FROM french_contact_exports e
       LEFT JOIN users u ON u.id = e.created_by_user_id
       LEFT JOIN french_contact_export_items i ON i.export_id = e.id
       WHERE e.congregation_id IS NOT DISTINCT FROM $1
       GROUP BY e.id, u.display_name
       ORDER BY e.created_at DESC, e.id DESC`,
      [scope],
    ),
  ])
  const exports: FrenchExportBatch[] = batches.rows.map((row) => ({
    id: Number(row.id),
    createdAt: row.created_at,
    archivedAt: row.archived_at ?? null,
    stateValue: row.state_value ?? "",
    createdBy: row.created_by ?? null,
    contacts: (Array.isArray(row.contacts) ? row.contacts : []).map(toContact),
  }))
  const contacts = withDuplicateCounts(pending.rows.map(toContact), exports.flatMap((batch) => batch.contacts))
  return {
    contacts,
    totalCount: contacts.length,
    duplicateCount: contacts.filter((contact) => contact.duplicateAddressCount > 1 || contact.duplicateNameCount > 1).length,
    exports,
  }
}

export function parseStateValue(value: unknown): string | null {
  if (value === undefined || value === null) return ""
  if (typeof value !== "string") return null
  const trimmed = value.trim()
  return trimmed.length <= MAX_STATE_VALUE_LENGTH ? trimmed : null
}

/**
 * Records a new export batch for the given contacts. Only contacts that are
 * still Potentially French, in a non-archived submission and not already in a
 * batch are included. Returns null (and records nothing) if none qualify.
 */
export async function createFrenchExport(
  db: DatabaseClient,
  input: { scope: ExportScope; userId: number | null; contacts: ContactRef[]; stateValue: string },
): Promise<FrenchExportBatch | null> {
  await db.query("BEGIN")
  try {
    const batch = await db.query(
      `INSERT INTO french_contact_exports(congregation_id, created_by_user_id, state_value)
       VALUES($1, $2, $3) RETURNING id, created_at`,
      [input.scope, input.userId, input.stateValue],
    )
    const exportId = Number(batch.rows[0].id)
    const refs = JSON.stringify(input.contacts.map((contact) => ({
      submission_id: contact.submissionId, contact_id: contact.contactId,
    })))
    const items = await db.query(
      `INSERT INTO french_contact_export_items(export_id, submission_id, contact_id, contact)
       SELECT $1, s.id, c->>'id', jsonb_build_object(
         'submissionId', s.id, 'contactId', c->>'id', 'userId', s.user_id, 'submittedAt', s.submitted_at,
         'fullName', COALESCE(c->>'fullName', ''), 'address', COALESCE(c->>'address', ''),
         'city', COALESCE(c->>'city', ''), 'zipcode', COALESCE(c->>'zipcode', ''),
         'phone', COALESCE(c->>'phone', ''), 'notes', COALESCE(c->>'notes', ''))
       FROM jsonb_to_recordset($2::jsonb) r(submission_id INT, contact_id TEXT)
       JOIN submissions s ON s.id = r.submission_id
       CROSS JOIN LATERAL jsonb_array_elements(s.contacts) c
       WHERE c->>'id' = r.contact_id AND s.archived = FALSE
         AND c->>'status' = 'Potentially French'${input.scope === null ? "" : " AND s.congregation_id = $3"}
       ON CONFLICT (submission_id, contact_id) DO NOTHING
       RETURNING contact`,
      input.scope === null ? [exportId, refs] : [exportId, refs, input.scope],
    )
    if (!items.rows.length) {
      await db.query("ROLLBACK")
      return null
    }
    await db.query("COMMIT")
    return {
      id: exportId,
      createdAt: batch.rows[0].created_at,
      archivedAt: null,
      stateValue: input.stateValue,
      createdBy: null,
      contacts: items.rows.map((row) => toContact(row.contact)).sort((a, b) => a.fullName.localeCompare(b.fullName)),
    }
  } catch (error) {
    await db.query("ROLLBACK")
    throw error
  }
}

export type FrenchExportAction = "undoExport" | "archiveExport" | "unarchiveExport"

export function isFrenchExportAction(value: unknown): value is FrenchExportAction {
  return value === "undoExport" || value === "archiveExport" || value === "unarchiveExport"
}

/** Undo deletes the batch (its contacts return to To export); archive/unarchive toggle archived_at. */
export async function updateFrenchExport(db: DatabaseClient, scope: ExportScope, exportId: number, action: FrenchExportAction) {
  const sql = action === "undoExport"
    ? `DELETE FROM french_contact_exports WHERE id = $1 AND congregation_id IS NOT DISTINCT FROM $2 RETURNING id`
    : `UPDATE french_contact_exports SET archived_at = ${action === "archiveExport" ? "NOW()" : "NULL"}
       WHERE id = $1 AND congregation_id IS NOT DISTINCT FROM $2 RETURNING id`
  const result = await db.query(sql, [exportId, scope])
  return result.rows.length > 0
}
