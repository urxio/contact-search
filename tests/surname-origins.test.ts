import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { NextRequest } from "next/server"
import { parseForebearsFetch, parseOriginResponse } from "@/lib/surname-origins"

const mocks = vi.hoisted(() => ({ query: vi.fn(), member: vi.fn(), origin: vi.fn() }))
vi.mock("@/lib/db", () => ({ pool: { query: mocks.query } }))
vi.mock("@/lib/auth", async (original) => ({
  ...(await original<typeof import("@/lib/auth")>()),
  requireMembership: mocks.member, validateMutationOrigin: mocks.origin,
}))

const context = { params: { slug: "central" } }
const request = (body: object, slug = "central") => new NextRequest(`https://search.example/api/c/${slug}/surname-origins`, {
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

describe("platform surname origin cache", () => {
  it("rejects invalid surnames before reading cache or calling OpenAI", async () => {
    const { POST } = await import("@/app/api/c/[slug]/surname-origins/route")
    const response = await POST(request({ surname: "  " }), context)
    expect(response.status).toBe(400)
    expect(mocks.query).not.toHaveBeenCalled()
  })

  it("reuses a cached surname across workspaces after checking membership", async () => {
    process.env.OPENROUTER_API_KEY = "test-key"
    const cache = new Map<string, ReturnType<typeof row>>()
    mocks.query.mockImplementation(async (sql: string, values: string[]) => {
      if (sql.includes("INSERT INTO platform_surname_origin_cache")) {
        cache.set(values[0], row(values[0], JSON.parse(values[1])))
        return { rows: [] }
      }
      const cached = cache.get(values[0])
      return { rows: cached ? [cached] : [] }
    })
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => researchResponse() })
    vi.stubGlobal("fetch", fetchMock)
    const { POST } = await import("@/app/api/c/[slug]/surname-origins/route")
    expect((await POST(request({ surname: "Dupont" }), context)).status).toBe(200)
    mocks.member.mockResolvedValueOnce({ user: { id: 56 }, congregation: { id: 78 } })
    const response = await POST(request({ surname: " DUPONT " }, "west"), { params: { slug: "west" } })
    expect(response.status).toBe(200)
    expect(await response.json()).toMatchObject({ cached: true, entry: { origins: [sourcedOrigin] } })
    expect(mocks.member).toHaveBeenLastCalledWith("west")
    expect(mocks.query).toHaveBeenCalledWith(expect.stringContaining("WHERE surname=$1"), ["dupont"])
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it("returns an existing platform cache entry without an API call", async () => {
    mocks.query.mockResolvedValueOnce({ rows: [row("dupré", [sourcedOrigin])] })
    const fetchMock = vi.fn()
    vi.stubGlobal("fetch", fetchMock)
    const { POST } = await import("@/app/api/c/[slug]/surname-origins/route")
    const response = await POST(request({ surname: " Dupré " }), context)
    expect(response.status).toBe(200)
    expect((await response.json()).entry.origins).toEqual([sourcedOrigin])
    expect(mocks.query).toHaveBeenCalledWith(expect.stringContaining("WHERE surname=$1"), ["dupré"])
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it("does not expose the shared cache without workspace membership", async () => {
    const { AuthError } = await import("@/lib/auth")
    mocks.member.mockRejectedValueOnce(new AuthError(403, "Access denied"))
    const { POST } = await import("@/app/api/c/[slug]/surname-origins/route")
    const response = await POST(request({ surname: "Dupont" }), context)
    expect(response.status).toBe(403)
    expect(mocks.query).not.toHaveBeenCalled()
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
    const insert = mocks.query.mock.calls.find(([sql]) => String(sql).includes("INSERT INTO platform_surname_origin_cache"))
    expect(insert?.[1]?.[0]).toBe("dupont")
    expect(JSON.parse(insert?.[1]?.[1])).toEqual([sourcedOrigin])

    mocks.query.mockClear()
    mocks.query.mockResolvedValueOnce({ rows: [] }).mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [row("dupont", [sourcedOrigin])] })
    const refreshed = await POST(request({ surname: "Dupont", refresh: true }), context)
    expect(refreshed.status).toBe(200)
    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(mocks.query.mock.calls[0][0]).toContain("SELECT surname,origins")
    expect(mocks.query.mock.calls[1][0]).toContain("INSERT INTO platform_surname_origin_cache")
  })

  it("keeps a platform owner's manual country when a workspace requests a refresh", async () => {
    const manual = { ...row("unknown", [{ country: "France", explanation: "Set by the platform owner after manual review.", sources: [] }]),
      reviewed_at: new Date("2026-09-26") }
    mocks.query.mockResolvedValueOnce({ rows: [manual] })
    const fetchMock = vi.fn()
    vi.stubGlobal("fetch", fetchMock)
    const { POST } = await import("@/app/api/c/[slug]/surname-origins/route")
    const response = await POST(request({ surname: "Unknown", refresh: true }), context)
    expect(response.status).toBe(200)
    expect(await response.json()).toMatchObject({ cached: true, entry: { origins: [{ country: "France" }] } })
    expect(fetchMock).not.toHaveBeenCalled()
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
    expect(mocks.query).toHaveBeenCalledWith(expect.stringContaining("INSERT INTO platform_surname_origin_cache"), ["unknown", "[]"])
  })

  it("records the contact for a cached unclear surname", async () => {
    mocks.query.mockResolvedValueOnce({ rows: [row("unknown", [])] }).mockResolvedValue({ rows: [] })
    const { POST } = await import("@/app/api/c/[slug]/surname-origins/route")
    const response = await POST(request({ surname: "Unknown", contactId: "person-1", contactName: "Alice Unknown" }), context)
    expect(response.status).toBe(200)
    expect(mocks.query).toHaveBeenCalledWith(
      expect.stringContaining("INSERT INTO platform_surname_origin_review_contacts"),
      ["unknown", 34, "person-1", "Alice Unknown"],
    )
  })

  describe("Forebears stage", () => {
    const forebearsPage = (content: string) => ({ ok: true, json: async () => ({ status: "completed",
      output: [{ type: "openrouter:web_fetch", url: "https://forebears.io/surnames/ajina", content }] }) })

    it("saves the Forebears countries for a new surname", async () => {
      process.env.OPENROUTER_API_KEY = "test-key"
      mocks.query.mockResolvedValueOnce({ rows: [] }).mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] }).mockResolvedValueOnce({ rows: [row("ajina", [{ ...sourcedOrigin, country: "Nigeria" }])] })
      vi.stubGlobal("fetch", vi.fn().mockResolvedValue(forebearsPage("Most prevalent in: Nigeria\n\nHighest density in: Lebanon\n")))
      const { POST } = await import("@/app/api/c/[slug]/surname-origins/route")
      const response = await POST(request({ surname: "Ajina", stage: "forebears" }), context)
      expect(response.status).toBe(200)
      expect(await response.json()).toMatchObject({ cached: false, entry: { forebearsFallback: true } })
      expect(mocks.query).toHaveBeenCalledWith(expect.stringContaining("INSERT INTO platform_surname_origin_cache"),
        ["ajina", expect.stringContaining("Lebanon")])
    })

    it("saves nothing and reports when Forebears cannot be read, after one retry", async () => {
      process.env.OPENROUTER_API_KEY = "test-key"
      const fetchMock = vi.fn().mockResolvedValue(forebearsPage("Just a moment..."))
      vi.stubGlobal("fetch", fetchMock)
      const { POST } = await import("@/app/api/c/[slug]/surname-origins/route")
      const response = await POST(request({ surname: "Ajina", stage: "forebears" }), context)
      expect(fetchMock).toHaveBeenCalledTimes(2)
      expect(await response.json()).toMatchObject({ entry: null, forebearsUnavailable: true })
      expect(mocks.query.mock.calls.every(([sql]) => !String(sql).includes("INSERT"))).toBe(true)
    })

    it("answers from the cache without calling the API", async () => {
      process.env.OPENROUTER_API_KEY = "test-key"
      const fetchMock = vi.fn()
      vi.stubGlobal("fetch", fetchMock)
      const { POST } = await import("@/app/api/c/[slug]/surname-origins/route")
      mocks.query.mockResolvedValueOnce({ rows: [row("dupont", [sourcedOrigin])] })
      expect(await (await POST(request({ surname: "Dupont", stage: "forebears" }), context)).json()).toMatchObject({ cached: true })
      expect(fetchMock).not.toHaveBeenCalled()
    })
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

describe("Forebears page fields", () => {
  const page = (content: string, url = "https://forebears.io/surnames/abdennasser") =>
    ({ status: "completed", output: [{ type: "openrouter:web_fetch", url, content }] })

  it("returns the most prevalent and highest density countries", () => {
    const origins = parseForebearsFetch(page("Most prevalent in: Morocco\n\nHighest density in: Tunisia\n"), "Abdennasser")
    expect(origins.map((origin) => origin.country)).toEqual(["Morocco", "Tunisia"])
    expect(origins[0].sources[0].url).toBe("https://forebears.io/surnames/abdennasser")
  })

  it("reads fields whose value is on the next line and ignores later sentences", () => {
    const content = "Most prevalent in:\n\nUnited States\n\nHighest density in:\n\nUnited States\n\n"
      + "Most prevalent in: Georgia, where 37 percent reside, Texas, where 19 percent reside and Florida, where 12 percent"
    const origins = parseForebearsFetch(page(content, "https://forebears.io/surnames/almand"), "almand")
    expect(origins.map((origin) => origin.country)).toEqual(["United States"])
  })

  it("rejects a field whose text is not a plain country name", () => {
    const content = "Most prevalent in: Georgia, where 37 percent reside, Texas, where 19 percent reside"
    expect(() => parseForebearsFetch(page(content, "https://forebears.io/surnames/almand"), "almand")).toThrow("no prevalence fields")
  })

  it("returns one country when both fields match", () => {
    const origins = parseForebearsFetch(page("Most prevalent in: Sudan\n\nHighest density in: Sudan\n"), "abdennasser")
    expect(origins).toHaveLength(1)
    expect(origins[0].explanation).toContain("most prevalent and has the highest density")
  })

  it("throws when the page has no fields, such as a blocked page", () => {
    expect(() => parseForebearsFetch(page("Just a moment..."), "abdennasser")).toThrow("no prevalence fields")
  })

  it("throws when the page was not fetched so it is not reported as checked", () => {
    expect(() => parseForebearsFetch(page("Most prevalent in: Peru", "https://forebears.io/surnames/other"), "abdennasser")).toThrow("not fetched")
    expect(() => parseForebearsFetch({ status: "completed", output: [] }, "abdennasser")).toThrow("not fetched")
  })
})
