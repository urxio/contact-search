const AREA_COLOR_CLASSES = [
  "bg-sky-50/80 dark:bg-sky-950/25",
  "bg-violet-50/80 dark:bg-violet-950/25",
  "bg-emerald-50/80 dark:bg-emerald-950/25",
  "bg-amber-50/80 dark:bg-amber-950/25",
  "bg-rose-50/80 dark:bg-rose-950/25",
  "bg-cyan-50/80 dark:bg-cyan-950/25",
  "bg-orange-50/80 dark:bg-orange-950/25",
  "bg-fuchsia-50/80 dark:bg-fuchsia-950/25",
]

const AREA_CARD_COLOR_CLASSES = [
  "border-sky-200 bg-sky-50/80 dark:border-sky-800/60 dark:bg-sky-950/25",
  "border-violet-200 bg-violet-50/80 dark:border-violet-800/60 dark:bg-violet-950/25",
  "border-emerald-200 bg-emerald-50/80 dark:border-emerald-800/60 dark:bg-emerald-950/25",
  "border-amber-200 bg-amber-50/80 dark:border-amber-800/60 dark:bg-amber-950/25",
  "border-rose-200 bg-rose-50/80 dark:border-rose-800/60 dark:bg-rose-950/25",
  "border-cyan-200 bg-cyan-50/80 dark:border-cyan-800/60 dark:bg-cyan-950/25",
  "border-orange-200 bg-orange-50/80 dark:border-orange-800/60 dark:bg-orange-950/25",
  "border-fuchsia-200 bg-fuchsia-50/80 dark:border-fuchsia-800/60 dark:bg-fuchsia-950/25",
]

/** Returns a stable, accessible background color for a named territory area. */
export function areaColorClass(area: string | undefined, areaOrder: string[]) {
  if (!area) return ""
  const areaIndex = areaOrder.findIndex((value) => value.localeCompare(area, undefined, { sensitivity: "accent" }) === 0)
  if (areaIndex < 0) return ""
  return AREA_COLOR_CLASSES[areaIndex % AREA_COLOR_CLASSES.length]
}

/** Returns a stable card accent for a named territory area. */
export function areaCardColorClass(area: string, areaOrder: string[]) {
  if (area.toLocaleLowerCase() === "unassigned") return "border-border bg-muted/40"
  const areaIndex = areaOrder.findIndex((value) => value.localeCompare(area, undefined, { sensitivity: "accent" }) === 0)
  return areaIndex < 0 ? "border-border bg-card" : AREA_CARD_COLOR_CLASSES[areaIndex % AREA_CARD_COLOR_CLASSES.length]
}
