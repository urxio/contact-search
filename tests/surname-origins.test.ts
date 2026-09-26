import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { NextRequest } from "next/server"
import { parseOriginResponse } from "@/lib/surname-origins"

const mocks = vi.hoisted(() => ({ query: vi.fn(), member: vi.fn(), origin: vi.fn() }))
vi.mock("@/lib/db", () => ({ pool: { query: mocks.query } }))
vi.mock("@/lib/auth", async (original) => ({
  ...(await original<typeof import("@/lib/auth")>()),
  requireMembership: mocks.member, validateMutationOrigin: mocks.origin,
}))

const context = { params: { slug: "central" } }
const request = (body: object) => new NextRequest("https://search.example/api/c/central/surname-origins", {
  method: "POST", headers: { origin: "https://search.example", host: "search.example", "Content-Type": "application/json" },
  body: JSON.stringify(body),
})
const row = (surname: string, origins: object[]) => ({
  surname, origins, updated_at: new Date("2026-09-26T12:00:00Z"),
})
const sourcedOrigin = {
  country: "France", explanation: "French occupational surname.",
  sources: [{ title: "Surname history", url: "https://example.org/names/dupont" }],
}
const researchResponse = (origins: unknown[] = [{
  country: "France", explanation: "French occupational surname.",
  source_urls: ["https://example.org/names/dupont"],
}]) => ({
  status: "completed",
  output: [
    { type: "web_search_call", action: { sources: [{ url: "https://example.org/names/dupont", title: "Surname history" }] } },
    { type: "message", content: [{ type: "output_text", text: JSON.stringify({ origins }) }] },
  ],
})

beforeEach(() => {
  vi.clearAllMocks()
  process.env.MULTI_TENANT_ENABLED = "true"
  delete process.env.OPENROUTER_API_KEY
  mocks.member.mockResolvedValue({ user: { id: 12 }, congregation: { id: 34 } })
  mocks.query.mockResolvedValue({ rows: [] })
})
afterEach(() => { vi.unstubAllGlobals() })

describe("origin response validation", () => {
  it("keeps only distinct countries with URLs verified against web-search sources", () => {
    const result = parseOriginResponse(researchResponse([
      { country: "France", explanation: "French surname.", source_urls: ["https://example.org/names/dupont"] },
      { country: "Belgium", explanation: "Claim without a searched source.", source_urls: ["https://unsearched.example/name"] },
      { country: "FRANCE", explanation: "Duplicate.", source_urls: ["https://example.org/names/dupont"] },
    ]))
    expect(result).toEqual([{ country: "France", explanation: "French surname.", sources: sourcedOrigin.sources }])
  })

  it("does not accept a model answer without a web search", () => {
    expect(() => parseOriginResponse({ status: "completed", output: [
      { type: "message", content: [{ type: "output_text", text: JSON.stringify({ origins: [] }) }] },
    ] })).toThrow("did not search")
  })

  it("accepts OpenRouter's search event and annotations even when Luna appends prose", () => {
    const result = parseOriginResponse({ status: "completed", output: [
      { type: "openrouter:web_search" },
      { type: "message", content: [{ type: "output_text",
        text: JSON.stringify({ origins: [{ country: "France", explanation: "French surname.",
          sources: ["https://example.org/names/dupont"] }] }) + "\n\nHistorical surname research only.",
        annotations: [{ type: "url_citation", url: "https://example.org/names/dupont", title: "Surname history" }],
      }] },
    ] })
    expect(result).toEqual([{ country: "France", explanation: "French surname.", sources: sourcedOrigin.sources }])
  })
})

describe("workspace surname origins", () => {
  it("rejects invalid surnames before reading cache or calling OpenAI", async () => {
    const { POST } = await import("@/app/api/c/[slug]/surname-origins/route")
    const response = await POST(request({ surname: "  " }), context)
    expect(response.status).toBe(400)
    expect(mocks.query).not.toHaveBeenCalled()
  })

  it("reuses a cache entry scoped to the member's workspace", async () => {
    mocks.query.mockResolvedValueOnce({ rows: [row("dupré", [sourcedOrigin])] })
    const fetchMock = vi.fn()
    vi.stubGlobal("fetch", fetchMock)
    const { POST } = await import("@/app/api/c/[slug]/surname-origins/route")
    const response = await POST(request({ surname: " Dupré " }), context)
    expect(response.status).toBe(200)
    expect((await response.json()).entry.origins).toEqual([sourcedOrigin])
    expect(mocks.query).toHaveBeenCalledWith(expect.stringContaining("congregation_id=$1"), [34, "dupré"])
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it("requires a web search, caches verified sources, and refreshes instead of reading cache", async () => {
    process.env.OPENROUTER_API_KEY = "test-key"
    mocks.query.mockResolvedValueOnce({ rows: [] }).mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [row("dupont", [sourcedOrigin])] })
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => researchResponse() })
    vi.stubGlobal("fetch", fetchMock)
    const { POST } = await import("@/app/api/c/[slug]/surname-origins/route")
    const response = await POST(request({ surname: "Dupont" }), context)
    expect(response.status).toBe(200)
    const apiBody = JSON.parse(fetchMock.mock.calls[0][1].body)
    expect(apiBody.model).toBe("openai/gpt-6-luna")
    expect(apiBody.tools[0].type).toBe("openrouter:web_search")
    expect(apiBody.tool_choice).toBe("required")
    expect(apiBody.input).toBe(JSON.stringify({ surname: "dupont" }))
    const insert = mocks.query.mock.calls.find(([sql]) => String(sql).includes("INSERT INTO surname_origin_cache"))
    expect(insert?.[1]?.slice(0, 2)).toEqual([34, "dupont"])
    expect(JSON.parse(insert?.[1]?.[2])).toEqual([sourcedOrigin])

    mocks.query.mockClear()
    mocks.query.mockResolvedValueOnce({ rows: [] }).mockResolvedValueOnce({ rows: [row("dupont", [sourcedOrigin])] })
    const refreshed = await POST(request({ surname: "Dupont", refresh: true }), context)
    expect(refreshed.status).toBe(200)
    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(mocks.query.mock.calls[0][0]).toContain("INSERT INTO surname_origin_cache")
  })

  it("returns an inconclusive result when the model's countries have no verified sources", async () => {
    process.env.OPENROUTER_API_KEY = "test-key"
    mocks.query.mockResolvedValueOnce({ rows: [] }).mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [row("unknown", [])] })
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => researchResponse([
      { country: "Atlantis", explanation: "Unsupported.", source_urls: ["https://unsearched.example/name"] },
    ]) }))
    const { POST } = await import("@/app/api/c/[slug]/surname-origins/route")
    const response = await POST(request({ surname: "Unknown" }), context)
    expect(response.status).toBe(200)
    expect((await response.json()).entry.origins).toEqual([])
    expect(mocks.query).toHaveBeenCalledWith(expect.stringContaining("INSERT INTO surname_origin_cache"), [34, "unknown", "[]"])
  })

  it("reports configuration and upstream failures without saving a result", async () => {
    const { POST } = await import("@/app/api/c/[slug]/surname-origins/route")
    expect((await POST(request({ surname: "Dupont" }), context)).status).toBe(503)
    process.env.OPENROUTER_API_KEY = "test-key"
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 429 }))
    const failed = await POST(request({ surname: "Dupont" }), context)
    expect(failed.status).toBe(502)
    expect(mocks.query.mock.calls.every(([sql]) => !String(sql).includes("INSERT"))).toBe(true)
  })
})
