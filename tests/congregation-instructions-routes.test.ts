import { beforeEach, describe, expect, it, vi } from "vitest"
import { NextRequest } from "next/server"
import { AuthError } from "@/lib/auth"

const mocks = vi.hoisted(() => ({ audit: vi.fn(), query: vi.fn(), release: vi.fn(), member: vi.fn(), admin: vi.fn(), origin: vi.fn() }))

vi.mock("@/lib/auth", async (original) => ({
  ...(await original<typeof import("@/lib/auth")>()), auditEvent: mocks.audit,
  requireMembership: mocks.member, requireCongregationAdmin: mocks.admin, validateMutationOrigin: mocks.origin,
}))
vi.mock("@/lib/db", () => ({ pool: { query: mocks.query, connect: async () => ({ query: mocks.query, release: mocks.release }) } }))

const access = { user: { id: 12 }, congregation: { id: 34, slug: "central" }, membership: { role: "admin" } }
const request = (method: string, body?: object, suffix = "") => new NextRequest(`https://search.example/api/c/central/instructions${suffix}`, {
  method, headers: { origin: "https://search.example", host: "search.example", ...(body ? { "Content-Type": "application/json" } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}),
})

beforeEach(() => {
  process.env.MULTI_TENANT_ENABLED = "true"; vi.clearAllMocks()
  mocks.member.mockResolvedValue(access); mocks.admin.mockResolvedValue(access); mocks.query.mockResolvedValue({ rows: [] }); mocks.audit.mockResolvedValue(undefined)
})

describe("congregation instructions API", () => {
  it("returns only ordered instructions for the member's congregation", async () => {
    mocks.query.mockResolvedValueOnce({ rows: [{ id: 8, title: "Call first", body: "Use the directory.", position: 0, revision: 2 }] })
    const { GET } = await import("@/app/api/c/[slug]/instructions/route")
    const response = await GET(request("GET"), { params: { slug: "central" } })
    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({ instructions: [{ id: 8, title: "Call first", body: "Use the directory.", position: 0, revision: 2, audience: "everyone" }] })
    expect(mocks.query).toHaveBeenCalledWith(expect.stringContaining("WHERE congregation_id=$1"), [34, true])
  })

  it("hides admin-only instructions from members", async () => {
    mocks.member.mockResolvedValueOnce({ ...access, user: { id: 12, isPlatformAdmin: false }, membership: { role: "member" } })
    const { GET } = await import("@/app/api/c/[slug]/instructions/route")
    const response = await GET(request("GET"), { params: { slug: "central" } })
    expect(response.status).toBe(200)
    expect(mocks.query).toHaveBeenCalledWith(expect.stringContaining("audience='everyone'"), [34, false])
  })

  it("hides admin-only instructions from a member's notifications", async () => {
    mocks.member.mockResolvedValueOnce({ ...access, membership: { role: "member" } })
    const { GET } = await import("@/app/api/c/[slug]/instructions/route")
    await GET(request("GET", undefined, "?notifications=unviewed"), { params: { slug: "central" } })
    expect(mocks.query).toHaveBeenCalledWith(expect.stringContaining("audience='everyone'"), [34, 12, false])
  })

  it("returns only instruction revisions the member has not viewed when requested for notifications", async () => {
    mocks.query.mockResolvedValueOnce({ rows: [{ id: 8, title: "Call first", body: "Use the directory.", position: 0, revision: 2 }] })
    const { GET } = await import("@/app/api/c/[slug]/instructions/route")
    const response = await GET(request("GET", undefined, "?notifications=unviewed"), { params: { slug: "central" } })
    expect(response.status).toBe(200)
    expect(mocks.query).toHaveBeenCalledWith(expect.stringContaining("congregation_instruction_views"), [34, 12, true])
  })

  it("creates a validated instruction and records its audit event", async () => {
    mocks.query.mockResolvedValueOnce({ rows: [] }).mockResolvedValueOnce({ rows: [] }).mockResolvedValueOnce({ rows: [] }).mockResolvedValueOnce({ rows: [{ id: 8, title: "Call first", body: "Use the directory.", position: 0, revision: 1 }] }).mockResolvedValueOnce({ rows: [] })
    const { POST } = await import("@/app/api/c/[slug]/instructions/route")
    const response = await POST(request("POST", { title: " Call first ", body: " Use the directory. " }), { params: { slug: "central" } })
    expect(response.status).toBe(201)
    expect(mocks.query).toHaveBeenCalledWith(expect.stringContaining("INSERT INTO congregation_instructions"), [34, "Call first", "Use the directory.", 12, "everyone"])
    expect(mocks.query).toHaveBeenCalledWith(expect.stringContaining("position=position+1000000"), [34])
    expect(mocks.audit).toHaveBeenCalledWith(expect.objectContaining({ action: "congregation_instruction.created", targetId: "8" }))
  })

  it("creates an admin-only instruction", async () => {
    mocks.query.mockResolvedValueOnce({ rows: [] }).mockResolvedValueOnce({ rows: [] }).mockResolvedValueOnce({ rows: [] }).mockResolvedValueOnce({ rows: [{ id: 9, title: "Review", body: "Archive weekly.", position: 0, revision: 1, audience: "admins" }] }).mockResolvedValueOnce({ rows: [] })
    const { POST } = await import("@/app/api/c/[slug]/instructions/route")
    const response = await POST(request("POST", { title: "Review", body: "Archive weekly.", audience: "admins" }), { params: { slug: "central" } })
    expect(response.status).toBe(201)
    await expect(response.json()).resolves.toMatchObject({ instruction: { id: 9, audience: "admins" } })
    expect(mocks.query).toHaveBeenCalledWith(expect.stringContaining("INSERT INTO congregation_instructions"), [34, "Review", "Archive weekly.", 12, "admins"])
  })

  it("rejects an unknown audience before writing", async () => {
    const { POST } = await import("@/app/api/c/[slug]/instructions/route")
    const response = await POST(request("POST", { title: "Review", body: "Archive weekly.", audience: "elders" }), { params: { slug: "central" } })
    expect(response.status).toBe(400)
    expect(mocks.query).not.toHaveBeenCalledWith(expect.stringContaining("INSERT INTO congregation_instructions"), expect.anything())
  })

  it("rejects empty instructions before writing", async () => {
    const { POST } = await import("@/app/api/c/[slug]/instructions/route")
    const response = await POST(request("POST", { title: "", body: "" }), { params: { slug: "central" } })
    expect(response.status).toBe(400)
  })

  it("updates within the authenticated congregation and increments the notification revision", async () => {
    mocks.query.mockResolvedValueOnce({ rows: [] }).mockResolvedValueOnce({ rows: [{ id: 8, title: "Updated", body: "New direction", position: 0, revision: 2 }], rowCount: 1 })
    const { PATCH } = await import("@/app/api/c/[slug]/instructions/route")
    const response = await PATCH(request("PATCH", { id: 8, title: "Updated", body: "New direction" }), { params: { slug: "central" } })
    expect(response.status).toBe(200)
    expect(mocks.query).toHaveBeenCalledWith(expect.stringContaining("revision=revision+1"), ["Updated", "New direction", 8, 34, "everyone"])
    expect(mocks.audit).toHaveBeenCalledWith(expect.objectContaining({ action: "congregation_instruction.updated" }))
  })

  it("allows an administrator to persist a new ordering of the same instructions", async () => {
    mocks.query
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ id: 8 }, { id: 7 }] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ id: 7, title: "Second", body: "", position: 0, revision: 1 }, { id: 8, title: "First", body: "", position: 1, revision: 1 }] })
      .mockResolvedValueOnce({ rows: [] })
    const { PATCH } = await import("@/app/api/c/[slug]/instructions/route")
    const response = await PATCH(request("PATCH", { order: [7, 8] }), { params: { slug: "central" } })
    expect(response.status).toBe(200)
    expect(mocks.query).toHaveBeenCalledWith(expect.stringContaining("SET position=$1"), [0, 7, 34])
    expect(mocks.audit).toHaveBeenCalledWith(expect.objectContaining({ action: "congregation_instruction.reordered" }))
  })

  it("requires administrator access for mutations", async () => {
    mocks.admin.mockRejectedValueOnce(new AuthError(404, "Workspace not found"))
    const { POST } = await import("@/app/api/c/[slug]/instructions/route")
    const response = await POST(request("POST", { title: "Private", body: "No access" }), { params: { slug: "central" } })
    expect(response.status).toBe(404)
  })

  it("records a member's view for the exact instruction revision", async () => {
    mocks.query.mockResolvedValueOnce({ rows: [{ id: 8 }], rowCount: 1 }).mockResolvedValueOnce({ rows: [] })
    const { POST } = await import("@/app/api/c/[slug]/instructions/views/route")
    const response = await POST(new NextRequest("https://search.example/api/c/central/instructions/views", {
      method: "POST", headers: { origin: "https://search.example", host: "search.example", "Content-Type": "application/json" }, body: JSON.stringify({ instructionId: 8, revision: 2 }),
    }), { params: { slug: "central" } })
    expect(response.status).toBe(200)
    expect(mocks.query).toHaveBeenCalledWith(expect.stringContaining("INSERT INTO congregation_instruction_views"), [12, 34, 8, 2])
  })

  it("does not let a member acknowledge an admin-only instruction", async () => {
    mocks.member.mockResolvedValueOnce({ ...access, membership: { role: "member" } })
    mocks.query.mockResolvedValueOnce({ rows: [], rowCount: 0 })
    const { POST } = await import("@/app/api/c/[slug]/instructions/views/route")
    const response = await POST(new NextRequest("https://search.example/api/c/central/instructions/views", {
      method: "POST", headers: { origin: "https://search.example", host: "search.example", "Content-Type": "application/json" }, body: JSON.stringify({ instructionId: 9, revision: 1 }),
    }), { params: { slug: "central" } })
    expect(response.status).toBe(404)
    expect(mocks.query).toHaveBeenCalledWith(expect.stringContaining("audience='everyone'"), [9, 34, 1, false])
  })
})
