import * as XLSX from "xlsx"

export const UNASSIGNED_AREA = "Unassigned"
export const MAX_TERRITORY_ZIP_IMPORT_ROWS = 2_000

export type TerritoryZipImportRow = {
  rowNumber: number
  city: string
  zipcode: string
  area: string
  error?: string
}

function normalizedHeader(value: unknown) {
  return String(value ?? "").trim().toLowerCase().replace(/[^a-z0-9]/g, "")
}

function zipcode(value: unknown) {
  if (typeof value === "number" && Number.isInteger(value) && value >= 0 && value <= 99_999) {
    return String(value).padStart(5, "0")
  }
  return String(value ?? "").trim()
}

export function parseTerritoryZipWorkbook(buffer: Buffer): TerritoryZipImportRow[] {
  const workbook = XLSX.read(buffer, { type: "buffer", dense: true })
  const sheet = workbook.Sheets[workbook.SheetNames[0]]
  if (!sheet) throw new Error("The workbook does not contain a worksheet.")
  const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, defval: "", raw: true })
  const headers = (rows[0] ?? []).map(normalizedHeader)
  const cityIndex = headers.indexOf("city")
  const zipIndex = headers.findIndex((header) => header === "zip" || header === "zipcode")
  const areaIndex = headers.findIndex((header) => header === "area" || header === "areanotrequired")
  if (cityIndex < 0 || zipIndex < 0) {
    throw new Error('The first row must contain "City" and "Zip" columns. "Area" is optional.')
  }

  const parsed = rows.slice(1)
    .filter((row) => row.some((cell) => String(cell ?? "").trim()))
    .slice(0, MAX_TERRITORY_ZIP_IMPORT_ROWS + 1)
    .map((row, index): TerritoryZipImportRow => {
      const city = String(row[cityIndex] ?? "").trim()
      const zip = zipcode(row[zipIndex])
      const area = areaIndex >= 0 ? String(row[areaIndex] ?? "").trim() || UNASSIGNED_AREA : UNASSIGNED_AREA
      let error: string | undefined
      if (!city) error = "City is required."
      else if (!/^\d{5}$/.test(zip)) error = "ZIP must contain five digits."
      else if (city.length > 100 || area.length > 100) error = "City and Area must be 100 characters or fewer."
      return { rowNumber: index + 2, city, zipcode: zip, area, ...(error ? { error } : {}) }
    })

  if (parsed.length === 0) throw new Error("The worksheet does not contain any ZIP data rows.")
  if (parsed.length > MAX_TERRITORY_ZIP_IMPORT_ROWS) {
    throw new Error(`Import files may contain at most ${MAX_TERRITORY_ZIP_IMPORT_ROWS.toLocaleString()} data rows.`)
  }
  const seen = new Set<string>()
  return parsed.map((row) => {
    if (row.error) return row
    if (seen.has(row.zipcode)) return { ...row, error: "This ZIP appears more than once in the file." }
    seen.add(row.zipcode)
    return row
  })
}
