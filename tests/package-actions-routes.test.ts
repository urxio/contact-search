import { beforeEach, describe, expect, it, vi } from "vitest"
import { NextRequest } from "next/server"

const mocks = vi.hoisted(() => ({
  auditEvent: vi.fn(),
  clientQuery: vi.fn(),
  release: vi.fn(),
  requireMembership: vi.fn(),
  validateMutationOrigin: vi.fn(),
}))

vi.mock("@/lib/auth", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/auth")>()),
  auditEvent: mocks.auditEvent,
  requireMembership: mocks.requireMembership,
  validateMutationOrigin: mocks.validateMutationOrigin,
}))
vi.mock("@/lib/db", () => ({
  pool: { connect: vi.fn(async () => ({ query: mocks.clientQuery, release: mocks.release })) },
}))

const packageRow = {
  id: 56, congregation_id: 34, visibility: "private", uploaded_by_user_id: 12,
  segment_id: 91, zipcode_id: 4, zipcode: "22301", city: "Alexandria", page_start: 1, page_end: 5,
  owner_user_id: 12, owner: "Member", status: "In progress", stopped_at_page: null,
  name: "My Excel", original_filename: "my.xlsx", contact_count: 2, contacts: [], created_at: new Date(), updated_at: new Date(), uploader_name: "Member",
}

beforeEach(() => {
  process.env.MULTI_TENANT_ENABLED = "true"
  mocks.clientQuery.mockReset()
  mocks.release.mockReset()
  mocks.requireMembership.mockReset().mockResolvedValue({
    user: { id: 12, displayName: "Member" }, congregation: { id: 34, slug: "central" }, membership: { role: "member" },
  })
  mocks.validateMutationOrigin.mockReset()
})

describe("package release", () => {
  it("shares a released private Excel so it appears in congregation Excels", async () => {
    mocks.clientQuery
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({ rows: [packageRow] })
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({ rows: [{ ...packageRow, visibility: "shared", owner_user_id: null, owner: "", status: "Not started" }] })
      .mockResolvedValueOnce({})
    const { POST } = await import("@/app/api/c/[slug]/packages/[id]/route")
    const response = await POST(new NextRequest("https://search.example/api/c/central/packages/56", {
      method: "POST", headers: { origin: "https://search.example", host: "search.example", "content-type": "application/json" }, body: JSON.stringify({ action: "release" }),
    }), { params: { slug: "central", id: "56" } })

    expect(response.status).toBe(200)
    expect(mocks.clientQuery).toHaveBeenCalledWith(expect.stringContaining("UPDATE contact_packages SET visibility='shared'"), [56, 34])
    expect(mocks.release).toHaveBeenCalledOnce()
  })
})
