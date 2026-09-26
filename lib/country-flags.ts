function normalizeCountryName(name: string): string {
  return name.normalize("NFKD").replace(/[\u0300-\u036f]/g, "")
    .toLowerCase().replace(/[^a-z0-9]+/g, " ").trim()
}

const countryCodes = new Map<string, string>()

if (typeof Intl.DisplayNames === "function") {
  const regionNames = new Intl.DisplayNames(["en"], { type: "region" })
  for (let first = 65; first <= 90; first++) {
    for (let second = 65; second <= 90; second++) {
      const code = String.fromCharCode(first, second)
      const name = regionNames.of(code)
      if (name && name !== code) countryCodes.set(normalizeCountryName(name), code)
    }
  }
}

for (const [name, code] of Object.entries({
  france: "FR", vietnam: "VN", china: "CN", "united states": "US",
  "united kingdom": "GB", "united states of america": "US", usa: "US", uk: "GB",
  "great britain": "GB", "czech republic": "CZ", "ivory coast": "CI",
  "cote d ivoire": "CI", turkey: "TR", "viet nam": "VN", burma: "MM",
})) countryCodes.set(name, code)

export function flagForCountry(country: string): string | null {
  const code = countryCodes.get(normalizeCountryName(country))
  if (!code) return null
  return [...code].map((letter) => String.fromCodePoint(0x1f1e6 + letter.charCodeAt(0) - 65)).join("")
}
