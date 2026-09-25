export type SurnameCountryEntry = {
  surname: string
  countries: string[]
  source: "onograph" | "manual"
  updatedAt: string
}

export function normalizeSurname(value: unknown): string {
  if (typeof value !== "string") return ""
  return value.normalize("NFC").trim().replace(/\s+/g, " ").toLocaleLowerCase("en")
}

export function validSurname(value: string): boolean {
  return value.length > 0 && value.length <= 120 && !/[\u0000-\u001f\u007f-\u009f]/.test(value)
}

export function parseCountries(value: unknown): string[] | null {
  if (!Array.isArray(value) || value.length < 1 || value.length > 3) return null
  const countries = value.map((country) => typeof country === "string" ? country.normalize("NFC").trim() : "")
  if (countries.some((country) => !country || country.length > 80 || /[\u0000-\u001f\u007f-\u009f]/.test(country))) return null
  if (new Set(countries.map((country) => country.toLocaleLowerCase("en"))).size !== countries.length) return null
  return countries
}

export function forebearsSurnameUrl(surname: string): string {
  return `https://forebears.io/surnames/${encodeURIComponent(normalizeSurname(surname))}`
}
