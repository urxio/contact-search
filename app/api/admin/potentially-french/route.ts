import { NextRequest, NextResponse } from "next/server"
import { cookies } from "next/headers"
import { pool } from "@/lib/db"

function requireAdmin(): NextResponse | null {
  const cookieStore = cookies()
  const adminSession = cookieStore.get("admin_session")
  if (adminSession?.value !== process.env.ADMIN_PASSWORD) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }
  return null
}

function normalize(s: string) {
  return (s || "").toLowerCase().replace(/\s+/g, " ").trim()
}

type ContactRow = {
  submission_id: number
  user_id: string
  submitted_at: string
  contact_id: string | null
  full_name: string | null
  address: string | null
  city: string | null
  zipcode: string | null
  phone: string | null
  notes: string | null
}

// GET — every contact currently marked "Potentially French" across all
// non-archived submissions, with duplicate detection (by address and by
// name) across users — something no single user's local "Duplicate"
// status check can catch, since that only looks within one session.
export async function GET() {
  const unauthorized = requireAdmin()
  if (unauthorized) return unauthorized

  try {
    const result = await pool.query(`
      SELECT
        s.id AS submission_id,
        s.user_id,
        s.submitted_at,
        c->>'id'        AS contact_id,
        c->>'fullName'  AS full_name,
        c->>'address'   AS address,
        c->>'city'      AS city,
        c->>'zipcode'   AS zipcode,
        c->>'phone'     AS phone,
        c->>'notes'     AS notes
      FROM submissions s, jsonb_array_elements(s.contacts) c
      WHERE c->>'status' = 'Potentially French' AND s.archived = FALSE
    `)

    const addressCounts = new Map<string, number>()
    const nameCounts = new Map<string, number>()

    const rows = (result.rows as ContactRow[]).map((row) => {
      const addressKey = normalize(`${row.address} ${row.city} ${row.zipcode}`)
      const nameKey = normalize(row.full_name || "")
      if (addressKey) addressCounts.set(addressKey, (addressCounts.get(addressKey) ?? 0) + 1)
      if (nameKey) nameCounts.set(nameKey, (nameCounts.get(nameKey) ?? 0) + 1)
      return { row, addressKey, nameKey }
    })

    const contacts = rows.map(({ row, addressKey, nameKey }: { row: ContactRow; addressKey: string; nameKey: string }) => ({
      submissionId: row.submission_id,
      contactId: row.contact_id,
      userId: row.user_id,
      submittedAt: row.submitted_at,
      fullName: row.full_name || "",
      address: row.address || "",
      city: row.city || "",
      zipcode: row.zipcode || "",
      phone: row.phone || "",
      notes: row.notes || "",
      duplicateAddressCount: addressKey ? addressCounts.get(addressKey) ?? 1 : 1,
      duplicateNameCount: nameKey ? nameCounts.get(nameKey) ?? 1 : 1,
    }))

    contacts.sort((a, b) => {
      const aMax = Math.max(a.duplicateAddressCount, a.duplicateNameCount)
      const bMax = Math.max(b.duplicateAddressCount, b.duplicateNameCount)
      if (aMax !== bMax) return bMax - aMax
      return a.fullName.localeCompare(b.fullName)
    })

    const duplicateCount = contacts.filter((c) => c.duplicateAddressCount > 1 || c.duplicateNameCount > 1).length

    return NextResponse.json({ contacts, totalCount: contacts.length, duplicateCount })
  } catch (err: any) {
    console.error("Potentially French list fetch error:", err)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

// PATCH — sets a contact's status to "Not French", removing it from this
// list. Keeps the cached submissions.potentially_french/not_french/etc.
// count columns in sync (same reasoning as the Dictionary Scan PATCH: those
// are plain integers written once at submit time and never recomputed from
// the contacts JSONB, so they'd silently drift otherwise).
// Body: { submissionId: number, contactId: string }
export async function PATCH(req: NextRequest) {
  const unauthorized = requireAdmin()
  if (unauthorized) return unauthorized

  try {
    const body = await req.json()
    const submissionId = Number(body?.submissionId)
    const contactId = String(body?.contactId ?? "")

    if (!Number.isFinite(submissionId) || !contactId) {
      return NextResponse.json({ error: "Missing submissionId or contactId" }, { status: 400 })
    }

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
        return NextResponse.json({ error: "Contact not found" }, { status: 404 })
      }
      const previousStatus = statusResult.rows[0].status as string | null

      await client.query(
        `UPDATE submissions
         SET contacts = (
           SELECT COALESCE(
             jsonb_agg(
               CASE WHEN elem->>'id' = $2
                 THEN elem || '{"status":"Not French"}'::jsonb
                 ELSE elem
               END
             ),
             '[]'::jsonb
           )
           FROM jsonb_array_elements(contacts) AS elem
         )
         WHERE id = $1`,
        [submissionId, contactId],
      )

      // Only these three statuses were ever counted into a column at submit
      // time (see app/api/submissions/route.ts) — anything else (e.g.
      // "Detected") wasn't in any bucket, so there's nothing to decrement.
      const decrementColumn =
        previousStatus === "Potentially French" ? "potentially_french" :
        previousStatus === "Duplicate" ? "duplicate" :
        previousStatus === "Not checked" ? "not_checked" :
        null

      const setClauses = [
        // Already "Not French" (e.g. a race with another admin action) —
        // don't double-count it.
        ...(previousStatus === "Not French" ? [] : ["not_french = not_french + 1"]),
        ...(decrementColumn ? [`${decrementColumn} = GREATEST(${decrementColumn} - 1, 0)`] : []),
      ]
      if (setClauses.length > 0) {
        await client.query(`UPDATE submissions SET ${setClauses.join(", ")} WHERE id = $1`, [submissionId])
      }

      await client.query("COMMIT")
    } catch (err) {
      await client.query("ROLLBACK")
      throw err
    } finally {
      client.release()
    }

    return NextResponse.json({ success: true })
  } catch (err: any) {
    console.error("Potentially French mark-as-Not-French error:", err)
    return NextResponse.json({ error: err?.message ?? "Internal server error" }, { status: 500 })
  }
}
