import { NextRequest, NextResponse } from "next/server"
import { pool } from "@/lib/db"
import { cookies } from "next/headers"

// ── Address normalisation ────────────────────────────────────────────────────
// Lowercases, strips punctuation, collapses whitespace.
// Directional abbreviations are kept so "123 N Main St" still matches.
function normalise(s: string): string {
  return (s ?? "")
    .toLowerCase()
    .replace(/[.,#\-]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
}

// Build a comparison key from address + city + zipcode (all optional fields used
// progressively so partial data still produces useful matches).
function addressKey(address: string, city: string, zipcode: string): string {
  return [normalise(address), normalise(city), normalise(zipcode)]
    .filter(Boolean)
    .join("|")
}

// Looser key using only address + zipcode (fallback for missing city)
function looseKey(address: string, zipcode: string): string {
  return [normalise(address), normalise(zipcode)].filter(Boolean).join("|")
}

// ── POST /api/admin/otm-check ────────────────────────────────────────────────
export async function POST(req: NextRequest) {
  // Auth check
  const cookieStore = cookies()
  const session = cookieStore.get("admin_session")
  if (session?.value !== process.env.ADMIN_PASSWORD) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  try {
    // Parse multipart form — expect a single file field named "file"
    const form = await req.formData()
    const file = form.get("file") as File | null
    if (!file) {
      return NextResponse.json({ error: "No file uploaded" }, { status: 400 })
    }

    // Dynamically import xlsx (it's already a project dependency)
    const XLSX = await import("xlsx")

    const buffer = Buffer.from(await file.arrayBuffer())
    // dense: true reads ALL cells regardless of the sheet's declared range,
    // which prevents xlsx from capping rows at the !ref boundary.
    const workbook = XLSX.read(buffer, { type: "buffer", dense: true })
    const sheet = workbook.Sheets[workbook.SheetNames[0]]
    // sheetRows: 0 means no row limit; defval: "" fills missing cells so
    // row arrays have consistent length even for sparse sheets.
    const rows: any[][] = XLSX.utils.sheet_to_json(sheet, { header: 1, sheetRows: 0, defval: "" })

    if (rows.length < 2) {
      return NextResponse.json({ error: "Excel file is empty or has no data rows" }, { status: 400 })
    }

    // Auto-detect columns by header name (case-insensitive)
    const headerRow: string[] = (rows[0] as any[]).map((h) =>
      String(h ?? "").toLowerCase().trim()
    )

    const colIdx = (aliases: string[]) =>
      headerRow.findIndex((h) => aliases.some((a) => h.includes(a)))

    const addrCol    = colIdx(["address", "addr", "street"])
    const cityCol    = colIdx(["city"])
    const zipcodeCol = colIdx(["zip", "postal", "zipcode"])

    if (addrCol === -1) {
      return NextResponse.json(
        { error: "Could not find an address column. Expected a header containing 'Address', 'Addr', or 'Street'." },
        { status: 400 }
      )
    }

    // Build lookup sets from OTM Excel rows
    const otmFull  = new Set<string>()
    const otmLoose = new Set<string>()
    const otmRows: Array<{ address: string; city: string; zipcode: string }> = []

    for (let i = 1; i < rows.length; i++) {
      const row = rows[i] as any[]
      const address = String(row[addrCol] ?? "").trim()
      if (!address) continue
      const city    = cityCol    >= 0 ? String(row[cityCol]    ?? "").trim() : ""
      const zipcode = zipcodeCol >= 0 ? String(row[zipcodeCol] ?? "").trim() : ""

      otmRows.push({ address, city, zipcode })
      otmFull.add(addressKey(address, city, zipcode))
      otmLoose.add(looseKey(address, zipcode))
    }

    if (otmRows.length === 0) {
      return NextResponse.json({ error: "No address rows found in the Excel file" }, { status: 400 })
    }

    // Pull all non-archived submissions with their contacts JSONB
    const result = await pool.query(`
      SELECT id, user_id, submitted_at, territory_zipcode, territory_page_range,
             review_status, contacts
      FROM submissions
      WHERE archived = FALSE
      ORDER BY user_id ASC, submitted_at DESC
    `)

    // Compare each contact against the OTM lookup sets
    type Match = {
      submissionId: number
      userId: string
      submittedAt: string
      contactName: string
      contactAddress: string
      contactCity: string
      contactZipcode: string
      contactStatus: string
      matchType: "exact" | "loose"
      otmAddress: string
      otmCity: string
      otmZipcode: string
    }

    const matches: Match[] = []

    for (const sub of result.rows) {
      const contacts: any[] = Array.isArray(sub.contacts) ? sub.contacts : []

      for (const c of contacts) {
        // Only compare "Potentially French" contacts against the OTM list
        if (String(c.status ?? "").trim() !== "Potentially French") continue

        const cAddr = String(c.address ?? "").trim()
        const cCity = String(c.city    ?? "").trim()
        const cZip  = String(c.zipcode ?? "").trim()

        const fullK  = addressKey(cAddr, cCity, cZip)
        const looseK = looseKey(cAddr, cZip)

        let matchType: "exact" | "loose" | null = null
        let matchedOtm: typeof otmRows[0] | null = null

        if (otmFull.has(fullK)) {
          matchType  = "exact"
          matchedOtm = otmRows.find(
            (r) => addressKey(r.address, r.city, r.zipcode) === fullK
          ) ?? null
        } else if (otmLoose.has(looseK)) {
          matchType  = "loose"
          matchedOtm = otmRows.find(
            (r) => looseKey(r.address, r.zipcode) === looseK
          ) ?? null
        }

        if (matchType && matchedOtm) {
          matches.push({
            submissionId:    sub.id,
            userId:          sub.user_id,
            submittedAt:     sub.submitted_at,
            contactName:     String(c.fullName ?? ""),
            contactAddress:  cAddr,
            contactCity:     cCity,
            contactZipcode:  cZip,
            contactStatus:   String(c.status ?? ""),
            matchType,
            otmAddress:  matchedOtm.address,
            otmCity:     matchedOtm.city,
            otmZipcode:  matchedOtm.zipcode,
          })
        }
      }
    }

    return NextResponse.json({
      otmRowCount: otmRows.length,
      otmRawRowCount: rows.length - 1,   // total non-header rows seen in the sheet
      submissionCount: result.rows.length,
      matchCount: matches.length,
      matches,
    })
  } catch (err: any) {
    console.error("OTM check error:", err)
    return NextResponse.json({ error: "Internal server error: " + err.message }, { status: 500 })
  }
}
