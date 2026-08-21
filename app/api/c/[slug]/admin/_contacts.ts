type DatabaseClient = { query: (text: string, values?: unknown[]) => Promise<{ rows: any[] }> }

export type ContactRef = { submissionId: number; contactId: string }

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

export async function recomputeCounters(client: DatabaseClient, congregationId: number, submissionId: number) {
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
       WHERE source.id = $1 AND source.congregation_id = $2
     ) counts WHERE s.id = $1 AND s.congregation_id = $2`,
    [submissionId, congregationId],
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
