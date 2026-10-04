import { beforeEach, describe, expect, it, vi } from "vitest"
import { NextRequest } from "next/server"

const mocks = vi.hoisted(() => ({
  query: vi.fn(),
  requireMembership: vi.fn(),
  validateMutationOrigin: vi.fn(),
}))

vi.mock("@/lib/db", () => ({ pool: { query: mocks.query } }))
vi.mock("@/lib/auth", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/auth")>()),
  requireMembership: mocks.requireMembership,
  validateMutationOrigin: mocks.validateMutationOrigin,
}))

beforeEach(() => {
  process.env.MULTI_TENANT_ENABLED = "true"
  mocks.query.mockReset().mockResolvedValue({ rowCount: 1, rows: [] })
  mocks.requireMembership.mockReset().mockResolvedValue({ user: { id: 12 }, congregation: { id: 34 } })
  mocks.validateMutationOrigin.mockReset()
})

async function post(body: unknown) {
  const { POST } = await import("@/app/api/c/[slug]/updates/seen/route")
  const request = new NextRequest("https://search.example/api/c/central/updates/seen", {
    method: "POST",
    headers: { origin: "https://search.example", host: "search.example", "content-type": "application/json" },
    body: JSON.stringify(body),
  })
  return POST(request, { params: { slug: "central" } })
}

describe("update announcement seen route", () => {
  it("records the update for the signed-in user", async () => {
    const response = await post({ updateId: "forebears-copy-luna-2026-10" })
    expect(response.status).toBe(200)
    expect(mocks.query.mock.calls[0][1]).toEqual([12, "forebears-copy-luna-2026-10"])
  })

  it("rejects an invalid update id", async () => {
    const response = await post({ updateId: "bad id!" })
    expect(response.status).toBe(400)
    expect(mocks.query).not.toHaveBeenCalled()
  })
})
