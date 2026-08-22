import { beforeEach, describe, expect, it, vi } from "vitest"
import { NextRequest } from "next/server"

import { AuthError } from "@/lib/auth"

const mocks = vi.hoisted(() => ({
  applyDictionaryChanges: vi.fn(),
  auditEvent: vi.fn(),
  clientQuery: vi.fn(),
  listDictionaryNames: vi.fn(),
  requireCongregationAdmin: vi.fn(),
  requirePlatformAdmin: vi.fn(),
  validateMutationOrigin: vi.fn(),
}))

vi.mock("@/lib/auth", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/auth")>()),
  auditEvent: mocks.auditEvent,
  requireCongregationAdmin: mocks.requireCongregationAdmin,
  requirePlatformAdmin: mocks.requirePlatformAdmin,
  validateMutationOrigin: mocks.validateMutationOrigin,
}))

vi.mock("@/lib/dictionary", () => ({
  applyDictionaryChanges: mocks.applyDictionaryChanges,
  getDictionarySet: vi.fn(async () => new Set<string>()),
  listDictionaryNames: mocks.listDictionaryNames,
  normalizeDictionaryNames: (values: unknown[]) => Array.from(new Set(values
    .map((value) => String(value ?? "").trim().toLowerCase())
    .filter(Boolean))),
}))

vi.mock("@/lib/db", () => ({
  pool: {
    connect: vi.fn(async () => ({ query: mocks.clientQuery, release: vi.fn() })),
    query: vi.fn(),
  },
}))

const request = (body: Record<string, unknown>) => new NextRequest("https://search.example/api", {
  method: "POST",
  headers: { "Content-Type": "application/json", origin: "https://search.example", host: "search.example" },
  body: JSON.stringify(body),
})

beforeEach(() => {
  process.env.MULTI_TENANT_ENABLED = "true"
  mocks.applyDictionaryChanges.mockReset()
  mocks.auditEvent.mockReset().mockResolvedValue(undefined)
  mocks.clientQuery.mockReset().mockResolvedValue({ rows: [], rowCount: 0 })
  mocks.listDictionaryNames.mockReset().mockResolvedValue(["dupont"])
  mocks.requireCongregationAdmin.mockReset().mockResolvedValue({
    user: { id: 12, isPlatformAdmin: false },
    congregation: { id: 34, slug: "central" },
    membership: { role: "admin" },
  })
  mocks.requirePlatformAdmin.mockReset().mockResolvedValue({ id: 99 })
  mocks.validateMutationOrigin.mockReset()
})

describe("dictionary mutation routes", () => {
  it("lets a congregation admin apply a global dictionary change and audits its origin", async () => {
    mocks.applyDictionaryChanges.mockResolvedValue(["nouveau"])
    const { POST } = await import("@/app/api/c/[slug]/admin/dictionary-feedback/route")
    const response = await POST(request({ action: "add", name: "Nouveau" }), { params: { slug: "central" } })

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({ success: true, applied: ["nouveau"] })
    expect(mocks.validateMutationOrigin).toHaveBeenCalledOnce()
    expect(mocks.applyDictionaryChanges).toHaveBeenCalledWith("add", ["nouveau"], 12)
    expect(mocks.auditEvent).toHaveBeenCalledWith(expect.objectContaining({
      actorUserId: 12,
      congregationId: 34,
      action: "dictionary.add",
      metadata: { names: ["nouveau"] },
    }))
  })

  it("keeps dismissed suggestions congregation-local", async () => {
    const { POST } = await import("@/app/api/c/[slug]/admin/dictionary-feedback/route")
    const response = await POST(request({ action: "dismiss", list: "add", names: ["nouveau"] }), { params: { slug: "central" } })

    expect(response.status).toBe(200)
    expect(mocks.applyDictionaryChanges).not.toHaveBeenCalled()
    expect(mocks.clientQuery).toHaveBeenCalledWith(
      expect.stringContaining("INSERT INTO dismissed_name_feedback"),
      [34, "nouveau", "add"],
    )
    expect(mocks.auditEvent).toHaveBeenCalledWith(expect.objectContaining({
      congregationId: 34,
      action: "dictionary_suggestion.dismissed",
    }))
  })

  it("returns the authorization error without mutating the dictionary", async () => {
    mocks.requireCongregationAdmin.mockRejectedValueOnce(new AuthError(404, "Workspace not found"))
    const { POST } = await import("@/app/api/c/[slug]/admin/dictionary-feedback/route")
    const response = await POST(request({ action: "remove", name: "dupont" }), { params: { slug: "central" } })

    expect(response.status).toBe(404)
    expect(mocks.applyDictionaryChanges).not.toHaveBeenCalled()
  })

  it("preserves platform-owner authorization and response behavior", async () => {
    mocks.applyDictionaryChanges.mockResolvedValue(["dupont"])
    const { POST } = await import("@/app/api/platform/dictionary/route")
    const response = await POST(request({ action: "remove", names: ["Dupont"] }))

    expect(response.status).toBe(200)
    expect(mocks.requirePlatformAdmin).toHaveBeenCalledOnce()
    expect(mocks.applyDictionaryChanges).toHaveBeenCalledWith("remove", ["dupont"], 99)
    expect(mocks.auditEvent).toHaveBeenCalledWith(expect.objectContaining({ action: "dictionary.remove" }))
  })
})
