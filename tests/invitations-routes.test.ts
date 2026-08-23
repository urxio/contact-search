import { beforeEach, describe, expect, it, vi } from "vitest"
import { NextRequest } from "next/server"

const mocks = vi.hoisted(() => ({
  auditEvent: vi.fn(),
  issueInvitation: vi.fn(),
  poolQuery: vi.fn(),
  requireCongregationAdmin: vi.fn(),
  validateMutationOrigin: vi.fn(),
}))

vi.mock("@/lib/auth", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/auth")>()),
  auditEvent: mocks.auditEvent,
  issueInvitation: mocks.issueInvitation,
  requireCongregationAdmin: mocks.requireCongregationAdmin,
  validateMutationOrigin: mocks.validateMutationOrigin,
}))

vi.mock("@/lib/db", () => ({
  pool: { query: mocks.poolQuery },
}))

beforeEach(() => {
  process.env.MULTI_TENANT_ENABLED = "true"
  mocks.auditEvent.mockReset().mockResolvedValue(undefined)
  mocks.issueInvitation.mockReset()
  mocks.poolQuery.mockReset()
  mocks.requireCongregationAdmin.mockReset().mockResolvedValue({
    user: { id: 12 },
    congregation: { id: 34, slug: "central" },
    membership: { role: "admin" },
  })
  mocks.validateMutationOrigin.mockReset()
})

describe("congregation invitation records", () => {
  it("returns invitation history with creator and revocation fields", async () => {
    const invitation = {
      id: 7,
      email: "invitee@example.test",
      role: "member",
      createdAt: "2026-08-23T12:00:00.000Z",
      expiresAt: "2026-08-30T12:00:00.000Z",
      acceptedAt: null,
      revokedAt: null,
      createdByDisplayName: "Admin User",
      legacyDisplayName: null,
    }
    mocks.poolQuery.mockResolvedValueOnce({ rows: [invitation] })
    const { GET } = await import("@/app/api/c/[slug]/invitations/route")

    const response = await GET(new NextRequest("https://search.example/api/c/central/invitations"), { params: { slug: "central" } })

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({ invitations: [invitation] })
    expect(mocks.poolQuery.mock.calls[0][0]).toContain('i.revoked_at AS "revokedAt"')
    expect(mocks.poolQuery.mock.calls[0][0]).toContain('u.display_name AS "createdByDisplayName"')
    expect(mocks.poolQuery.mock.calls[0][1]).toEqual([34])
  })

  it("revokes a pending invitation without deleting its history record", async () => {
    mocks.poolQuery.mockResolvedValueOnce({ rows: [{ id: 7 }] })
    const { DELETE } = await import("@/app/api/c/[slug]/invitations/route")
    const request = new NextRequest("https://search.example/api/c/central/invitations?id=7", {
      method: "DELETE",
      headers: { origin: "https://search.example", host: "search.example" },
    })

    const response = await DELETE(request, { params: { slug: "central" } })

    expect(response.status).toBe(200)
    expect(mocks.validateMutationOrigin).toHaveBeenCalledWith(request)
    expect(mocks.poolQuery.mock.calls[0][0]).toContain("UPDATE invitations SET revoked_at = NOW()")
    expect(mocks.poolQuery.mock.calls[0][0]).not.toContain("DELETE FROM invitations")
    expect(mocks.auditEvent).toHaveBeenCalledWith(expect.objectContaining({
      action: "invitation.revoked",
      targetId: "7",
    }))
  })
})
