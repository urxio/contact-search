export const UNASSIGNED_TEAM_AREA = "Unassigned"

export function orderedTeamAreas(areas: string[], preferredOrder: unknown): string[] {
  const canonicalByKey = new Map<string, string>()
  for (const value of areas) {
    const area = String(value ?? "").trim()
    if (area && !canonicalByKey.has(area.toLocaleLowerCase())) canonicalByKey.set(area.toLocaleLowerCase(), area)
  }

  const unassignedKey = UNASSIGNED_TEAM_AREA.toLocaleLowerCase()
  const ordered: string[] = []
  const included = new Set<string>()
  if (Array.isArray(preferredOrder)) {
    for (const value of preferredOrder) {
      const key = String(value ?? "").trim().toLocaleLowerCase()
      const area = canonicalByKey.get(key)
      if (area && key !== unassignedKey && !included.has(key)) {
        ordered.push(area)
        included.add(key)
      }
    }
  }

  const remaining = Array.from(canonicalByKey)
    .filter(([key]) => key !== unassignedKey && !included.has(key))
    .map(([, area]) => area)
    .sort((a, b) => a.localeCompare(b))
  ordered.push(...remaining)

  const unassigned = canonicalByKey.get(unassignedKey)
  if (unassigned) ordered.push(unassigned)
  return ordered
}
