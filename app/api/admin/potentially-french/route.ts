import { NextRequest, NextResponse } from "next/server"
import { cookies } from "next/headers"
import { ensureSchema, pool } from "@/lib/db"
import { createFrenchExport, isFrenchExportAction, listFrenchContacts, parseStateValue, updateFrenchExport } from "@/lib/french-exports"
import { parseContactRefs } from "@/lib/submission-contacts"

function requireAdmin(): NextResponse | null {
  const cookieStore = cookies()
  const adminSession = cookieStore.get("admin_session")
  if (adminSession?.value !== process.env.ADMIN_PASSWORD) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }
  return null
}

// GET — Potentially French contacts not yet exported (with duplicate detection
// across users) plus every CSV export batch, newest first.
export async function GET() {
  const unauthorized = requireAdmin()
  if (unauthorized) return unauthorized

  try {
    await ensureSchema()
    return NextResponse.json(await listFrenchContacts(pool, null))
  } catch (err: any) {
    console.error("Potentially French list fetch error:", err)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

// POST — records an export batch for the chosen contacts and returns the rows
// to write into the CSV. Body: { contacts: ContactRef[], stateValue?: string }
export async function POST(req: NextRequest) {
  const unauthorized = requireAdmin()
  if (unauthorized) return unauthorized

  try {
    const body = await req.json()
    const contacts = parseContactRefs(body?.contacts)
    if (!contacts.length) return NextResponse.json({ error: "Choose at least one contact to export" }, { status: 400 })
    const stateValue = parseStateValue(body?.stateValue)
    if (stateValue === null) return NextResponse.json({ error: "State must be 20 characters or fewer" }, { status: 400 })
    await ensureSchema()
    const client = await pool.connect()
    try {
      const batch = await createFrenchExport(client, { scope: null, userId: null, contacts, stateValue })
      if (!batch) return NextResponse.json({ error: "Those contacts were already exported or are no longer Potentially French" }, { status: 409 })
      return NextResponse.json({ export: batch })
    } finally {
      client.release()
    }
  } catch (err: any) {
    console.error("Potentially French export error:", err)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

const TARGET_STATUS = {
  notFrench: "Not French",
  duplicate: "Duplicate",
} as const

// Marks a reviewed set of duplicate-address contacts as Duplicate while
// retaining their records. Rebuilding the cached counters from JSONB keeps
// the dashboard totals accurate for a multi-submission batch.
async function markContactsDuplicate(contacts: { submissionId: number; contactId: string }[]) {
  const unique = Array.from(
    new Map(contacts.map((contact) => [`${contact.submissionId}:${contact.contactId}`, contact])).values(),
  )
  if (unique.length === 0) return 0

  const client = await pool.connect()
  try {
    await client.query("BEGIN")
    const changedSubmissionIds = new Set<number>()
    let removedCount = 0
    for (const contact of unique) {
      const result = await client.query(
        `UPDATE submissions
         SET contacts = (
           SELECT COALESCE(jsonb_agg(
             CASE WHEN elem->>'id' = $2 THEN elem || '{"status":"Duplicate"}'::jsonb ELSE elem END
           ), '[]'::jsonb)
           FROM jsonb_array_elements(contacts) elem
         )
         WHERE id = $1
           AND EXISTS (
             SELECT 1 FROM jsonb_array_elements(contacts) elem
             WHERE elem->>'id' = $2 AND elem->>'status' = 'Potentially French'
           )
         RETURNING id`,
        [contact.submissionId, contact.contactId],
      )
      if (result.rowCount) {
        changedSubmissionIds.add(contact.submissionId)
        removedCount += 1
      }
    }

    for (const submissionId of changedSubmissionIds) {
      await client.query(
        `UPDATE submissions s SET
           contact_count = jsonb_array_length(s.contacts),
           potentially_french = counts.potentially_french,
           not_french = counts.not_french,
           duplicate = counts.duplicate,
           not_checked = counts.not_checked
         FROM (
           SELECT
             COUNT(*) FILTER (WHERE c->>'status' = 'Potentially French')::int AS potentially_french,
             COUNT(*) FILTER (WHERE c->>'status' = 'Not French')::int AS not_french,
             COUNT(*) FILTER (WHERE c->>'status' = 'Duplicate')::int AS duplicate,
             COUNT(*) FILTER (WHERE c->>'status' = 'Not checked')::int AS not_checked
           FROM submissions source, jsonb_array_elements(source.contacts) c
           WHERE source.id = $1
         ) counts
         WHERE s.id = $1`,
        [submissionId],
      )
    }
    await client.query("COMMIT")
    return removedCount
  } catch (err) {
    await client.query("ROLLBACK")
    throw err
  } finally {
    client.release()
  }
}

// Reclassifies a contact, removing it from this list. Keeps the cached
// submissions.potentially_french/not_french/duplicate/not_checked count
// columns in sync — those are plain integers written once at submit time
// and never recomputed from the contacts JSONB, so they'd silently drift
// out of sync with the dashboard otherwise.
async function setContactStatus(submissionId: number, contactId: string, newStatus: string, incrementColumn: string) {
  const client = await pool.connect()
  try {
    await client.query("BEGIN")

    const statusResult = await client.query(
      `SELECT c->>'status' AS status
       FROM submissions s, jsonb_array_elements(s.contacts) c
       WHERE s.id = $1 AND c->>'id' = $2`,
      [submissionId, contactId],
    )
    if (statusResult.rowCount === 0) {
      await client.query("ROLLBACK")
      return { notFound: true as const }
    }
    const previousStatus = statusResult.rows[0].status as string | null

    await client.query(
      `UPDATE submissions
       SET contacts = (
         SELECT COALESCE(
           jsonb_agg(
             CASE WHEN elem->>'id' = $2
               THEN elem || jsonb_build_object('status', $3::text)
               ELSE elem
             END
           ),
           '[]'::jsonb
         )
         FROM jsonb_array_elements(contacts) AS elem
       )
       WHERE id = $1`,
      [submissionId, contactId, newStatus],
    )

    // Only these three statuses were ever counted into a column at submit
    // time (see app/api/submissions/route.ts) — anything else (e.g.
    // "Detected") wasn't in any bucket, so there's nothing to decrement.
    const decrementColumn =
      previousStatus === "Potentially French" ? "potentially_french" :
      previousStatus === "Not French" ? "not_french" :
      previousStatus === "Duplicate" ? "duplicate" :
      previousStatus === "Not checked" ? "not_checked" :
      null

    const setClauses = [
      // Already the target status (e.g. a race with another admin action) —
      // don't double-count it.
      ...(previousStatus === newStatus ? [] : [`${incrementColumn} = ${incrementColumn} + 1`]),
      ...(decrementColumn && decrementColumn !== incrementColumn ? [`${decrementColumn} = GREATEST(${decrementColumn} - 1, 0)`] : []),
    ]
    if (setClauses.length > 0) {
      await client.query(`UPDATE submissions SET ${setClauses.join(", ")} WHERE id = $1`, [submissionId])
    }

    await client.query("COMMIT")
    return { notFound: false as const }
  } catch (err) {
    await client.query("ROLLBACK")
    throw err
  } finally {
    client.release()
  }
}

// PATCH — reclassifies a contact, removing it from this list: "Not French"
// for a genuine misclassification, or "Duplicate" for a contact that's
// really the same household/person as another entry already on the list.
// Body: { submissionId: number, contactId: string, action?: "notFrench" | "duplicate" }
export async function PATCH(req: NextRequest) {
  const unauthorized = requireAdmin()
  if (unauthorized) return unauthorized

  try {
    const body = await req.json()

    if (isFrenchExportAction(body?.action)) {
      const exportId = Number(body?.exportId)
      if (!Number.isSafeInteger(exportId) || exportId <= 0) {
        return NextResponse.json({ error: "Missing exportId" }, { status: 400 })
      }
      await ensureSchema()
      if (!await updateFrenchExport(pool, null, exportId, body.action)) {
        return NextResponse.json({ error: "Export batch not found" }, { status: 404 })
      }
      return NextResponse.json({ success: true })
    }

    if (body?.action === "removeDuplicates") {
      const contacts = Array.isArray(body?.contacts)
        ? body.contacts
          .map((contact: unknown) => {
            const item = contact as { submissionId?: unknown; contactId?: unknown }
            return { submissionId: Number(item?.submissionId), contactId: String(item?.contactId ?? "") }
          })
          .filter((contact: { submissionId: number; contactId: string }) => Number.isFinite(contact.submissionId) && !!contact.contactId)
        : []
      if (contacts.length === 0) {
        return NextResponse.json({ error: "Choose at least one duplicate contact" }, { status: 400 })
      }
      const removedCount = await markContactsDuplicate(contacts)
      return NextResponse.json({ success: true, removedCount })
    }
    const submissionId = Number(body?.submissionId)
    const contactId = String(body?.contactId ?? "")
    const action = body?.action === "duplicate" ? "duplicate" : "notFrench"

    if (!Number.isFinite(submissionId) || !contactId) {
      return NextResponse.json({ error: "Missing submissionId or contactId" }, { status: 400 })
    }

    const incrementColumn = action === "duplicate" ? "duplicate" : "not_french"
    const { notFound } = await setContactStatus(submissionId, contactId, TARGET_STATUS[action], incrementColumn)
    if (notFound) {
      return NextResponse.json({ error: "Contact not found" }, { status: 404 })
    }

    return NextResponse.json({ success: true })
  } catch (err: any) {
    console.error("Potentially French reclassify error:", err)
    return NextResponse.json({ error: err?.message ?? "Internal server error" }, { status: 500 })
  }
}
