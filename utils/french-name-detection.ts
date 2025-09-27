export function isPotentiallyFrench(name: string): boolean {
  // Basic heuristic: check for common French name prefixes or suffixes
  const lowerName = name.toLowerCase()
  return (
    lowerName.startsWith("le ") ||
    lowerName.startsWith("la ") ||
    lowerName.startsWith("du ") ||
    lowerName.startsWith("de ") ||
    lowerName.endsWith("eau") ||
    lowerName.endsWith("eux") ||
    lowerName.endsWith("ier")
  )
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
