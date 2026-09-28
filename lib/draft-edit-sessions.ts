import type { PoolClient } from "pg"

const DRAFT_SELECT = `SELECT contacts,global_notes,territory_zipcode,territory_page_range,
  last_verified_contact_id,revision,updated_at,package_id,package_assignment_revision
  FROM contact_drafts WHERE user_id=$1 AND congregation_id=$2`

function serializeServerDraft(row: any) {
  return {
    contacts: row?.contacts || [], globalNotes: row?.global_notes || "",
    territoryZipcode: row?.territory_zipcode || "", territoryPageRange: row?.territory_page_range || "",
    lastVerifiedId: row?.last_verified_contact_id || null, revision: row?.revision || 0,
    updatedAt: row?.updated_at || null,
    packageId: row?.package_id == null ? null : Number(row.package_id),
    packageAssignmentRevision: row?.package_id == null ? null : Number(row.package_assignment_revision),
  }
}

export class DraftEditSessionConflict extends Error {
  code = "DRAFT_EDIT_SESSION_REPLACED" as const

  constructor(public server: ReturnType<typeof serializeServerDraft>) {
    super("This draft is being edited in another session.")
  }
}

export function isDraftEditSessionId(value: unknown): value is string {
  return typeof value === "string" &&
    /^[\da-f]{8}-[\da-f]{4}-4[\da-f]{3}-[89ab][\da-f]{3}-[\da-f]{12}$/i.test(value)
}

/** Claims a draft when it is free, or replaces its editor only after an explicit switch. */
export async function claimDraftEditSession(client: PoolClient, input: {
  userId: number
  congregationId: number
  sessionId: string
  switchEditing?: boolean
}) {
  await client.query(
    `INSERT INTO contact_draft_edit_sessions(user_id,congregation_id,session_id)
     VALUES($1,$2,$3) ON CONFLICT(user_id,congregation_id) DO NOTHING`,
    [input.userId, input.congregationId, input.sessionId],
  )
  const current = await client.query(
    `SELECT session_id,updated_at > NOW() - INTERVAL '2 minutes' AS is_recent
     FROM contact_draft_edit_sessions
     WHERE user_id=$1 AND congregation_id=$2 FOR UPDATE`,
    [input.userId, input.congregationId],
  )
  const activeSessionId = current.rows[0]?.session_id
  const draft = await client.query(DRAFT_SELECT, [input.userId, input.congregationId])
  const savedDraft = draft.rows[0]
  const hasExcel = savedDraft?.package_id != null || (Array.isArray(savedDraft?.contacts) && savedDraft.contacts.length > 0)
  if (activeSessionId !== input.sessionId && activeSessionId != null && !input.switchEditing && current.rows[0].is_recent && hasExcel) {
    return { acquired: false as const, server: serializeServerDraft(savedDraft) }
  }

  if (activeSessionId !== input.sessionId) {
    await client.query(
      `UPDATE contact_draft_edit_sessions SET session_id=$3,updated_at=NOW()
       WHERE user_id=$1 AND congregation_id=$2`,
      [input.userId, input.congregationId, input.sessionId],
    )
  } else {
    await client.query(
      `UPDATE contact_draft_edit_sessions SET updated_at=NOW()
       WHERE user_id=$1 AND congregation_id=$2`,
      [input.userId, input.congregationId],
    )
  }

  return { acquired: true as const, draft: serializeServerDraft(savedDraft) }
}

/** Keep an open editor's lease active without granting a replaced session access. */
export async function refreshDraftEditSession(client: PoolClient, input: {
  userId: number
  congregationId: number
  sessionId: string
}) {
  await assertDraftEditSession(client, input)
  await client.query(
    `UPDATE contact_draft_edit_sessions SET updated_at=NOW()
     WHERE user_id=$1 AND congregation_id=$2 AND session_id=$3`,
    [input.userId, input.congregationId, input.sessionId],
  )
}

/** Hold the session row lock through the caller's transaction so a switch cannot race a save. */
export async function assertDraftEditSession(client: PoolClient, input: {
  userId: number
  congregationId: number
  sessionId: string
}) {
  const current = await client.query(
    `SELECT session_id FROM contact_draft_edit_sessions
     WHERE user_id=$1 AND congregation_id=$2 FOR UPDATE`,
    [input.userId, input.congregationId],
  )
  if (current.rows[0]?.session_id !== input.sessionId) {
    const draft = await client.query(DRAFT_SELECT, [input.userId, input.congregationId])
    throw new DraftEditSessionConflict(serializeServerDraft(draft.rows[0]))
  }
}
