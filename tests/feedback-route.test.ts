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
  it("delivers a feedback message server-side to the platform administrator", async () => {
    const { POST } = await import("@/app/api/c/[slug]/feedback/route")
    const request = new NextRequest("https://search.example/api/c/central/feedback", {
      method: "POST",
      headers: { origin: "https://search.example", host: "search.example", "content-type": "application/json" },
      body: JSON.stringify({ type: "bug", message: "Search results do not load after I select a city." }),
    })

    const response = await POST(request, { params: { slug: "central" } })

    expect(response.status).toBe(200)
    expect(mocks.validateMutationOrigin).toHaveBeenCalledWith(request)
    expect(fetch).toHaveBeenCalledWith("https://api.resend.com/emails", expect.objectContaining({ method: "POST" }))
    const sentPayload = JSON.parse((fetch as ReturnType<typeof vi.fn>).mock.calls[0][1].body)
    expect(sentPayload).toMatchObject({
      to: ["borisnikaz@gmail.com"],
      reply_to: "member@example.test",
      subject: "Bug report from Member User",
    })
    expect(sentPayload.text).toContain("Search results do not load")
    expect(mocks.auditEvent).toHaveBeenCalledWith(expect.objectContaining({ action: "platform_feedback.sent", congregationId: 34 }))
  })

  it("does not send messages when email delivery is not configured", async () => {
    delete process.env.RESEND_API_KEY
    const { POST } = await import("@/app/api/c/[slug]/feedback/route")
    const response = await POST(new NextRequest("https://search.example/api/c/central/feedback", {
      method: "POST",
      headers: { origin: "https://search.example", host: "search.example", "content-type": "application/json" },
      body: JSON.stringify({ type: "feedback", message: "Thank you for this tool." }),
    }), { params: { slug: "central" } })

    expect(response.status).toBe(503)
    expect(fetch).not.toHaveBeenCalled()
  })
})
