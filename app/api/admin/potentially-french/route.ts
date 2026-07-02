import { NextResponse } from "next/server"
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
