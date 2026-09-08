export type CoveredRange = { pageStart: number; pageEnd: number | null }
export type PageRange = { pageStart: number; pageEnd: number }
export type StatsPeriod = "day" | "week" | "month"

const datePattern = /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/

export function validStatsPeriod(value: string | null): StatsPeriod {
  return value === "day" || value === "week" || value === "month" ? value : "month"
}

export function validStatsDate(value: string | null) {
  if (!value || !datePattern.test(value)) return null
  const date = new Date(`${value}T12:00:00Z`)
  return Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value ? null : value
}

export function statsPeriodRange(period: StatsPeriod, anchor: string) {
  const start = new Date(`${anchor}T00:00:00Z`)
  const end = new Date(start)
  if (period === "day") end.setUTCDate(end.getUTCDate() + 1)
  if (period === "week") {
    start.setUTCDate(start.getUTCDate() - start.getUTCDay())
    end.setTime(start.getTime())
    end.setUTCDate(end.getUTCDate() + 7)
  }
  if (period === "month") {
    start.setUTCDate(1)
    end.setTime(start.getTime())
    end.setUTCMonth(end.getUTCMonth() + 1)
  }
  return { startDate: start.toISOString().slice(0, 10), endDate: end.toISOString().slice(0, 10) }
}

export function localDateForTimeZone(timeZone: string, now = new Date()) {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(now)
  const value = (type: string) => parts.find((part) => part.type === type)?.value || ""
  return `${value("year")}-${value("month")}-${value("day")}`
}

export function uncoveredPageRanges(totalPages: number, ranges: CoveredRange[]): PageRange[] {
  if (!Number.isSafeInteger(totalPages) || totalPages < 1) return []
  const normalized = ranges
    .map((range) => ({
      pageStart: Math.max(1, Math.trunc(range.pageStart)),
      pageEnd: Math.min(totalPages, Math.trunc(range.pageEnd ?? totalPages)),
    }))
    .filter((range) => Number.isSafeInteger(range.pageStart) && Number.isSafeInteger(range.pageEnd) && range.pageStart <= range.pageEnd)
    .sort((left, right) => left.pageStart - right.pageStart || left.pageEnd - right.pageEnd)

  const merged: PageRange[] = []
  for (const range of normalized) {
    const previous = merged[merged.length - 1]
    if (!previous || range.pageStart > previous.pageEnd + 1) merged.push({ ...range })
    else previous.pageEnd = Math.max(previous.pageEnd, range.pageEnd)
  }

  const gaps: PageRange[] = []
  let cursor = 1
  for (const range of merged) {
    if (cursor < range.pageStart) gaps.push({ pageStart: cursor, pageEnd: range.pageStart - 1 })
    cursor = Math.max(cursor, range.pageEnd + 1)
  }
  if (cursor <= totalPages) gaps.push({ pageStart: cursor, pageEnd: totalPages })
  return gaps
}

export function validTimeZone(value: string) {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: value }).format()
    return value
  } catch {
    return "UTC"
  }
}

export function activityStreak(days: Array<{ date: string; activeSeconds: number }>, month: string, today: string) {
  const active = new Set(days.filter((day) => day.activeSeconds > 0).map((day) => day.date))
  const latestActiveDate = Array.from(active).sort().at(-1)
  if (!latestActiveDate) return 0
  const cursor = month === today.slice(0, 7) ? new Date(`${today}T00:00:00Z`) : new Date(`${latestActiveDate}T00:00:00Z`)
  if (month === today.slice(0, 7) && !active.has(today)) cursor.setUTCDate(cursor.getUTCDate() - 1)
  let streak = 0
  while (cursor.toISOString().slice(0, 7) === month && active.has(cursor.toISOString().slice(0, 10))) {
    streak += 1
    cursor.setUTCDate(cursor.getUTCDate() - 1)
  }
  return streak
}
