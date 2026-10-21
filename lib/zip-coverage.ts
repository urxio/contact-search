export type CoverageState = "open" | "available" | "claimed" | "completed"

export type CoverageSegment = {
  pageStart: number
  /** Null means the segment runs to the ZIP code's last page. */
  pageEnd: number | null
  status: string
  ownerUserId: number | null
  hasExcel: boolean
}

export type CoverageRange = { pageStart: number; pageEnd: number; state: CoverageState }

/**
 * - open: no Excel or Team Progress segment covers these pages yet.
 * - available: an Excel is uploaded but nobody has claimed it.
 * - claimed: someone is assigned to, or working on, these pages.
 * - completed: the segment is marked completed.
 */
export function segmentState(segment: CoverageSegment): Exclude<CoverageState, "open"> {
  if (segment.status === "Completed") return "completed"
  if (segment.hasExcel && segment.ownerUserId == null && segment.status === "Not started") return "available"
  return "claimed"
}

/** Splits pages 1..totalPages into contiguous ranges; overlapping segments keep the first one by start page. */
export function coverageRanges(totalPages: number, segments: CoverageSegment[]): CoverageRange[] {
  if (totalPages < 1) return []
  const sorted = [...segments]
    .map((segment) => ({ ...segment, pageEnd: Math.min(segment.pageEnd ?? totalPages, totalPages) }))
    .filter((segment) => segment.pageStart <= totalPages && segment.pageEnd >= segment.pageStart)
    .sort((a, b) => a.pageStart - b.pageStart || a.pageEnd - b.pageEnd)
  const ranges: CoverageRange[] = []
  let next = 1
  for (const segment of sorted) {
    const start = Math.max(segment.pageStart, next)
    if (start > segment.pageEnd) continue
    if (start > next) ranges.push({ pageStart: next, pageEnd: start - 1, state: "open" })
    ranges.push({ pageStart: start, pageEnd: segment.pageEnd, state: segmentState(segment) })
    next = segment.pageEnd + 1
  }
  if (next <= totalPages) ranges.push({ pageStart: next, pageEnd: totalPages, state: "open" })
  return ranges
}

export function pagesIn(ranges: CoverageRange[], state: CoverageState) {
  return ranges.filter((range) => range.state === state).reduce((total, range) => total + range.pageEnd - range.pageStart + 1, 0)
}
