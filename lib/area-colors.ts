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

/** Returns a stable, accessible background color for a named territory area. */
export function areaColorClass(area: string | undefined, areaOrder: string[]) {
  if (!area) return ""
  const areaIndex = areaOrder.findIndex((value) => value.localeCompare(area, undefined, { sensitivity: "accent" }) === 0)
  if (areaIndex < 0) return ""
  return AREA_COLOR_CLASSES[areaIndex % AREA_COLOR_CLASSES.length]
}
