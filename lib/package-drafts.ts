import type { PoolClient } from "pg"
import { DraftConflictError, PACKAGE_SELECT, serializeDraft } from "./contact-packages"

const DRAFT_SELECT = `SELECT contacts,global_notes,territory_zipcode,territory_page_range,
  last_verified_contact_id,revision,updated_at,package_id,package_assignment_revision
  FROM contact_drafts WHERE user_id=$1 AND congregation_id=$2`

export class PackageAssignmentError extends Error {
  status = 409
  constructor(public server: ReturnType<typeof serializeDraft>) {
    super("This Excel assignment has changed. Reopen it to continue, or keep your work as a separate draft.")
  }
}

export async function storePackageProgress(client: PoolClient, packageId: number, congregationId: number, draft: ReturnType<typeof serializeDraft>) {
  await client.query(`UPDATE contact_packages SET saved_progress=$3::jsonb,updated_at=NOW()
    WHERE id=$1 AND congregation_id=$2`, [packageId, congregationId, JSON.stringify({
    contacts: draft.contacts, globalNotes: draft.globalNotes, lastVerifiedId: draft.lastVerifiedId,
  })])
}

/** Caller owns the transaction. Package locks precede draft locks, as in opening an Excel. */
export async function saveMemberDraft(client: PoolClient, input: {
  userId: number; congregationId: number; revision: number; contacts: unknown[];
  globalNotes?: string; territoryZipcode?: string; territoryPageRange?: string;
  lastVerifiedId?: string | null; packageId?: number | null; packageAssignmentRevision?: number | null;
}) {
  const args = [input.userId, input.congregationId]
  const initial = await client.query(DRAFT_SELECT, args)
  // Older clients omit packageId; only an explicit null detaches an imported/new draft.
  const packageId = input.packageId === undefined ? initial.rows[0]?.package_id : input.packageId
  let linkedPackage: any
  if (packageId != null) {
    const result = await client.query(`${PACKAGE_SELECT} WHERE cp.id=$1 AND cp.congregation_id=$2 FOR UPDATE OF cp,s`, [packageId, input.congregationId])
    linkedPackage = result.rows[0]
  }
  const current = await client.query(`${DRAFT_SELECT} FOR UPDATE`, args)
  const row = current.rows[0]
  if (Number(row?.revision ?? 0) !== input.revision) throw new DraftConflictError(serializeDraft(row))
  if (packageId != null && (!linkedPackage || Number(row?.package_id) !== Number(packageId) ||
      Number(linkedPackage.owner_user_id) !== input.userId || linkedPackage.status === "Completed" ||
      row?.package_assignment_revision !== linkedPackage.assignment_revision ||
      (input.packageAssignmentRevision !== undefined && input.packageAssignmentRevision !== linkedPackage.assignment_revision))) {
    throw new PackageAssignmentError(serializeDraft({ ...row, package_id: null }))
  }
  const result = await client.query(
    `INSERT INTO contact_drafts(user_id,congregation_id,contacts,global_notes,territory_zipcode,
      territory_page_range,last_verified_contact_id,revision,updated_at,package_id,package_assignment_revision)
     VALUES($1,$2,$3,$4,$5,$6,$7,1,NOW(),$9,$10)
     ON CONFLICT(user_id,congregation_id) DO UPDATE SET contacts=EXCLUDED.contacts,
       global_notes=EXCLUDED.global_notes,territory_zipcode=EXCLUDED.territory_zipcode,
       territory_page_range=EXCLUDED.territory_page_range,last_verified_contact_id=EXCLUDED.last_verified_contact_id,
       revision=contact_drafts.revision+1,updated_at=NOW(),package_id=EXCLUDED.package_id,
       package_assignment_revision=EXCLUDED.package_assignment_revision
     WHERE contact_drafts.revision = $8
     RETURNING *`,
    [input.userId, input.congregationId, JSON.stringify(input.contacts), input.globalNotes ?? "",
      linkedPackage ? linkedPackage.zipcode : input.territoryZipcode ?? "",
      linkedPackage ? `${linkedPackage.page_start}-${linkedPackage.page_end}` : input.territoryPageRange ?? "",
      input.lastVerifiedId ?? null, input.revision, packageId ?? null, linkedPackage?.assignment_revision ?? null],
  )
  if (!result.rows[0]) {
    const server = await client.query(DRAFT_SELECT, args)
    throw new DraftConflictError(serializeDraft(server.rows[0]))
  }
  const draft = serializeDraft(result.rows[0])
  if (packageId != null) await storePackageProgress(client, Number(packageId), input.congregationId, draft)
  return draft
}
