import { beforeEach, describe, expect, it, vi } from "vitest"
import { NextRequest } from "next/server"

const mocks = vi.hoisted(() => ({ query: vi.fn(), member: vi.fn(), origin: vi.fn() }))

vi.mock("@/lib/auth", async (original) => ({
  ...(await original<typeof import("@/lib/auth")>()), requireMembership: mocks.member, validateMutationOrigin: mocks.origin,
}))
vi.mock("@/lib/db", () => ({ pool: { query: mocks.query } }))

const admin = { user: { id: 12, isPlatformAdmin: false }, congregation: { id: 34, slug: "central" }, membership: { role: "admin" } }
const member = { ...admin, membership: { role: "member" } }
const get = () => new NextRequest("https://search.example/api/c/central/admin-instructions")
const view = (body: object) => new NextRequest("https://search.example/api/c/central/admin-instructions/views", {
  method: "POST", headers: { origin: "https://search.example", host: "search.example", "Content-Type": "application/json" }, body: JSON.stringify(body),
})

beforeEach(() => {
  process.env.MULTI_TENANT_ENABLED = "true"; vi.clearAllMocks()
  mocks.member.mockResolvedValue(admin); mocks.query.mockResolvedValue({ rows: [] })
})

describe("admin instruction notifications", () => {
  it("returns the admin instructions this admin has not seen in their latest revision", async () => {
    mocks.query.mockResolvedValueOnce({ rows: [{ id: 5, title: "Reviewing", body: "Archive weekly.", position: 0, revision: 2 }] })
    const { GET } = await import("@/app/api/c/[slug]/admin-instructions/route")
    const response = await GET(get(), { params: { slug: "central" } })
    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({ instructions: [{ id: 5, title: "Reviewing", body: "Archive weekly.", position: 0, revision: 2 }] })
    expect(mocks.query).toHaveBeenCalledWith(expect.stringContaining("platform_admin_instruction_views"), [12])
  })

  it("never returns admin instructions to members", async () => {
    mocks.member.mockResolvedValueOnce(member)
    const { GET } = await import("@/app/api/c/[slug]/admin-instructions/route")
    const response = await GET(get(), { params: { slug: "central" } })
    expect(response.status).toBe(404)
    expect(mocks.query).not.toHaveBeenCalled()
  })

  it("records an admin's view of the exact revision", async () => {
    mocks.query.mockResolvedValueOnce({ rows: [{ id: 5 }], rowCount: 1 }).mockResolvedValueOnce({ rows: [] })
    const { POST } = await import("@/app/api/c/[slug]/admin-instructions/views/route")
    const response = await POST(view({ instructionId: 5, revision: 2 }), { params: { slug: "central" } })
    expect(response.status).toBe(200)
    expect(mocks.query).toHaveBeenCalledWith(expect.stringContaining("INSERT INTO platform_admin_instruction_views"), [12, 5, 2])
  })

  it("does not let members record admin instruction views", async () => {
    mocks.member.mockResolvedValueOnce(member)
    const { POST } = await import("@/app/api/c/[slug]/admin-instructions/views/route")
    const response = await POST(view({ instructionId: 5, revision: 2 }), { params: { slug: "central" } })
    expect(response.status).toBe(404)
    expect(mocks.query).not.toHaveBeenCalled()
  })
})
