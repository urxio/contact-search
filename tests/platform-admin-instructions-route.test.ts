import { beforeEach, describe, expect, it, vi } from "vitest"
import { NextRequest } from "next/server"
import { AuthError } from "@/lib/auth"

const mocks = vi.hoisted(() => ({ audit: vi.fn(), query: vi.fn(), release: vi.fn(), platform: vi.fn(), origin: vi.fn() }))

vi.mock("@/lib/auth", async (original) => ({
  ...(await original<typeof import("@/lib/auth")>()), auditEvent: mocks.audit,
  requirePlatformAdmin: mocks.platform, validateMutationOrigin: mocks.origin,
}))
vi.mock("@/lib/db", () => ({ pool: { query: mocks.query, connect: async () => ({ query: mocks.query, release: mocks.release }) } }))

const request = (method: string, body?: object, suffix = "") => new NextRequest(`https://search.example/api/platform/admin-instructions${suffix}`, {
  method, headers: { origin: "https://search.example", host: "search.example", ...(body ? { "Content-Type": "application/json" } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}),
})

beforeEach(() => {
  process.env.MULTI_TENANT_ENABLED = "true"; vi.clearAllMocks()
  mocks.platform.mockResolvedValue({ id: 1, isPlatformAdmin: true }); mocks.query.mockResolvedValue({ rows: [] }); mocks.audit.mockResolvedValue(undefined)
})

describe("platform admin instructions API", () => {
  it("lets the platform admin publish an instruction for congregation admins", async () => {
    mocks.query.mockResolvedValueOnce({ rows: [] }).mockResolvedValueOnce({ rows: [] }).mockResolvedValueOnce({ rows: [] }).mockResolvedValueOnce({ rows: [{ id: 5, title: "Reviewing", body: "Archive weekly.", position: 0, revision: 1 }] }).mockResolvedValueOnce({ rows: [] })
    const { POST } = await import("@/app/api/platform/admin-instructions/route")
    const response = await POST(request("POST", { title: " Reviewing ", body: " Archive weekly. " }))
    expect(response.status).toBe(201)
    await expect(response.json()).resolves.toEqual({ instruction: { id: 5, title: "Reviewing", body: "Archive weekly.", position: 0, revision: 1 } })
    expect(mocks.query).toHaveBeenCalledWith(expect.stringContaining("INSERT INTO platform_admin_instructions"), ["Reviewing", "Archive weekly.", 1])
    expect(mocks.audit).toHaveBeenCalledWith(expect.objectContaining({ action: "platform_admin_instruction.created", targetId: "5" }))
  })

  it("refuses congregation admins and members", async () => {
    mocks.platform.mockRejectedValue(new AuthError(404, "Not found"))
    const { POST, PATCH, DELETE } = await import("@/app/api/platform/admin-instructions/route")
    expect((await POST(request("POST", { title: "Nope", body: "No access" }))).status).toBe(404)
    expect((await PATCH(request("PATCH", { id: 5, title: "Nope", body: "No access" }))).status).toBe(404)
    expect((await DELETE(request("DELETE", undefined, "?id=5"))).status).toBe(404)
    expect(mocks.query).not.toHaveBeenCalledWith(expect.stringMatching(/INSERT|UPDATE platform|DELETE FROM/), expect.anything())
  })

  it("rejects empty instructions before writing", async () => {
    const { POST } = await import("@/app/api/platform/admin-instructions/route")
    const response = await POST(request("POST", { title: "", body: "" }))
    expect(response.status).toBe(400)
  })

  it("updates an instruction and increments its revision", async () => {
    mocks.query.mockResolvedValueOnce({ rows: [] }).mockResolvedValueOnce({ rows: [{ id: 5, title: "Updated", body: "New steps", position: 0, revision: 2 }], rowCount: 1 })
    const { PATCH } = await import("@/app/api/platform/admin-instructions/route")
    const response = await PATCH(request("PATCH", { id: 5, title: "Updated", body: "New steps" }))
    expect(response.status).toBe(200)
    expect(mocks.query).toHaveBeenCalledWith(expect.stringContaining("revision=revision+1"), ["Updated", "New steps", 5])
  })

  it("persists a new ordering of the same instructions", async () => {
    mocks.query
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ id: 5 }, { id: 4 }] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ id: 4, title: "B", body: "b", position: 0, revision: 1 }, { id: 5, title: "A", body: "a", position: 1, revision: 1 }] })
      .mockResolvedValueOnce({ rows: [] })
    const { PATCH } = await import("@/app/api/platform/admin-instructions/route")
    const response = await PATCH(request("PATCH", { order: [4, 5] }))
    expect(response.status).toBe(200)
    expect(mocks.query).toHaveBeenCalledWith(expect.stringContaining("SET position=$1"), [0, 4])
  })

  it("deletes an instruction", async () => {
    mocks.query.mockResolvedValueOnce({ rows: [] }).mockResolvedValueOnce({ rows: [{ position: 0 }], rowCount: 1 })
    const { DELETE } = await import("@/app/api/platform/admin-instructions/route")
    const response = await DELETE(request("DELETE", undefined, "?id=5"))
    expect(response.status).toBe(200)
    expect(mocks.query).toHaveBeenCalledWith(expect.stringContaining("DELETE FROM platform_admin_instructions"), [5])
  })
})
