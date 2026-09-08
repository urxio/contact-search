import { afterEach, describe, expect, it, vi } from "vitest"

import { activityStreak, localDateForTimeZone, statsPeriodRange, uncoveredPageRanges, validStatsDate, validStatsPeriod, validTimeZone } from "@/lib/personal-stats"
import { SEARCH_ACTIVITY_IDLE_MS, searchActivityBucketStart, searchActivityQualifies } from "@/lib/search-activity"

describe("personal stats uncovered ranges", () => {
  it("returns the full ZIP when it has no segments", () => {
    expect(uncoveredPageRanges(100, [])).toEqual([{ pageStart: 1, pageEnd: 100 }])
  })

  it("merges adjacent, overlapping, and open-ended coverage", () => {
    expect(uncoveredPageRanges(100, [
      { pageStart: 1, pageEnd: 10 },
      { pageStart: 8, pageEnd: 20 },
      { pageStart: 21, pageEnd: 30 },
      { pageStart: 61, pageEnd: null },
    ])).toEqual([{ pageStart: 31, pageEnd: 60 }])
  })

  it("handles complete coverage and clamps legacy out-of-bound ranges", () => {
    expect(uncoveredPageRanges(50, [{ pageStart: -10, pageEnd: 70 }])).toEqual([])
    expect(uncoveredPageRanges(0, [])).toEqual([])
  })
})

describe("personal stats activity rules", () => {
  afterEach(() => vi.useRealTimers())

  it("pauses after five minutes of inactivity", () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date("2026-08-21T12:00:00Z"))
    const lastInteractionAt = Date.now()
    expect(searchActivityQualifies({ visibilityState: "visible", focused: true, lastInteractionAt })).toBe(true)
    vi.advanceTimersByTime(SEARCH_ACTIVITY_IDLE_MS)
    expect(searchActivityQualifies({ visibilityState: "visible", focused: true, lastInteractionAt })).toBe(false)
  })

  it("requires a visible and focused page", () => {
    const recent = Date.now()
    expect(searchActivityQualifies({ visibilityState: "hidden", focused: true, lastInteractionAt: recent })).toBe(false)
    expect(searchActivityQualifies({ visibilityState: "visible", focused: false, lastInteractionAt: recent })).toBe(false)
  })

  it("normalizes activity into stable thirty-second buckets", () => {
    expect(searchActivityBucketStart(new Date("2026-08-21T12:00:29.999Z").getTime())).toBe(new Date("2026-08-21T12:00:00.000Z").getTime())
    expect(searchActivityBucketStart(new Date("2026-08-21T12:00:30.000Z").getTime())).toBe(new Date("2026-08-21T12:00:30.000Z").getTime())
  })
})

describe("personal stats calendar helpers", () => {
  it("calculates a streak ending on today", () => {
    expect(activityStreak([
      { date: "2026-08-19", activeSeconds: 30 },
      { date: "2026-08-20", activeSeconds: 30 },
      { date: "2026-08-21", activeSeconds: 30 },
    ], "2026-08", "2026-08-21")).toBe(3)
  })

  it("falls back to UTC for invalid timezones", () => {
    expect(validTimeZone("America/New_York")).toBe("America/New_York")
    expect(validTimeZone("Not/A_Timezone")).toBe("UTC")
  })

  it("normalizes reporting periods to local calendar boundaries", () => {
    expect(validStatsPeriod("week")).toBe("week")
    expect(validStatsPeriod("year")).toBe("month")
    expect(validStatsDate("2026-02-29")).toBeNull()
    expect(validStatsDate("2026-02-28")).toBe("2026-02-28")
    expect(statsPeriodRange("day", "2026-08-21")).toEqual({ startDate: "2026-08-21", endDate: "2026-08-22" })
    expect(statsPeriodRange("week", "2026-08-21")).toEqual({ startDate: "2026-08-16", endDate: "2026-08-23" })
    expect(statsPeriodRange("month", "2026-08-21")).toEqual({ startDate: "2026-08-01", endDate: "2026-09-01" })
  })

  it("formats the current date in the requested timezone", () => {
    expect(localDateForTimeZone("America/New_York", new Date("2026-08-21T02:00:00Z"))).toBe("2026-08-20")
  })
})
