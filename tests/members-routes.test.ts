import { beforeEach, describe, expect, it, vi } from "vitest"
import { NextRequest } from "next/server"

const mocks = vi.hoisted(() => ({
  auditEvent: vi.fn(),
  poolQuery: vi.fn(),
  requireCongregationAdmin: vi.fn(),
  validateMutationOrigin: vi.fn(),
}))

vi.mock("@/lib/auth", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/auth")>()),
  auditEvent: mocks.auditEvent,
  requireCongregationAdmin: mocks.requireCongregationAdmin,
  validateMutationOrigin: mocks.validateMutationOrigin,
}))

vi.mock("@/lib/db", () => ({ pool: { query: mocks.poolQuery } }))

beforeEach(() => {
  process.env.MULTI_TENANT_ENABLED = "true"
  mocks.auditEvent.mockReset().mockResolvedValue(undefined)
  mocks.poolQuery.mockReset()
  mocks.requireCongregationAdmin.mockReset().mockResolvedValue({
    user: { id: 12 }, congregation: { id: 34, slug: "central" }, membership: { role: "admin" },
  })
  mocks.validateMutationOrigin.mockReset()
})

describe("congregation members", () => {
  it("permanently deletes a different member's congregation membership", async () => {
    mocks.poolQuery.mockResolvedValueOnce({ rows: [{ id: 56 }] })
    const { DELETE } = await import("@/app/api/c/[slug]/members/route")
    const request = new NextRequest("https://search.example/api/c/central/members?userId=78", {
      method: "DELETE", headers: { origin: "https://search.example", host: "search.example" },
    })

    const response = await DELETE(request, { params: { slug: "central" } })

    expect(response.status).toBe(200)
    expect(mocks.validateMutationOrigin).toHaveBeenCalledWith(request)
    expect(mocks.poolQuery).toHaveBeenCalledWith(expect.stringContaining("DELETE FROM congregation_memberships"), [34, 78])
    expect(mocks.poolQuery.mock.calls[0][0]).not.toContain("UPDATE congregation_memberships")
    expect(mocks.auditEvent).toHaveBeenCalledWith(expect.objectContaining({ action: "membership.deleted", targetId: "78" }))
  })

  it("does not allow an admin to delete their own membership", async () => {
    const { DELETE } = await import("@/app/api/c/[slug]/members/route")
    const response = await DELETE(new NextRequest("https://search.example/api/c/central/members?userId=12", { method: "DELETE" }), { params: { slug: "central" } })

    expect(response.status).toBe(400)
    expect(mocks.poolQuery).not.toHaveBeenCalled()
  })
})
