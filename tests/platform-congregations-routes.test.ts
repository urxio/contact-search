import { beforeEach, describe, expect, it, vi } from "vitest"
import { NextRequest } from "next/server"

import { AuthError } from "@/lib/auth"

const mocks = vi.hoisted(() => ({
  auditEvent: vi.fn(),
  clientQuery: vi.fn(),
  poolQuery: vi.fn(),
  release: vi.fn(),
  requirePlatformAdmin: vi.fn(),
  validateMutationOrigin: vi.fn(),
}))

vi.mock("@/lib/auth", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/auth")>()),
  auditEvent: mocks.auditEvent,
  requirePlatformAdmin: mocks.requirePlatformAdmin,
  validateMutationOrigin: mocks.validateMutationOrigin,
}))

vi.mock("@/lib/db", () => ({
  pool: { connect: vi.fn(async () => ({ query: mocks.clientQuery, release: mocks.release })), query: mocks.poolQuery },
}))

function request(body: Record<string, unknown>) {
  return new NextRequest("https://search.example/api/platform/congregations", {
    method: "DELETE",
    headers: { "Content-Type": "application/json", origin: "https://search.example", host: "search.example" },
    body: JSON.stringify(body),
  })
}

function patchRequest(body: Record<string, unknown>) {
  return new NextRequest("https://search.example/api/platform/congregations", {
    method: "PATCH",
    headers: { "Content-Type": "application/json", origin: "https://search.example", host: "search.example" },
    body: JSON.stringify(body),
  })
}

beforeEach(() => {
  process.env.MULTI_TENANT_ENABLED = "true"
  mocks.clientQuery.mockReset().mockResolvedValue({ rows: [], rowCount: 0 })
  mocks.poolQuery.mockReset().mockResolvedValue({ rows: [], rowCount: 0 })
  mocks.auditEvent.mockReset().mockResolvedValue(undefined)
  mocks.release.mockReset()
  mocks.requirePlatformAdmin.mockReset().mockResolvedValue({ id: 99 })
  mocks.validateMutationOrigin.mockReset()
})

describe("platform congregation deletion", () => {
  it("permanently deletes a confirmed congregation and writes an audit record", async () => {
    mocks.clientQuery.mockImplementation((sql: string) => {
      if (sql.includes("SELECT id, name, slug")) return Promise.resolve({ rows: [{ id: 34, name: "Central", slug: "central" }], rowCount: 1 })
      return Promise.resolve({ rows: [], rowCount: 1 })
    })
    const { DELETE } = await import("@/app/api/platform/congregations/route")
    const response = await DELETE(request({ id: 34, confirmation: "CENTRAL" }))

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({ success: true })
    expect(mocks.validateMutationOrigin).toHaveBeenCalledOnce()
    expect(mocks.requirePlatformAdmin).toHaveBeenCalledOnce()
    expect(mocks.clientQuery).toHaveBeenCalledWith(expect.stringContaining("congregation.deleted"), [99, 34, "34", JSON.stringify({ name: "Central", slug: "central" })])
    expect(mocks.clientQuery).toHaveBeenCalledWith("DELETE FROM congregations WHERE id = $1", [34])
    expect(mocks.clientQuery).toHaveBeenCalledWith("COMMIT")
    expect(mocks.release).toHaveBeenCalledOnce()
  })

  it("does not delete when the slug confirmation is wrong", async () => {
    mocks.clientQuery.mockImplementation((sql: string) => sql.includes("SELECT id, name, slug")
      ? Promise.resolve({ rows: [{ id: 34, name: "Central", slug: "central" }], rowCount: 1 })
      : Promise.resolve({ rows: [], rowCount: 0 }))
    const { DELETE } = await import("@/app/api/platform/congregations/route")
    const response = await DELETE(request({ id: 34, confirmation: "wrong" }))

    expect(response.status).toBe(400)
    expect(mocks.clientQuery).not.toHaveBeenCalledWith("DELETE FROM congregations WHERE id = $1", [34])
    expect(mocks.clientQuery).toHaveBeenCalledWith("ROLLBACK")
  })

  it("requires platform-admin authorization before opening a transaction", async () => {
    mocks.requirePlatformAdmin.mockRejectedValueOnce(new AuthError(404, "Not found"))
    const { DELETE } = await import("@/app/api/platform/congregations/route")
    const response = await DELETE(request({ id: 34, confirmation: "central" }))

    expect(response.status).toBe(404)
    expect(mocks.clientQuery).not.toHaveBeenCalled()
  })
})

describe("platform congregation editing", () => {
  it("updates congregation details for a platform admin and audits the change", async () => {
    mocks.poolQuery.mockResolvedValueOnce({ rows: [{ id: 34, name: "New Central", slug: "new-central", status: "active", settings: {} }], rowCount: 1 })
    const { PATCH } = await import("@/app/api/platform/congregations/route")
    const response = await PATCH(patchRequest({ id: 34, name: "New Central", slug: "new-central" }))

    expect(response.status).toBe(200)
    expect(mocks.poolQuery).toHaveBeenCalledWith(expect.stringContaining("UPDATE congregations SET name"), [34, "New Central", "new-central"])
    expect(mocks.auditEvent).toHaveBeenCalledWith(expect.objectContaining({ actorUserId: 99, congregationId: 34, action: "congregation.updated", metadata: { name: "New Central", slug: "new-central" } }))
  })

  it("rejects an invalid congregation slug without updating", async () => {
    const { PATCH } = await import("@/app/api/platform/congregations/route")
    const response = await PATCH(patchRequest({ id: 34, name: "Central", slug: "not a slug" }))

    expect(response.status).toBe(400)
    expect(mocks.poolQuery).not.toHaveBeenCalled()
  })
})
