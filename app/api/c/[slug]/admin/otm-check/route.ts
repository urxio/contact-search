import { NextRequest, NextResponse } from "next/server"
import { pool } from "@/lib/db"
import { auditEvent, requireCongregationAdmin, validateMutationOrigin } from "@/lib/auth"
import { apiError, assertMultiTenantEnabled, RouteContext } from "../../../_shared"

export const runtime = "nodejs"

const normalise = (value: string) => value.toLowerCase()
  .replace(/\b(?:apartment|unit|suite)\b/g, "apt")
  .replace(/[.,#-]/g, " ").replace(/\s+/g, " ").trim()
const fullKey = (address: string, city: string, zipcode: string) => [address, city, zipcode].map(normalise).filter(Boolean).join("|")
const looseKey = (address: string, zipcode: string) => [address, zipcode].map(normalise).filter(Boolean).join("|")

export async function POST(req: NextRequest, { params }: RouteContext) {
  try {
    assertMultiTenantEnabled()
    validateMutationOrigin(req)
    const auth = await requireCongregationAdmin(params.slug)
    let buffer: Buffer
    if (req.nextUrl.searchParams.get("useSaved") === "true") {
      const result = await pool.query(`SELECT filedata FROM otm_files WHERE congregation_id = $1`, [auth.congregation.id])
      if (!result.rows[0]) return NextResponse.json({ error: "No saved OTM file found. Please upload one first." }, { status: 400 })
      buffer = result.rows[0].filedata
    } else {
      const file = (await req.formData()).get("file")
      if (!(file instanceof File) || !file.size || file.size > 15 * 1024 * 1024) {
        return NextResponse.json({ error: "Choose an Excel or CSV address file up to 15 MB." }, { status: 400 })
      }
      buffer = Buffer.from(await file.arrayBuffer())
    }

    const XLSX = await import("xlsx")
    const workbook = XLSX.read(buffer, { type: "buffer", dense: true })
    const sheet = workbook.Sheets[workbook.SheetNames[0]]
    const rows = XLSX.utils.sheet_to_json<any[]>(sheet, { header: 1, sheetRows: 0, defval: "" } as any)
    if (rows.length < 2) return NextResponse.json({ error: "The address file has no data rows." }, { status: 400 })
    const headers = rows[0].map((cell) => String(cell ?? "").trim().toLowerCase())
    const exact = (names: string[]) => headers.findIndex((header) => names.includes(header))
    const contains = (names: string[]) => headers.findIndex((header) => names.some((name) => header.includes(name)))
    const house = exact(["housenum", "house num", "house_num", "houseno", "streetnumber", "streetnum", "number"])
    const direction = exact(["streetdir", "street dir", "street_dir", "strdir"])
    const street = exact(["street", "streetname", "street name", "street_name", "stname", "streetaddress"])
    const apartment = exact(["aptboxnum", "apt", "unit", "suite", "aptnumber", "aptno"])
    const address = contains(["address", "addr"])
    const city = exact(["city"])
    const zipcode = exact(["zip", "zipcode", "zip code", "postal", "postalcode"])
    const split = house >= 0 || street >= 0
    if (!split && address < 0) return NextResponse.json({ error: "Could not find address columns." }, { status: 400 })

    const otmRows = rows.slice(1).map((row) => {
      const apartmentValue = apartment >= 0 ? String(row[apartment] ?? "").trim() : ""
      const normalizedApartment = apartmentValue && !/^(?:apt|apartment|unit|suite|#)\b/i.test(apartmentValue)
        ? `APT ${apartmentValue}`
        : apartmentValue
      const addressValue = split
        ? [
          house >= 0 ? String(row[house] ?? "").trim() : "",
          direction >= 0 ? String(row[direction] ?? "").trim() : "",
          street >= 0 ? String(row[street] ?? "").trim() : "",
          normalizedApartment,
        ].filter(Boolean).join(" ")
        : String(row[address] ?? "").trim()
      return { address: addressValue, city: city >= 0 ? String(row[city] ?? "").trim() : "", zipcode: zipcode >= 0 ? String(row[zipcode] ?? "").trim() : "" }
    }).filter((row) => row.address)
    if (!otmRows.length) return NextResponse.json({ error: "No address rows found in the uploaded file." }, { status: 400 })
    const exactLookup = new Map(otmRows.map((row) => [fullKey(row.address, row.city, row.zipcode), row]))
    const looseLookup = new Map(otmRows.map((row) => [looseKey(row.address, row.zipcode), row]))

    const submissions = await pool.query(
      `SELECT id, user_id, submitted_at, contacts FROM submissions
       WHERE congregation_id = $1 AND archived = FALSE ORDER BY user_id, submitted_at DESC`,
      [auth.congregation.id],
    )
    const matches: any[] = []
    for (const submission of submissions.rows) {
      for (const contact of Array.isArray(submission.contacts) ? submission.contacts : []) {
        if (String(contact.status ?? "").trim() !== "Potentially French") continue
        const contactAddress = String(contact.address ?? "").trim()
        const contactCity = String(contact.city ?? "").trim()
        const contactZipcode = String(contact.zipcode ?? "").trim()
        const exactMatch = exactLookup.get(fullKey(contactAddress, contactCity, contactZipcode))
        const looseMatch = exactMatch ? null : looseLookup.get(looseKey(contactAddress, contactZipcode))
        const match = exactMatch || looseMatch
        if (!match) continue
        matches.push({ submissionId: submission.id, userId: submission.user_id, submittedAt: submission.submitted_at,
          contactId: String(contact.id ?? ""), contactName: String(contact.fullName ?? ""), contactAddress,
          contactCity, contactZipcode, contactStatus: String(contact.status ?? ""),
          matchType: exactMatch ? "exact" : "loose", otmAddress: match.address, otmCity: match.city, otmZipcode: match.zipcode })
      }
    }
    await auditEvent({ actorUserId: auth.user.id, congregationId: auth.congregation.id,
      action: "otm_scan.run", targetType: "otm_file", metadata: { rows: otmRows.length, matches: matches.length } })
    return NextResponse.json({
      otmRowCount: otmRows.length, otmRawRowCount: rows.length - 1,
      submissionCount: submissions.rows.length, matchCount: matches.length, matches,
      detectedColumns: {
        houseNum: house >= 0 ? headers[house] : null, streetDir: direction >= 0 ? headers[direction] : null,
        street: street >= 0 ? headers[street] : null, apt: apartment >= 0 ? headers[apartment] : null,
        city: city >= 0 ? headers[city] : null, zip: zipcode >= 0 ? headers[zipcode] : null,
        address: address >= 0 ? headers[address] : null,
      },
    })
  } catch (error) {
    return apiError(error)
  }
}
