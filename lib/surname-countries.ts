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

export function forebearsSurnameUrl(surname: string): string {
  return `https://forebears.io/surnames/${encodeURIComponent(normalizeSurname(surname))}`
}
