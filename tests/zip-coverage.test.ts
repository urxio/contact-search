import { beforeEach, describe, expect, it, vi } from "vitest"
import { NextRequest } from "next/server"
import { coverageRanges, pagesIn, segmentState } from "@/lib/zip-coverage"

const mocks = vi.hoisted(() => ({ query: vi.fn(), admin: vi.fn() }))

vi.mock("@/lib/auth", async (original) => ({ ...(await original<typeof import("@/lib/auth")>()), requireCongregationAdmin: mocks.admin }))
vi.mock("@/lib/db", () => ({ pool: { query: mocks.query } }))

const segment = (pageStart: number, pageEnd: number | null, extra: Partial<Parameters<typeof segmentState>[0]> = {}) =>
  ({ pageStart, pageEnd, status: "In progress", ownerUserId: 7, hasExcel: true, ...extra })

describe("coverageRanges", () => {
  it("reports gaps between segments as open", () => {
    const ranges = coverageRanges(100, [segment(41, 60), segment(1, 20, { status: "Completed" })])
    expect(ranges).toEqual([
      { pageStart: 1, pageEnd: 20, state: "completed" },
      { pageStart: 21, pageEnd: 40, state: "open" },
      { pageStart: 41, pageEnd: 60, state: "claimed" },
      { pageStart: 61, pageEnd: 100, state: "open" },
    ])
    expect(pagesIn(ranges, "open")).toBe(60)
  })

  it("treats a missing page end as the last page and clips overlaps", () => {
    expect(coverageRanges(50, [segment(10, 30), segment(25, null)])).toEqual([
      { pageStart: 1, pageEnd: 9, state: "open" },
      { pageStart: 10, pageEnd: 30, state: "claimed" },
      { pageStart: 31, pageEnd: 50, state: "claimed" },
    ])
  })

  it("marks unclaimed uploaded Excels as available", () => {
    expect(segmentState(segment(1, 10, { ownerUserId: null, status: "Not started" }))).toBe("available")
    expect(segmentState(segment(1, 10, { ownerUserId: null, status: "Not started", hasExcel: false }))).toBe("claimed")
  })

  it("returns nothing for a ZIP code without a page total", () => {
    expect(coverageRanges(0, [segment(1, 10)])).toEqual([])
  })
})

describe("admin ZIP coverage API", () => {
  beforeEach(() => {
    process.env.MULTI_TENANT_ENABLED = "true"
    vi.clearAllMocks()
    mocks.admin.mockResolvedValue({ user: { id: 1 }, congregation: { id: 34, settings: {} }, membership: { role: "admin" } })
  })

  it("returns open page ranges for each ZIP code in this congregation", async () => {
    mocks.query
      .mockResolvedValueOnce({ rows: [{ id: 5, city: "Sterling", zipcode: "20164", total_pages: 80, territory: "North" }] })
      .mockResolvedValueOnce({ rows: [{ zipcode_id: 5, page_start: 1, page_end: 40, status: "Not started", owner_user_id: null, has_excel: true }] })
    const { GET } = await import("@/app/api/c/[slug]/admin/zip-coverage/route")
    const response = await GET(new NextRequest("https://search.example/api/c/central/admin/zip-coverage"), { params: { slug: "central" } })
    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toMatchObject({
      areas: ["North"],
      rows: [{ zipcode: "20164", openPages: 40, availablePages: 40, ranges: [
        { pageStart: 1, pageEnd: 40, state: "available" },
        { pageStart: 41, pageEnd: 80, state: "open" },
      ] }],
    })
    expect(mocks.admin).toHaveBeenCalledWith("central")
    for (const call of mocks.query.mock.calls) expect(call[1]).toEqual([34])
  })
})

describe("admin stats API", () => {
  beforeEach(() => {
    process.env.MULTI_TENANT_ENABLED = "true"
    vi.clearAllMocks()
    mocks.admin.mockResolvedValue({ user: { id: 1 }, congregation: { id: 34, settings: {} }, membership: { role: "admin" } })
  })

  it("summarizes the congregation and fills empty weeks", async () => {
    mocks.query
      .mockResolvedValueOnce({ rows: [{ submissions: 3, potentially_french: 9, checked_contacts: 120, pending_reviews: 2 }] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ name: "Ana", checked_contacts: 70, potentially_french: 5 }] })
      .mockResolvedValueOnce({ rows: [{ active: 4 }] })
      .mockResolvedValueOnce({ rows: [{ id: 5, total_pages: 100 }] })
      .mockResolvedValueOnce({ rows: [{ zipcode_id: 5, page_start: 1, page_end: 25, status: "Completed", owner_user_id: 7 }] })
    const { GET } = await import("@/app/api/c/[slug]/admin/stats/route")
    const response = await GET(new NextRequest("https://search.example/api/c/central/admin/stats"), { params: { slug: "central" } })
    const body = await response.json()
    expect(body).toMatchObject({
      checkedContacts: 120, potentiallyFrench: 9, pendingReviews: 2, activeMembers: 4,
      pages: { total: 100, completed: 25, open: 75 },
      topMembers: [{ name: "Ana", checkedContacts: 70 }],
    })
    expect(body.weeks).toHaveLength(12)
  })
})
