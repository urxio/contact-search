import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { NextRequest } from "next/server"

const mocks = vi.hoisted(() => ({
  auditEvent: vi.fn(),
  requireMembership: vi.fn(),
  validateMutationOrigin: vi.fn(),
}))

vi.mock("@/lib/auth", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/auth")>()),
  auditEvent: mocks.auditEvent,
  requireMembership: mocks.requireMembership,
  validateMutationOrigin: mocks.validateMutationOrigin,
}))

beforeEach(() => {
  process.env.MULTI_TENANT_ENABLED = "true"
  process.env.RESEND_API_KEY = "re_test_key"
  process.env.FEEDBACK_FROM_EMAIL = "Name Search <feedback@example.test>"
  mocks.auditEvent.mockReset().mockResolvedValue(undefined)
  mocks.requireMembership.mockReset().mockResolvedValue({
    user: { id: 12, email: "member@example.test", displayName: "Member User" },
    congregation: { id: 34, name: "Central", slug: "central" },
  })
  mocks.validateMutationOrigin.mockReset()
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({ id: "email_123" }), { status: 200 })))
})

afterEach(() => {
  vi.unstubAllGlobals()
  delete process.env.RESEND_API_KEY
  delete process.env.FEEDBACK_FROM_EMAIL
})

describe("feedback email", () => {
  it("does not send feedback until the feature is enabled", async () => {
    const { POST } = await import("@/app/api/c/[slug]/feedback/route")
    const request = new NextRequest("https://search.example/api/c/central/feedback", {
      method: "POST",
      headers: { origin: "https://search.example", host: "search.example", "content-type": "application/json" },
      body: JSON.stringify({ type: "bug", message: "Search results do not load after I select a city." }),
    })

    const response = await POST(request, { params: { slug: "central" } })

    expect(response.status).toBe(503)
    expect(mocks.validateMutationOrigin).toHaveBeenCalledWith(request)
    expect(fetch).not.toHaveBeenCalled()
    expect(mocks.auditEvent).not.toHaveBeenCalled()
  })
})
