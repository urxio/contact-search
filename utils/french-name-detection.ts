let DICT: Set<string> | null = null

export async function loadDictionaryIfNeeded(): Promise<void> {
  if (DICT) return
  try {
    // use the cleaned suggestion dictionary (merged/normalized)
    const resp = await fetch("/name-dictionary-cleaned-suggestion.txt")
    const txt = await resp.text()
    const names = txt
      .split(/\r?\n/)
      .map((s) => s.trim())
      .filter(Boolean)
      .map((s) => s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, ""))
    DICT = new Set(names)
  } catch (err) {
    console.warn("Failed to load name dictionary:", err)
    DICT = null
  }
}

export function isPotentiallyFrench(name: string): boolean {
  const raw = (name || "").toString().trim()
  if (!raw) return false

  // Normalize and remove diacritics for robust matching
    const normalized = raw.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "")

  // Tokenize into words (first, middle, last, hyphenated parts)
    const cleanedWhole = normalized.replace(/[^a-z\-\s']/g, "").trim()
    const tokens = cleanedWhole
    .split(/\s+/)
    .map((t) => t.replace(/[^a-z\-']/g, ""))
    .filter(Boolean)

  // Quick dictionary check on whole name
    if (DICT && DICT.has(cleanedWhole)) return true

  // Check each token against dictionary
  if (DICT) {
    for (const t of tokens) {
      if (DICT.has(t)) return true
    }
  }

  // Heuristic fallback: check tokens for common French prefixes/suffixes
  for (const t of tokens) {
    if (t.startsWith("le") || t.startsWith("la") || t.startsWith("du") || t.startsWith("de")) return true
    if (t.endsWith("eau") || t.endsWith("eux") || t.endsWith("ier")) return true
  }

  // Also apply heuristics to the full normalized name (covers "le xxx" patterns)
  return normalized.startsWith("le ") || normalized.startsWith("la ") || normalized.startsWith("du ") || normalized.startsWith("de ")
}

export function analyzeSurnames(surnames: string[]): { frenchCount: number; total: number } {
  let frenchCount = 0
  for (const surname of surnames) {
    if (isPotentiallyFrench(surname)) {
      frenchCount++
    }
  }
  return { frenchCount, total: surnames.length }
}

export function isDictionaryLoaded(): boolean {
  return DICT !== null
}
