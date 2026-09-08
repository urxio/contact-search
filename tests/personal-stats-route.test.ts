import { beforeEach, describe, expect, it, vi } from "vitest"
import { NextRequest } from "next/server"

const mocks = vi.hoisted(() => ({ query: vi.fn(), member: vi.fn() }))

vi.mock("@/lib/auth", async (original) => ({ ...(await original<typeof import("@/lib/auth")>()), requireMembership: mocks.member }))
vi.mock("@/lib/db", () => ({ pool: { query: mocks.query } }))

const access = { user: { id: 12 }, congregation: { id: 34, slug: "central" }, membership: { role: "member" } }

beforeEach(() => {
  process.env.MULTI_TENANT_ENABLED = "true"
  vi.clearAllMocks()
  mocks.member.mockResolvedValue(access)
})

describe("personal stats API", () => {
  it("returns a period summary with anonymous congregation benchmarks", async () => {
    mocks.query
      .mockResolvedValueOnce({ rows: [{ date: "2026-08-21", active_seconds: 600 }] })
      .mockResolvedValueOnce({ rows: [
        { user_id: 12, active_seconds: 600, potentially_french: 3, checked_contacts: 12 },
        { user_id: 13, active_seconds: 300, potentially_french: 1, checked_contacts: 8 },
        { user_id: 14, active_seconds: 900, potentially_french: 2, checked_contacts: 10 },
      ] })
    const { GET } = await import("@/app/api/c/[slug]/stats/route")
    const response = await GET(new NextRequest("https://search.example/api/c/central/stats?period=week&date=2026-08-21&timeZone=America/New_York"), { params: { slug: "central" } })
    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toMatchObject({
      period: "week", startDate: "2026-08-16", endDate: "2026-08-23", totalActiveSeconds: 600,
      impact: { potentiallyFrench: 3, checkedContacts: 12, congregationFrenchNames: 6, congregationShare: 50 },
      comparison: { contributorCount: 3, time: { average: 600, percentile: 67 }, frenchNames: { average: 2, percentile: 100 } },
    })
    expect(mocks.query).toHaveBeenCalledWith(expect.stringContaining("congregation_id=$1 AND user_id=$2"), [34, 12, "2026-08-16", "2026-08-23", "America/New_York"])
    expect(mocks.query).toHaveBeenCalledWith(expect.stringContaining("membership.status='active'"), [34, "2026-08-16", "2026-08-23", "America/New_York"])
  })

  it("withholds comparisons until three members contribute", async () => {
    mocks.query.mockResolvedValueOnce({ rows: [] }).mockResolvedValueOnce({ rows: [{ user_id: 12, active_seconds: 30, potentially_french: 0, checked_contacts: 0 }] })
    const { GET } = await import("@/app/api/c/[slug]/stats/route")
    const response = await GET(new NextRequest("https://search.example/api/c/central/stats?period=day&date=2026-08-21"), { params: { slug: "central" } })
    await expect(response.json()).resolves.toMatchObject({ comparison: null })
  })

  it("rejects future reporting periods", async () => {
    const { GET } = await import("@/app/api/c/[slug]/stats/route")
    const response = await GET(new NextRequest("https://search.example/api/c/central/stats?date=2099-01-01"), { params: { slug: "central" } })
    expect(response.status).toBe(400)
    expect(mocks.query).not.toHaveBeenCalled()
  })
})
