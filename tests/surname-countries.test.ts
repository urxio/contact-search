import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { NextRequest } from "next/server"
import { forebearsSurnameUrl, normalizeSurname, parseCountries } from "@/lib/surname-countries"

const mocks = vi.hoisted(() => ({ query: vi.fn(), member: vi.fn(), origin: vi.fn(), audit: vi.fn() }))
vi.mock("@/lib/db", () => ({ pool: { query: mocks.query } }))
vi.mock("@/lib/auth", async (original) => ({
  ...(await original<typeof import("@/lib/auth")>()),
  requireMembership: mocks.member, validateMutationOrigin: mocks.origin, auditEvent: mocks.audit,
}))

const context = { params: { slug: "central" } }
const request = (method: string, body?: object) => new NextRequest("https://search.example/api/c/central/surname-countries", {
  method, headers: { origin: "https://search.example", host: "search.example", "Content-Type": "application/json" },
  ...(body ? { body: JSON.stringify(body) } : {}),
})
const row = (surname: string, countries: string[], source: "manual" | "onograph" = "manual") => ({
  surname, countries, source, updated_at: new Date("2026-09-25T12:00:00Z"),
})

beforeEach(() => {
  vi.clearAllMocks()
  process.env.MULTI_TENANT_ENABLED = "true"
  delete process.env.ONOGRAPH_API_KEY
  mocks.member.mockResolvedValue({ user: { id: 12 }, congregation: { id: 34 } })
  mocks.query.mockResolvedValue({ rows: [] })
  mocks.audit.mockResolvedValue(undefined)
})
afterEach(() => { vi.unstubAllGlobals() })

describe("surname country cache", () => {
  it("preserves accents in the cache key and Forebears URL", () => {
    expect(normalizeSurname("  Dupré  ")).toBe("dupré")
    expect(normalizeSurname("Dupre")).toBe("dupre")
    expect(forebearsSurnameUrl("Dupré")).toBe("https://forebears.io/surnames/dupr%C3%A9")
    expect(parseCountries(["France", "france"])).toBeNull()
  })

  it("returns only entries from the member's workspace", async () => {
    mocks.query.mockResolvedValueOnce({ rows: [row("dupré", ["France"]) ] })
    const { GET } = await import("@/app/api/c/[slug]/surname-countries/route")
    const response = await GET(request("GET"), context)
    expect(response.status).toBe(200)
    expect((await response.json()).entries).toEqual([{ surname: "dupré", countries: ["France"], source: "manual", updatedAt: "2026-09-25T12:00:00.000Z" }])
    expect(mocks.query).toHaveBeenCalledWith(expect.stringContaining("WHERE congregation_id=$1"), [34])
  })

  it("saves a manual result for the workspace and audits the change", async () => {
    mocks.query.mockResolvedValueOnce({ rows: [row("dupré", ["France", "Belgium"])] })
    const { POST } = await import("@/app/api/c/[slug]/surname-countries/route")
    const response = await POST(request("POST", { action: "save", surname: " Dupré ", countries: ["France", "Belgium"] }), context)
    expect(response.status).toBe(200)
    expect(mocks.query).toHaveBeenCalledWith(expect.stringContaining("INSERT INTO surname_country_cache"), [34, "dupré", ["France", "Belgium"], 12])
    expect(mocks.audit).toHaveBeenCalledWith(expect.objectContaining({ action: "surname_country.saved", targetId: "dupré" }))
  })

  it("reuses a cached result without contacting OnoGraph", async () => {
    process.env.ONOGRAPH_API_KEY = "test-key"
    mocks.query.mockResolvedValueOnce({ rows: [row("dupont", ["France"])] })
    const fetchMock = vi.fn()
    vi.stubGlobal("fetch", fetchMock)
    const { POST } = await import("@/app/api/c/[slug]/surname-countries/route")
    const response = await POST(request("POST", { action: "lookup", surname: "Dupont" }), context)
    expect(response.status).toBe(200)
    expect((await response.json()).entry.countries).toEqual(["France"])
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it("gets top distribution countries from the official API and caches them", async () => {
    process.env.ONOGRAPH_API_KEY = "test-key"
    mocks.query.mockResolvedValueOnce({ rows: [] }).mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [row("martin", ["France", "Belgium"], "onograph")] })
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ jurisdictions: [
      { jurisdiction: "Belgium", incidence: "10" }, { jurisdiction: "France", incidence: "100" },
    ] }) })
    vi.stubGlobal("fetch", fetchMock)
    const { POST } = await import("@/app/api/c/[slug]/surname-countries/route")
    const response = await POST(request("POST", { action: "lookup", surname: "Martin" }), context)
    expect(response.status).toBe(200)
    expect(fetchMock.mock.calls[0][0].toString()).toContain("type=surname")
    expect(mocks.query).toHaveBeenCalledWith(expect.stringContaining("DO NOTHING"), [34, "martin", ["France", "Belgium"]])
  })
})
