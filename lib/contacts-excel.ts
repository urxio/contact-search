import type { BaseContact } from "@/types/contact"

// Contacts Excels use a fixed column order.
const FIXED_COLUMNS = {
  FIRST_NAME: 0,
  LAST_NAME: 1,
  ADDRESS: 2,
  CITY: 3,
  ZIPCODE: 4,
  PHONE: 5,
}

const REQUIRED_COLUMNS: { name: string; index: number; aliases: string[] }[] = [
  { name: "First Name", index: FIXED_COLUMNS.FIRST_NAME, aliases: ["first name", "firstname", "first"] },
  { name: "Last Name",  index: FIXED_COLUMNS.LAST_NAME,  aliases: ["last name", "lastname", "last"] },
  { name: "Address",    index: FIXED_COLUMNS.ADDRESS,    aliases: ["address", "addr", "street"] },
  { name: "City",       index: FIXED_COLUMNS.CITY,       aliases: ["city"] },
  { name: "Zipcode",    index: FIXED_COLUMNS.ZIPCODE,    aliases: ["zipcode", "zip code", "zip", "postal code", "postal"] },
  { name: "Phone",      index: FIXED_COLUMNS.PHONE,      aliases: ["phone", "phone number", "telephone", "tel"] },
]

/** The header row is missing columns or has them out of order; `message` lists each problem. */
export class ExcelColumnsError extends Error {
  constructor(readonly problems: string[]) {
    super(`Invalid column format. Missing or misplaced columns:\n• ${problems.join("\n• ")}\n\nRequired order: First Name, Last Name, Address, City, Zipcode, Phone`)
  }
}

/** Reads the first sheet of a contacts Excel. Throws ExcelColumnsError for a bad header row. */
export async function readContactsExcel(file: File): Promise<BaseContact[]> {
  const XLSX = await import("xlsx")
  const workbook = XLSX.read(await file.arrayBuffer(), { type: "array" })
  const worksheet = workbook.Sheets[workbook.SheetNames[0]]
  const rawData = XLSX.utils.sheet_to_json<any[]>(worksheet, { header: 1 })
  if (rawData.length <= 1) throw new Error("No data found in the Excel file")

  const headerRow: string[] = (rawData[0] as any[]).map((h) => String(h ?? "").toLowerCase().trim())
  const problems: string[] = []
  for (const col of REQUIRED_COLUMNS) {
    const headerAtIndex = headerRow[col.index] ?? ""
    if (col.aliases.some((alias) => headerAtIndex.includes(alias))) continue
    // Also check if the header exists anywhere in the row (wrong order)
    const foundElsewhere = headerRow.some((h) => col.aliases.some((alias) => h.includes(alias)))
    problems.push(foundElsewhere
      ? `"${col.name}" found but in the wrong column position (expected column ${col.index + 1})`
      : `"${col.name}" (expected in column ${col.index + 1})`)
  }
  if (problems.length > 0) throw new ExcelColumnsError(problems)

  return rawData.slice(1).map((row) => {
    const firstName = String(row[FIXED_COLUMNS.FIRST_NAME] || "")
    const lastName = String(row[FIXED_COLUMNS.LAST_NAME] || "")
    return {
      firstName,
      lastName,
      fullName: `${firstName} ${lastName}`.trim(),
      address: String(row[FIXED_COLUMNS.ADDRESS] || ""),
      city: String(row[FIXED_COLUMNS.CITY] || ""),
      zipcode: String(row[FIXED_COLUMNS.ZIPCODE] || ""),
      phone: String(row[FIXED_COLUMNS.PHONE] || ""),
    }
  })
}
