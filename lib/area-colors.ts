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

export const AREA_COLOR_OPTIONS = [
  { value: "sky", label: "Blue", swatchClass: "bg-sky-500" },
  { value: "violet", label: "Purple", swatchClass: "bg-violet-500" },
  { value: "emerald", label: "Green", swatchClass: "bg-emerald-500" },
  { value: "amber", label: "Gold", swatchClass: "bg-amber-500" },
  { value: "rose", label: "Rose", swatchClass: "bg-rose-500" },
  { value: "cyan", label: "Teal", swatchClass: "bg-cyan-500" },
  { value: "orange", label: "Orange", swatchClass: "bg-orange-500" },
  { value: "fuchsia", label: "Pink", swatchClass: "bg-fuchsia-500" },
] as const

export const AREA_COLOR_VALUES = AREA_COLOR_OPTIONS.map((option) => option.value)

const AREA_COLOR_HEX: Record<string, string> = {
  sky: "#0ea5e9",
  violet: "#8b5cf6",
  emerald: "#10b981",
  amber: "#f59e0b",
  rose: "#f43f5e",
  cyan: "#06b6d4",
  orange: "#f97316",
  fuchsia: "#d946ef",
}

export function isAreaCardHexColor(color: string) {
  return /^#[0-9a-f]{6}$/i.test(color)
}

export function areaCardPickerValue(selectedColor?: string) {
  if (selectedColor && isAreaCardHexColor(selectedColor)) return selectedColor
  return selectedColor ? AREA_COLOR_HEX[selectedColor] ?? "#e2e8f0" : "#e2e8f0"
}

export function areaCardColorStyle(selectedColor?: string) {
  if (!selectedColor || !isAreaCardHexColor(selectedColor)) return undefined
  return { backgroundColor: selectedColor, borderColor: selectedColor }
}

/** Returns a stable, accessible background color for a named territory area. */
export function areaColorClass(area: string | undefined, areaOrder: string[]) {
  if (!area) return ""
  const areaIndex = areaOrder.findIndex((value) => value.localeCompare(area, undefined, { sensitivity: "accent" }) === 0)
  if (areaIndex < 0) return ""
  return AREA_COLOR_CLASSES[areaIndex % AREA_COLOR_CLASSES.length]
}

/** Returns a stable card accent for a named territory area. */
export function areaCardColorClass(area: string, areaOrder: string[], selectedColor?: string) {
  if (area.toLocaleLowerCase() === "unassigned") return "border-border bg-muted/40"
  if (selectedColor && isAreaCardHexColor(selectedColor)) return ""
  const explicitColorIndex = AREA_COLOR_VALUES.indexOf(selectedColor as typeof AREA_COLOR_VALUES[number])
  if (explicitColorIndex >= 0) return AREA_CARD_COLOR_CLASSES[explicitColorIndex]
  const areaIndex = areaOrder.findIndex((value) => value.localeCompare(area, undefined, { sensitivity: "accent" }) === 0)
  return areaIndex < 0 ? "border-border bg-card" : AREA_CARD_COLOR_CLASSES[areaIndex % AREA_CARD_COLOR_CLASSES.length]
}
