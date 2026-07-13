import { NextRequest, NextResponse } from "next/server"
import { cookies } from "next/headers"
import { pool, ensureSchema } from "@/lib/db"
import { getDictionaryFile } from "@/lib/github"
import { normalizeName } from "@/utils/french-name-detection"

function requireAdmin(): NextResponse | null {
  const cookieStore = cookies()
  const adminSession = cookieStore.get("admin_session")
  if (adminSession?.value !== process.env.ADMIN_PASSWORD) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }
  return null
}

function normalizeAddress(address: string | null, city: string | null, zipcode: string | null) {
  return `${address || ""} ${city || ""} ${zipcode || ""}`.toLowerCase().replace(/\s+/g, " ").trim()
}

type ContactRow = {
  submission_id: number
  user_id: string
  submitted_at: string
  contact_id: string | null
  full_name: string | null
  last_name: string | null
  address: string | null
  city: string | null
  zipcode: string | null
  phone: string | null
  status: string | null
}

// Falls back to the last whitespace-separated token of the full name when a
// contact's lastName field is empty (older imports sometimes only kept fullName).
function resolveLastName(row: ContactRow): string {
  if (row.last_name && row.last_name.trim()) return row.last_name
  const parts = (row.full_name || "").trim().split(/\s+/)
  return parts.length > 0 ? parts[parts.length - 1] : ""
}

// Surnames of contacts that are NOT currently marked "Potentially French" but
// whose last name matches an entry in the live name dictionary. Catches
// contacts that should probably be re-flagged: they were submitted (or last
// classified) before their surname was added to the dictionary, or the
// status was overridden manually.
async function runScan() {
  await ensureSchema()

  const [contactsResult, dictionary, dismissedResult, frenchAddressesResult] = await Promise.all([
    pool.query(`
      SELECT
        s.id AS submission_id,
        s.user_id,
        s.submitted_at,
        c->>'id'       AS contact_id,
        c->>'fullName' AS full_name,
        c->>'lastName' AS last_name,
        c->>'address'  AS address,
        c->>'city'     AS city,
        c->>'zipcode'  AS zipcode,
        c->>'phone'    AS phone,
        c->>'status'   AS status
      FROM submissions s, jsonb_array_elements(s.contacts) c
      WHERE COALESCE(c->>'status', '') <> 'Potentially French' AND s.archived = FALSE
    `),
    getDictionaryFile().catch((err: any) => {
      throw new Error(err?.message ?? "Failed to load dictionary from GitHub")
    }),
    pool.query(`SELECT submission_id, contact_id FROM dismissed_dictionary_scan_matches`),
    // Addresses already covered by a contact marked "Potentially French" —
    // a scan match at one of these addresses is the same household as
    // someone already flagged, so it isn't a new find.
    pool.query(`
      SELECT c->>'address' AS address, c->>'city' AS city, c->>'zipcode' AS zipcode
      FROM submissions s, jsonb_array_elements(s.contacts) c
      WHERE c->>'status' = 'Potentially French' AND s.archived = FALSE
    `),
  ])

  const dictionarySet = new Set(dictionary.lines)
  const dismissedSet = new Set(
    dismissedResult.rows.map((r: { submission_id: number; contact_id: string }) => `${r.submission_id}:${r.contact_id}`),
  )
  const frenchAddressSet = new Set(
    (frenchAddressesResult.rows as { address: string | null; city: string | null; zipcode: string | null }[])
      .map((r) => normalizeAddress(r.address, r.city, r.zipcode))
      .filter(Boolean),
  )

  const filteredRows = (contactsResult.rows as ContactRow[])
    .map((row) => {
      const lastName = resolveLastName(row)
      const normalized = normalizeName(lastName)
      return { row, lastName, normalized }
    })
    .filter(({ normalized, row }) =>
      normalized &&
      dictionarySet.has(normalized) &&
      !dismissedSet.has(`${row.submission_id}:${row.contact_id}`) &&
      !frenchAddressSet.has(normalizeAddress(row.address, row.city, row.zipcode)),
    )

  // Duplicate-address count within this result set itself — separate from
  // frenchAddressSet above, which only excludes addresses already covered
  // by a "Potentially French" contact. This instead flags when two or more
  // matches here share an address (e.g. a household with several members
  // all missed), so the admin can spot and resolve them together.
  const addressCounts = new Map<string, number>()
  for (const { row } of filteredRows) {
    const key = normalizeAddress(row.address, row.city, row.zipcode)
    if (key) addressCounts.set(key, (addressCounts.get(key) ?? 0) + 1)
  }

  const matches = filteredRows
    .map(({ row, lastName, normalized }) => ({
      submissionId: row.submission_id,
      contactId: row.contact_id,
      userId: row.user_id,
      submittedAt: row.submitted_at,
      fullName: row.full_name || "",
      lastName,
      matchedName: normalized,
      address: row.address || "",
      city: row.city || "",
      zipcode: row.zipcode || "",
      phone: row.phone || "",
      status: row.status || "Not checked",
      duplicateAddressCount: addressCounts.get(normalizeAddress(row.address, row.city, row.zipcode)) ?? 1,
    }))
    .sort((a, b) => a.lastName.localeCompare(b.lastName))

  return { matches, totalScanned: contactsResult.rowCount ?? 0 }
}

// GET — read-only scan, used for the panel's initial/auto load.
export async function GET() {
  const unauthorized = requireAdmin()
  if (unauthorized) return unauthorized

  try {
    const { matches, totalScanned } = await runScan()
    return NextResponse.json({ matches, totalScanned, matchCount: matches.length })
  } catch (err: any) {
    console.error("Name dictionary scan error:", err)
    return NextResponse.json({ error: err?.message ?? "Internal server error" }, { status: 500 })
  }
}

// POST — same scan, but also marks every non-archived submission covered by
// it as "reviewed". Only triggered by an explicit admin rescan action (never
// the panel's automatic initial load), since it mutates review status across
// every active submission.
export async function POST() {
  const unauthorized = requireAdmin()
  if (unauthorized) return unauthorized

  try {
    const { matches, totalScanned } = await runScan()

    const reviewedResult = await pool.query(`
      UPDATE submissions SET review_status = 'reviewed'
      WHERE archived = FALSE AND review_status IS DISTINCT FROM 'reviewed'
      RETURNING id
    `)

    return NextResponse.json({
      matches,
      totalScanned,
      matchCount: matches.length,
      reviewedCount: reviewedResult.rowCount ?? 0,
    })
  } catch (err: any) {
    console.error("Name dictionary scan (rescan) error:", err)
    return NextResponse.json({ error: err?.message ?? "Internal server error" }, { status: 500 })
  }
}

// Fields an admin may edit inline from the scan panel — matches the
// Contact shape used elsewhere in the app (see app/admin/user/[userId]/page.tsx).
const EDITABLE_CONTACT_FIELDS = ["fullName", "lastName", "address", "city", "zipcode", "phone"] as const

// PATCH — marks a contact's status as "Potentially French", dismisses it
// from future scan results without touching its status or the dictionary,
// or updates its editable fields directly. Used per row in the panel to
// resolve a missed match without leaving the admin dashboard.
//
// `submissions.potentially_french/not_french/duplicate/not_checked` are
// plain cached integer columns, written once at submit time and never
// recomputed from the `contacts` JSONB — so the markFrench path also nudges
// them here, otherwise the dashboard's summary counts would silently drift
// out of sync with the JSONB the moment this runs.
// Body: { submissionId: number, contactId: string, action?: "markFrench" | "dismiss" | "update", fields?: Partial<Record<typeof EDITABLE_CONTACT_FIELDS[number], string>> }
export async function PATCH(req: NextRequest) {
  const unauthorized = requireAdmin()
  if (unauthorized) return unauthorized

  try {
    const body = await req.json()
    const submissionId = Number(body?.submissionId)
    const contactId = String(body?.contactId ?? "")
    const action = body?.action === "dismiss" ? "dismiss" : body?.action === "update" ? "update" : "markFrench"

    if (!Number.isFinite(submissionId) || !contactId) {
      return NextResponse.json({ error: "Missing submissionId or contactId" }, { status: 400 })
    }

    if (action === "dismiss") {
      await ensureSchema()
      await pool.query(
        `INSERT INTO dismissed_dictionary_scan_matches (submission_id, contact_id, dismissed_at)
         VALUES ($1, $2, NOW())
         ON CONFLICT (submission_id, contact_id) DO UPDATE SET dismissed_at = NOW()`,
        [submissionId, contactId],
      )
      return NextResponse.json({ success: true })
    }

    if (action === "update") {
      const fields = body?.fields ?? {}
      const updates: Record<string, string> = {}
      for (const key of EDITABLE_CONTACT_FIELDS) {
        if (typeof fields[key] === "string") updates[key] = fields[key].trim()
      }
      if (Object.keys(updates).length === 0) {
        return NextResponse.json({ error: "No fields to update" }, { status: 400 })
      }

      const result = await pool.query(
        `UPDATE submissions
         SET contacts = (
           SELECT COALESCE(
             jsonb_agg(
               CASE WHEN elem->>'id' = $2
                 THEN elem || $3::jsonb
                 ELSE elem
               END
             ),
             '[]'::jsonb
           )
           FROM jsonb_array_elements(contacts) AS elem
         )
         WHERE id = $1
         RETURNING id`,
        [submissionId, contactId, JSON.stringify(updates)],
      )
      if (result.rowCount === 0) {
        return NextResponse.json({ error: "Submission not found" }, { status: 404 })
      }
      return NextResponse.json({ success: true })
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

      // Only these three statuses were ever counted into a column at submit
      // time (see app/api/submissions/route.ts) — anything else (e.g.
      // "Detected") wasn't in any bucket, so there's nothing to decrement.
      const decrementColumn =
        previousStatus === "Not French" ? "not_french" :
        previousStatus === "Duplicate" ? "duplicate" :
        previousStatus === "Not checked" ? "not_checked" :
        null

      await client.query(
        `UPDATE submissions
         SET contacts = (
           SELECT COALESCE(
             jsonb_agg(
               CASE WHEN elem->>'id' = $2
                 THEN elem || '{"status":"Potentially French"}'::jsonb
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

      await client.query(
        `UPDATE submissions
         SET potentially_french = potentially_french + 1
             ${decrementColumn ? `, ${decrementColumn} = GREATEST(${decrementColumn} - 1, 0)` : ""}
         WHERE id = $1`,
        [submissionId],
      )

      await client.query("COMMIT")
    } catch (err) {
      await client.query("ROLLBACK")
      throw err
    } finally {
      client.release()
    }

    return NextResponse.json({ success: true })
  } catch (err: any) {
    console.error("Name dictionary scan PATCH error:", err)
    return NextResponse.json({ error: err?.message ?? "Internal server error" }, { status: 500 })
  }
}
