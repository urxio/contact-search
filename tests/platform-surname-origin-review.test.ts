import { beforeEach, describe, expect, it, vi } from "vitest"
import { NextRequest } from "next/server"

const mocks = vi.hoisted(() => ({ query: vi.fn(), admin: vi.fn(), origin: vi.fn(), audit: vi.fn() }))
vi.mock("@/lib/db", () => ({ pool: { query: mocks.query } }))
vi.mock("@/lib/auth", async (original) => ({
  ...(await original<typeof import("@/lib/auth")>()),
  requirePlatformAdmin: mocks.admin, validateMutationOrigin: mocks.origin, auditEvent: mocks.audit,
}))

const request = (body: object) => new NextRequest("https://search.example/api/platform/surname-origins", {
  method: "POST", headers: { origin: "https://search.example", host: "search.example", "Content-Type": "application/json" },
  body: JSON.stringify(body),
})

beforeEach(() => {
  vi.clearAllMocks()
  process.env.MULTI_TENANT_ENABLED = "true"
  mocks.admin.mockResolvedValue({ id: 7 })
  mocks.audit.mockResolvedValue(undefined)
  mocks.query.mockResolvedValue({ rows: [] })
})

describe("platform unclear origin review", () => {
  it("lists unresolved and manually reviewed surnames with the requesting contacts", async () => {
    mocks.query.mockImplementation(async (sql: string) => ({ rows: sql.includes("SELECT surname,origins") ? [
      { surname: "unknown", origins: [], updated_at: new Date("2026-09-25"), reviewed_at: null },
      { surname: "dupont", origins: [{ country: "France" }], updated_at: new Date("2026-09-26"), reviewed_at: new Date("2026-09-26") },
    ] : [{ surname: "unknown", congregation_name: "Central", contact_name: "Alice Unknown" }] }))
    const { GET } = await import("@/app/api/platform/surname-origins/route")
    const response = await GET()
    expect(response.status).toBe(200)
    expect(await response.json()).toMatchObject({ entries: [
      { surname: "unknown", origins: [], reviewedAt: null, contacts: [{ name: "Alice Unknown", congregation: "Central" }] },
      { surname: "dupont", reviewedAt: expect.any(String), contacts: [] },
    ] })
  })

  it("sets a reviewed country in the shared cache and audits the change", async () => {
    mocks.query.mockResolvedValueOnce({ rows: [{
      surname: "unknown", updated_at: new Date("2026-09-26"), reviewed_at: new Date("2026-09-26"),
    }] })
    const { POST } = await import("@/app/api/platform/surname-origins/route")
    const response = await POST(request({ surname: " Unknown ", country: " France " }))
    expect(response.status).toBe(200)
    expect((await response.json()).entry.origins[0].country).toBe("France")
    expect(mocks.query).toHaveBeenCalledWith(expect.stringContaining("UPDATE platform_surname_origin_cache"), [
      JSON.stringify([{ country: "France", explanation: "Set by the platform owner after manual review.", sources: [] }]), 7, "unknown",
    ])
    expect(mocks.audit).toHaveBeenCalledWith(expect.objectContaining({
      action: "surname_origin.manual_country_set", targetId: "unknown", metadata: { country: "France" },
    }))
  })

  it("rejects invalid countries and non-owners", async () => {
    const { POST, GET } = await import("@/app/api/platform/surname-origins/route")
    expect((await POST(request({ surname: "Unknown", country: " " }))).status).toBe(400)
    expect(mocks.query).not.toHaveBeenCalled()
    const { AuthError } = await import("@/lib/auth")
    mocks.admin.mockRejectedValueOnce(new AuthError(404, "Not found"))
    expect((await GET()).status).toBe(404)
    expect(mocks.query).not.toHaveBeenCalled()
  })
})
