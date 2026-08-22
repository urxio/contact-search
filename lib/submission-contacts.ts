export const ADMIN_CONTACT_STATUSES = ["Potentially French", "Not French", "Duplicate"] as const
export const ADMIN_CHECKED_SOURCES = ["forebears", "truePeopleSearch"] as const

export type AdminContactStatus = (typeof ADMIN_CONTACT_STATUSES)[number]
export type AdminCheckedSource = (typeof ADMIN_CHECKED_SOURCES)[number]

type DatabaseClient = {
  query: (text: string, values?: unknown[]) => Promise<{ rows: any[] }>
}

export type ContactRef = { submissionId: number; contactId: string }

export type AdminContactMutation = ContactRef & {
  congregationId?: number
  status?: AdminContactStatus
  checkedSource?: AdminCheckedSource
}

export type SubmissionCounters = {
  contactCount: number
  potentiallyFrench: number
  notFrench: number
  duplicate: number
  notChecked: number
}

const CHECKED_SOURCE_FIELDS: Record<AdminCheckedSource, string> = {
  forebears: "checkedOnForebears",
  truePeopleSearch: "checkedOnTPS",
}

export function isAdminContactStatus(value: unknown): value is AdminContactStatus {
  return ADMIN_CONTACT_STATUSES.includes(value as AdminContactStatus)
}

export function isAdminCheckedSource(value: unknown): value is AdminCheckedSource {
  return ADMIN_CHECKED_SOURCES.includes(value as AdminCheckedSource)
}

function scopeClause(congregationId?: number) {
  return congregationId === undefined ? "" : " AND congregation_id = $5"
}

function scopeValues(congregationId?: number) {
  return congregationId === undefined ? [] : [congregationId]
}

export async function updateSubmissionContact(
  client: DatabaseClient,
  mutation: AdminContactMutation,
): Promise<{ contact: Record<string, unknown>; counters: SubmissionCounters } | null> {
  const property = mutation.status ? "status" : CHECKED_SOURCE_FIELDS[mutation.checkedSource!]
  const value: string | boolean = mutation.status ?? true
  const valueExpression = mutation.status ? "$4::text" : "$4::boolean"
  const result = await client.query(
    `UPDATE submissions SET contacts = (
       SELECT COALESCE(jsonb_agg(CASE WHEN elem->>'id' = $2
         THEN elem || jsonb_build_object($3::text, ${valueExpression}) ELSE elem END), '[]'::jsonb)
       FROM jsonb_array_elements(contacts) elem
     )
     WHERE id = $1${scopeClause(mutation.congregationId)}
       AND EXISTS (SELECT 1 FROM jsonb_array_elements(contacts) elem WHERE elem->>'id' = $2)
     RETURNING contacts`,
    [mutation.submissionId, mutation.contactId, property, value, ...scopeValues(mutation.congregationId)],
  )
  if (!result.rows[0]) return null

  if (mutation.status) {
    await recomputeCounters(client, mutation.congregationId, mutation.submissionId)
  }

  const countersResult = await client.query(
    `SELECT contact_count, potentially_french, not_french, duplicate, not_checked
     FROM submissions WHERE id = $1${mutation.congregationId === undefined ? "" : " AND congregation_id = $2"}`,
    mutation.congregationId === undefined
      ? [mutation.submissionId]
      : [mutation.submissionId, mutation.congregationId],
  )
  const row = countersResult.rows[0]
  const contacts = Array.isArray(result.rows[0].contacts) ? result.rows[0].contacts : []
  const contact = contacts.find((item: Record<string, unknown>) => item.id === mutation.contactId)
  if (!contact || !row) return null

  return {
    contact,
    counters: {
      contactCount: Number(row.contact_count),
      potentiallyFrench: Number(row.potentially_french),
      notFrench: Number(row.not_french),
      duplicate: Number(row.duplicate),
      notChecked: Number(row.not_checked),
    },
  }
}

export async function updateContactStatus(
  client: DatabaseClient,
  congregationId: number,
  contact: ContactRef,
  status: string,
) {
  const result = await client.query(
    `UPDATE submissions SET contacts = (
       SELECT COALESCE(jsonb_agg(CASE WHEN elem->>'id' = $3
         THEN elem || jsonb_build_object('status', $4::text) ELSE elem END), '[]'::jsonb)
       FROM jsonb_array_elements(contacts) elem
     )
     WHERE id = $1 AND congregation_id = $2
       AND EXISTS (SELECT 1 FROM jsonb_array_elements(contacts) elem WHERE elem->>'id' = $3)
     RETURNING id`,
    [contact.submissionId, congregationId, contact.contactId, status],
  )
  if (!result.rows[0]) return false
  await recomputeCounters(client, congregationId, contact.submissionId)
  return true
}

export async function recomputeCounters(
  client: DatabaseClient,
  congregationId: number | undefined,
  submissionId: number,
) {
  await client.query(
    `UPDATE submissions s SET
       contact_count = jsonb_array_length(s.contacts),
       potentially_french = counts.potentially_french,
       not_french = counts.not_french,
       duplicate = counts.duplicate,
       not_checked = counts.not_checked
     FROM (
       SELECT
         COUNT(*) FILTER (WHERE c->>'status' = 'Potentially French')::int potentially_french,
         COUNT(*) FILTER (WHERE c->>'status' = 'Not French')::int not_french,
         COUNT(*) FILTER (WHERE c->>'status' = 'Duplicate')::int duplicate,
         COUNT(*) FILTER (WHERE c->>'status' = 'Not checked')::int not_checked
       FROM submissions source, jsonb_array_elements(source.contacts) c
       WHERE source.id = $1${congregationId === undefined ? "" : " AND source.congregation_id = $2"}
     ) counts WHERE s.id = $1${congregationId === undefined ? "" : " AND s.congregation_id = $2"}`,
    congregationId === undefined ? [submissionId] : [submissionId, congregationId],
  )
}

export function parseContactRefs(value: unknown): ContactRef[] {
  if (!Array.isArray(value)) return []
  return Array.from(new Map(value.map((raw) => {
    const item = raw as { submissionId?: unknown; contactId?: unknown }
    const submissionId = Number.parseInt(String(item.submissionId ?? ""), 10)
    const contactId = String(item.contactId ?? "").trim()
    return [`${submissionId}:${contactId}`, { submissionId, contactId }] as const
  })).values()).filter((item) => Number.isSafeInteger(item.submissionId) && item.submissionId > 0 && !!item.contactId)
}

export async function updateManyStatusesAtomic(
  client: DatabaseClient,
  congregationId: number,
  contacts: ContactRef[],
  status: string,
) {
  await client.query("BEGIN")
  try {
    for (const contact of contacts) {
      if (!await updateContactStatus(client, congregationId, contact, status)) {
        await client.query("ROLLBACK")
        return false
      }
    }
    await client.query("COMMIT")
    return true
  } catch (error) {
    await client.query("ROLLBACK")
    throw error
  }
}
