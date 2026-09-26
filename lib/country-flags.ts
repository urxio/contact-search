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

const subdivisionTags: Record<string, string> = {
  england: "gbeng",
  scotland: "gbsct",
  wales: "gbwls",
}

export function flagForCountry(country: string): string | null {
  const normalized = normalizeCountryName(country)
  const subdivisionTag = subdivisionTags[normalized]
  if (subdivisionTag) {
    return String.fromCodePoint(0x1f3f4,
      ...[...subdivisionTag].map((letter) => 0xe0061 + letter.charCodeAt(0) - 97), 0xe007f)
  }

  const code = countryCodes.get(normalized)
  if (!code) return null
  return [...code].map((letter) => String.fromCodePoint(0x1f1e6 + letter.charCodeAt(0) - 65)).join("")
}
