import { randomUUID } from "crypto"
import type { PoolClient } from "pg"

export type PackageVisibility = "shared" | "private"
export type PackageContact = {
  firstName: string
  lastName: string
  address: string
  city: string
  zipcode: string
  phone: string
}

export class DraftConflictError extends Error {
  status = 409 as const
  constructor(public server: ReturnType<typeof serializeDraft>) {
    super("Draft conflict.")
  }
}

const text = (value: unknown, max: number) => String(value ?? "").trim().slice(0, max)

export function validatePackageName(value: unknown) {
  const name = text(value, 120)
  return name || null
}

export function validateVisibility(value: unknown): PackageVisibility | null {
  return value === "shared" || value === "private" ? value : null
}

export function sanitizePackageContacts(value: unknown): PackageContact[] | null {
  if (!Array.isArray(value) || value.length === 0 || value.length > 25_000) return null
  const contacts: PackageContact[] = []
  for (const item of value) {
    if (!item || typeof item !== "object") return null
    const row = item as Record<string, unknown>
    const contact = {
      firstName: text(row.firstName, 120), lastName: text(row.lastName, 120),
      address: text(row.address, 300), city: text(row.city, 120),
      zipcode: text(row.zipcode, 20), phone: text(row.phone, 50),
    }
    if (!contact.firstName || !contact.lastName || !contact.address || !contact.city || !contact.zipcode) return null
    contacts.push(contact)
  }
  return contacts
}

export function freshDraftContacts(contacts: PackageContact[]) {
  const addresses = new Set<string>()
  return contacts.map(contact => {
    const key = `${contact.address}|${contact.city}|${contact.zipcode}`.toLocaleLowerCase().replace(/\s+/g, " ").trim()
    const duplicate = addresses.has(key)
    addresses.add(key)
    return {
      ...contact, fullName: `${contact.firstName} ${contact.lastName}`.trim(), id: randomUUID(),
      status: duplicate ? "Duplicate" : "Not checked", notes: "", isExpanded: false,
      checkedOnTPS: false, checkedOnOTM: false, checkedOnForebears: false,
      needAddressUpdate: false, needPhoneUpdate: false, territoryStatus: false,
    }
  })
}

export function serializeDraft(row: any) {
  return {
    contacts: row?.contacts || [], globalNotes: row?.global_notes || "",
    territoryZipcode: row?.territory_zipcode || "", territoryPageRange: row?.territory_page_range || "",
    lastVerifiedId: row?.last_verified_contact_id || null, revision: row?.revision || 0,
    updatedAt: row?.updated_at || null,
  }
}

export async function replaceDraft(client: PoolClient, input: {
  userId: number; congregationId: number; contacts: PackageContact[];
  zipcode: string; pageStart: number; pageEnd: number; expectedRevision: number
}) {
  const current = await client.query(
    `SELECT contacts,global_notes,territory_zipcode,territory_page_range,last_verified_contact_id,revision,updated_at
       FROM contact_drafts WHERE user_id=$1 AND congregation_id=$2 FOR UPDATE`,
    [input.userId, input.congregationId],
  )
  const row = current.rows[0]
  if ((row && Number(row.revision) !== input.expectedRevision) || (!row && input.expectedRevision !== 0)) {
    throw new DraftConflictError(serializeDraft(row))
  }
  const result = await client.query(
    `INSERT INTO contact_drafts(user_id,congregation_id,contacts,global_notes,territory_zipcode,
       territory_page_range,last_verified_contact_id,revision,updated_at)
     VALUES($1,$2,$3,'',$4,$5,NULL,1,NOW())
     ON CONFLICT(user_id,congregation_id) DO UPDATE SET contacts=EXCLUDED.contacts,global_notes='',
       territory_zipcode=EXCLUDED.territory_zipcode,territory_page_range=EXCLUDED.territory_page_range,
       last_verified_contact_id=NULL,revision=contact_drafts.revision+1,updated_at=NOW()
     RETURNING contacts,global_notes,territory_zipcode,territory_page_range,last_verified_contact_id,revision,updated_at`,
    [input.userId, input.congregationId, JSON.stringify(freshDraftContacts(input.contacts)), input.zipcode, `${input.pageStart}-${input.pageEnd}`],
  )
  return serializeDraft(result.rows[0])
}

export function serializePackage(row: any, viewerUserId: number, manageAll: boolean) {
  const ownerUserId = row.owner_user_id == null ? null : Number(row.owner_user_id)
  const isAvailable = !ownerUserId && row.status === "Not started"
  const state = row.status === "Completed" ? "completed" : isAvailable ? "available" : row.status === "Not started" ? "assigned" : "in_progress"
  return {
    id: Number(row.id), name: row.name, visibility: row.visibility,
    originalFilename: row.original_filename, contactCount: Number(row.contact_count),
    createdAt: row.created_at, updatedAt: row.updated_at,
    isMine: Number(row.uploaded_by_user_id) === viewerUserId,
    uploader: row.uploaded_by_user_id == null ? null : { id: Number(row.uploaded_by_user_id), displayName: row.uploader_name },
    segment: {
      id: Number(row.segment_id), zipcode: row.zipcode, city: row.city,
      pageStart: Number(row.page_start), pageEnd: Number(row.page_end), ownerUserId,
      owner: row.owner || "", status: row.status, stoppedAtPage: row.stopped_at_page == null ? null : Number(row.stopped_at_page),
    },
    state, canManage: manageAll || Number(row.uploaded_by_user_id) === viewerUserId, canAssign: manageAll,
    canOpen: row.status !== "Completed" && (manageAll || isAvailable || ownerUserId === viewerUserId),
  }
}

export function isPackageBrowsable(row: any, viewerUserId: number, includedPackageId?: number | null) {
  if (row.status === "Completed") return false
  if (row.visibility !== "shared") return true
  if (row.owner_user_id == null) return true
  return Number(row.id) === includedPackageId && Number(row.owner_user_id) === viewerUserId
}

export const PACKAGE_SELECT = `
  SELECT cp.id,cp.name,cp.visibility,cp.original_filename,cp.contact_count,cp.contacts,
         cp.uploaded_by_user_id,cp.created_at,cp.updated_at,u.display_name uploader_name,
         s.id segment_id,s.page_start,s.page_end,s.owner,s.owner_user_id,s.stopped_at_page,s.status,
         s.zipcode_id,z.zipcode,z.city,z.total_pages
    FROM contact_packages cp
    JOIN zt_segments s ON s.id=cp.segment_id AND s.congregation_id=cp.congregation_id
    JOIN zt_zipcodes z ON z.id=s.zipcode_id AND z.congregation_id=s.congregation_id
    LEFT JOIN users u ON u.id=cp.uploaded_by_user_id`

export async function insertPackageAudit(client: PoolClient, input: {
  actorUserId: number; congregationId: number; action: string; packageId: number; metadata?: Record<string, unknown>
}) {
  await client.query(
    `INSERT INTO audit_events(actor_user_id,congregation_id,action,target_type,target_id,metadata)
     VALUES($1,$2,$3,'contact_package',$4,$5::jsonb)`,
    [input.actorUserId,input.congregationId,input.action,String(input.packageId),JSON.stringify(input.metadata ?? {})],
  )
}
