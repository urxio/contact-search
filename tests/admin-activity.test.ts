import { beforeEach, describe, expect, it, vi } from "vitest"
import { NextRequest } from "next/server"
import { activityFilter, decodeCursor, encodeCursor } from "@/lib/admin-activity"

const mocks = vi.hoisted(() => ({ query: vi.fn(), admin: vi.fn() }))

vi.mock("@/lib/auth", async (original) => ({ ...(await original<typeof import("@/lib/auth")>()), requireCongregationAdmin: mocks.admin }))
vi.mock("@/lib/db", () => ({ pool: { query: mocks.query } }))

const row = (key: string, kind: string, extra: Record<string, unknown> = {}) => ({
  key, at: "2026-10-21T20:00:00.000Z", kind, actor_user_id: 7, actor_name: "Ana", target_name: null, package_name: null,
  zipcode: "20164", city: "Sterling", page_start: 1, page_end: 40, territory_page_range: null, contact_count: null, status: null,
  first_in_zip: true, ...extra,
})

beforeEach(() => {
  process.env.MULTI_TENANT_ENABLED = "true"
  vi.clearAllMocks()
  mocks.admin.mockResolvedValue({ user: { id: 1 }, congregation: { id: 34 }, membership: { role: "admin" } })
})

describe("activity helpers", () => {
  it("round-trips cursors and rejects junk", () => {
    const cursor = { at: "2026-10-21T20:00:00.000Z", key: "a12" }
    expect(decodeCursor(encodeCursor(cursor))).toEqual(cursor)
    expect(decodeCursor("not-a-cursor")).toBeNull()
  })

  it("falls back to all for unknown filters", () => {
    expect(activityFilter("completed")).toBe("completed")
    expect(activityFilter("bogus")).toBe("all")
  })
})

describe("admin activity API", () => {
  it("returns a page of events scoped to the congregation with a next cursor", async () => {
    mocks.query.mockResolvedValueOnce({ rows: Array.from({ length: 31 }, (_, index) => row(`a${100 - index}`, index === 0 ? "claimed" : "completed")) })
    const { GET } = await import("@/app/api/c/[slug]/admin/activity/route")
    const response = await GET(new NextRequest("https://search.example/api/c/central/admin/activity?filter=all&member=7"), { params: { slug: "central" } })
    const body = await response.json()
    expect(body.events).toHaveLength(30)
    expect(body.events[0]).toMatchObject({ kind: "claimed", actor: { id: 7, name: "Ana" }, zipcode: "20164", firstInZip: true })
    // "New ZIP" is only flagged on claims, not completions.
    expect(body.events[1].firstInZip).toBe(false)
    expect(decodeCursor(body.nextCursor)).toEqual({ at: "2026-10-21T20:00:00.000Z", key: "a71" })
    const [, args] = mocks.query.mock.calls[0]
    expect(args[0]).toBe(34)
    expect(args[4]).toBe(7)
  })

  it("passes only the filter's kinds and the cursor to the query", async () => {
    mocks.query.mockResolvedValueOnce({ rows: [] })
    const { GET } = await import("@/app/api/c/[slug]/admin/activity/route")
    const cursor = encodeCursor({ at: "2026-10-01T00:00:00.000Z", key: "s9" })
    const response = await GET(new NextRequest(`https://search.example/api/c/central/admin/activity?filter=completed&cursor=${cursor}`), { params: { slug: "central" } })
    await expect(response.json()).resolves.toEqual({ events: [], nextCursor: null })
    expect(mocks.query.mock.calls[0][1]).toEqual([34, ["completed"], "2026-10-01T00:00:00.000Z", "s9", null, 31])
  })
})

describe("Team Progress activity logging", () => {
  it("logs a completed status change", async () => {
    const client = { query: vi.fn(), release: vi.fn() }
    client.query
      .mockResolvedValueOnce({}) // BEGIN
      .mockResolvedValueOnce({ rows: [{ id: 5, zipcode_id: 2, status: "In progress", total_pages: 100, zipcode: "20164" }] })
      .mockResolvedValueOnce({}) // advisory lock
      .mockResolvedValueOnce({ rows: [] }) // conflict check
      .mockResolvedValueOnce({ rows: [{ id: 5, status: "Completed" }] })
      .mockResolvedValueOnce({}) // COMMIT
    mocks.query.mockResolvedValue({})
    const db = await import("@/lib/db")
    ;(db.pool as any).connect = vi.fn().mockResolvedValue(client)
    const { PATCH } = await import("@/app/api/c/[slug]/team/segments/route")
    const response = await PATCH(new NextRequest("https://search.example/api/c/central/team/segments", {
      method: "PATCH", headers: { origin: "https://search.example", host: "search.example", "content-type": "application/json" },
      body: JSON.stringify({ id: 5, page_start: 1, page_end: 40, status: "Completed" }),
    }), { params: { slug: "central" } })
    expect(response.status).toBe(200)
    expect(mocks.query).toHaveBeenCalledWith(expect.stringContaining("INSERT INTO audit_events"),
      [1, 34, "team.segment.status_changed", "segment", "5", expect.stringContaining('"status":"Completed"')])
  })
})
