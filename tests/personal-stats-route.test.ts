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
  it("returns a personal period summary", async () => {
    mocks.query
      .mockResolvedValueOnce({ rows: [{ date: "2026-08-21", active_seconds: 600 }] })
      .mockResolvedValueOnce({ rows: [{ potentially_french: 3, checked_contacts: 12 }] })
    const { GET } = await import("@/app/api/c/[slug]/stats/route")
    const response = await GET(new NextRequest("https://search.example/api/c/central/stats?period=week&date=2026-08-21&timeZone=America/New_York"), { params: { slug: "central" } })
    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toMatchObject({
      period: "week", startDate: "2026-08-16", endDate: "2026-08-23", totalActiveSeconds: 600,
      impact: { potentiallyFrench: 3, checkedContacts: 12 },
    })
    expect(mocks.query).toHaveBeenCalledWith(expect.stringContaining("congregation_id=$1 AND user_id=$2"), [34, 12, "2026-08-16", "2026-08-23", "America/New_York"])
    expect(mocks.query).toHaveBeenCalledWith(expect.stringContaining("congregation_id=$1 AND owner_user_id=$2"), [34, 12, "2026-08-16", "2026-08-23", "America/New_York"])
  })

  it("rejects future reporting periods", async () => {
    const { GET } = await import("@/app/api/c/[slug]/stats/route")
    const response = await GET(new NextRequest("https://search.example/api/c/central/stats?date=2099-01-01"), { params: { slug: "central" } })
    expect(response.status).toBe(400)
    expect(mocks.query).not.toHaveBeenCalled()
  })
})
