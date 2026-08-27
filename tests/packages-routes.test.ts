import { beforeEach, describe, expect, it, vi } from "vitest"
import { NextRequest } from "next/server"

const mocks = vi.hoisted(() => ({
  poolQuery: vi.fn(),
  requireMembership: vi.fn(),
}))

vi.mock("@/lib/auth", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/auth")>()),
  requireMembership: mocks.requireMembership,
}))
vi.mock("@/lib/db", () => ({ pool: { query: mocks.poolQuery } }))

beforeEach(() => {
  process.env.MULTI_TENANT_ENABLED = "true"
  mocks.poolQuery.mockReset().mockResolvedValue({ rows: [] })
  mocks.requireMembership.mockReset().mockResolvedValue({
    user: { id: 12 }, congregation: { id: 34, slug: "central" }, membership: { role: "member" },
  })
})

describe("active package alerts", () => {
  it("returns only the viewer's active Excels so the UI can distinguish own uploads from assignments", async () => {
    const { GET } = await import("@/app/api/c/[slug]/packages/route")
    const response = await GET(new NextRequest("https://search.example/api/c/central/packages?active=mine"), { params: { slug: "central" } })

    expect(response.status).toBe(200)
    expect(mocks.poolQuery).toHaveBeenCalledWith(expect.stringContaining("s.owner_user_id=$3"), [34, false, 12, true])
    expect(mocks.poolQuery.mock.calls[0][0]).toContain("s.status <> 'Completed'")
  })
})
