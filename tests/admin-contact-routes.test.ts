import { beforeEach, describe, expect, it, vi } from "vitest"
import { NextRequest } from "next/server"

import { AuthError } from "@/lib/auth"

const mocks = vi.hoisted(() => ({
  adminCookie: "secret",
  auditEvent: vi.fn(),
  clientQuery: vi.fn(),
  poolQuery: vi.fn(),
  release: vi.fn(),
  requireCongregationAdmin: vi.fn(),
  updateSubmissionContact: vi.fn(),
  validateMutationOrigin: vi.fn(),
}))

vi.mock("next/headers", () => ({
  cookies: () => ({ get: () => ({ value: mocks.adminCookie }) }),
}))

vi.mock("@/lib/auth", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/auth")>()),
  auditEvent: mocks.auditEvent,
  requireCongregationAdmin: mocks.requireCongregationAdmin,
  validateMutationOrigin: mocks.validateMutationOrigin,
}))

vi.mock("@/lib/db", () => ({
  ensureSchema: vi.fn(),
  pool: {
    connect: vi.fn(async () => ({ query: mocks.clientQuery, release: mocks.release })),
    query: mocks.poolQuery,
  },
}))

vi.mock("@/lib/submission-contacts", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/submission-contacts")>()),
  updateSubmissionContact: mocks.updateSubmissionContact,
}))

function patchRequest(url: string, body: Record<string, unknown>) {
  return new NextRequest(url, {
    method: "PATCH",
    headers: { "Content-Type": "application/json", origin: "https://search.example", host: "search.example" },
    body: JSON.stringify(body),
  })
}

const updated = {
  contact: { id: "contact-1", status: "Potentially French" },
  counters: { contactCount: 1, potentiallyFrench: 1, notFrench: 0, duplicate: 0, notChecked: 0 },
}

beforeEach(() => {
  process.env.MULTI_TENANT_ENABLED = "true"
  process.env.ADMIN_PASSWORD = "secret"
  mocks.adminCookie = "secret"
  mocks.auditEvent.mockReset().mockResolvedValue(undefined)
  mocks.clientQuery.mockReset().mockResolvedValue({ rows: [] })
  mocks.poolQuery.mockReset().mockResolvedValue({ rows: [] })
  mocks.release.mockReset()
  mocks.requireCongregationAdmin.mockReset().mockResolvedValue({
    user: { id: 12 },
    congregation: { id: 34, slug: "central" },
    membership: { role: "admin" },
  })
  mocks.updateSubmissionContact.mockReset().mockResolvedValue(updated)
  mocks.validateMutationOrigin.mockReset()
})

describe("congregation admin contact review route", () => {
  it("imports an exported submission and recalculates its counters", async () => {
    mocks.clientQuery
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ id: 81 }] })
      .mockResolvedValueOnce({ rows: [] })
    const { POST } = await import("@/app/api/c/[slug]/admin/submissions/route")
    const response = await POST(new NextRequest("https://search.example/api/c/central/admin/submissions", {
      method: "POST",
      headers: { "Content-Type": "application/json", origin: "https://search.example", host: "search.example" },
      body: JSON.stringify({ user_id: "Marie", contact_count: 999, contacts: [{ id: "a", status: "Not French" }] }),
    }), { params: { slug: "central" } })

    expect(response.status).toBe(201)
    expect(mocks.clientQuery).toHaveBeenCalledWith(expect.stringContaining("INSERT INTO submissions"), expect.arrayContaining([
      34, "Marie", null, 1, 0, 1, 0, 0,
    ]))
    expect(mocks.auditEvent).toHaveBeenCalledWith(expect.objectContaining({ action: "submission.imported", metadata: { count: 1 } }))
  })

  it("rejects malformed submission imports", async () => {
    const { POST } = await import("@/app/api/c/[slug]/admin/submissions/route")
    const response = await POST(new NextRequest("https://search.example/api/c/central/admin/submissions", {
      method: "POST",
      headers: { "Content-Type": "application/json", origin: "https://search.example", host: "search.example" },
      body: JSON.stringify({ user_id: "Marie", contacts: "not an array" }),
    }), { params: { slug: "central" } })
    expect(response.status).toBe(400)
    expect(mocks.clientQuery).not.toHaveBeenCalled()
  })

  it.each(["Potentially French", "Not French", "Duplicate"])("accepts the %s final status", async (status) => {
    const { PATCH } = await import("@/app/api/c/[slug]/admin/submissions/route")
    const response = await PATCH(patchRequest("https://search.example/api/c/central/admin/submissions", {
      id: 41, contactId: "contact-1", status,
    }), { params: { slug: "central" } })

    expect(response.status).toBe(200)
    expect(mocks.updateSubmissionContact).toHaveBeenCalledWith(expect.anything(), {
      submissionId: 41, congregationId: 34, contactId: "contact-1", status,
    })
    expect(mocks.validateMutationOrigin).toHaveBeenCalled()
    expect(mocks.auditEvent).toHaveBeenCalledWith(expect.objectContaining({
      action: "submission_contact.updated",
      targetId: "41:contact-1",
      metadata: { status },
    }))
  })

  it("rejects draft-only statuses before opening a transaction", async () => {
    const { PATCH } = await import("@/app/api/c/[slug]/admin/submissions/route")
    const response = await PATCH(patchRequest("https://search.example/api/c/central/admin/submissions", {
      id: 41, contactId: "contact-1", status: "Detected",
    }), { params: { slug: "central" } })
    expect(response.status).toBe(400)
    expect(mocks.updateSubmissionContact).not.toHaveBeenCalled()
  })

  it("requires a contact id for contact mutations", async () => {
    const { PATCH } = await import("@/app/api/c/[slug]/admin/submissions/route")
    const response = await PATCH(patchRequest("https://search.example/api/c/central/admin/submissions", {
      id: 41, status: "Not French",
    }), { params: { slug: "central" } })
    expect(response.status).toBe(400)
    expect(mocks.updateSubmissionContact).not.toHaveBeenCalled()
  })

  it("returns 404 and rolls back when the contact is outside the tenant scope", async () => {
    mocks.updateSubmissionContact.mockResolvedValueOnce(null)
    const { PATCH } = await import("@/app/api/c/[slug]/admin/submissions/route")
    const response = await PATCH(patchRequest("https://search.example/api/c/central/admin/submissions", {
      id: 41, contactId: "missing", checkedSource: "forebears",
    }), { params: { slug: "central" } })
    expect(response.status).toBe(404)
    expect(mocks.clientQuery).toHaveBeenCalledWith("ROLLBACK")
  })

  it("persists validated contact information and audits field names only", async () => {
    const fields = { fullName: "Marie Martin", address: "10 Main St", notes: "Reviewed" }
    const { PATCH } = await import("@/app/api/c/[slug]/admin/submissions/route")
    const response = await PATCH(patchRequest("https://search.example/api/c/central/admin/submissions", {
      id: 41, contactId: "contact-1", fields,
    }), { params: { slug: "central" } })
    expect(response.status).toBe(200)
    expect(mocks.updateSubmissionContact).toHaveBeenCalledWith(expect.anything(), {
      submissionId: 41, congregationId: 34, contactId: "contact-1", fields,
    })
    expect(mocks.auditEvent).toHaveBeenCalledWith(expect.objectContaining({
      metadata: { fields: ["fullName", "address", "notes"] },
    }))
  })

  it("rejects unknown contact fields", async () => {
    const { PATCH } = await import("@/app/api/c/[slug]/admin/submissions/route")
    const response = await PATCH(patchRequest("https://search.example/api/c/central/admin/submissions", {
      id: 41, contactId: "contact-1", fields: { status: "Duplicate" },
    }), { params: { slug: "central" } })
    expect(response.status).toBe(400)
    expect(mocks.updateSubmissionContact).not.toHaveBeenCalled()
  })

  it("requires congregation-admin authorization", async () => {
    mocks.requireCongregationAdmin.mockRejectedValueOnce(new AuthError(404, "Workspace not found"))
    const { PATCH } = await import("@/app/api/c/[slug]/admin/submissions/route")
    const response = await PATCH(patchRequest("https://search.example/api/c/central/admin/submissions", {
      id: 41, contactId: "contact-1", status: "Duplicate",
    }), { params: { slug: "central" } })
    expect(response.status).toBe(404)
    expect(mocks.updateSubmissionContact).not.toHaveBeenCalled()
  })
})

describe("legacy admin contact review route", () => {
  it("persists a valid research source through the legacy authorization path", async () => {
    const { PATCH } = await import("@/app/api/admin/submissions/route")
    const response = await PATCH(patchRequest("https://search.example/api/admin/submissions", {
      id: 41, contactId: "contact-1", checkedSource: "truePeopleSearch",
    }))
    expect(response.status).toBe(200)
    expect(mocks.updateSubmissionContact).toHaveBeenCalledWith(expect.anything(), {
      submissionId: 41, contactId: "contact-1", checkedSource: "truePeopleSearch",
    })
  })

  it("rejects an invalid research source", async () => {
    const { PATCH } = await import("@/app/api/admin/submissions/route")
    const response = await PATCH(patchRequest("https://search.example/api/admin/submissions", {
      id: 41, contactId: "contact-1", checkedSource: "otm",
    }))
    expect(response.status).toBe(400)
    expect(mocks.updateSubmissionContact).not.toHaveBeenCalled()
  })

  it("requires the legacy admin cookie", async () => {
    mocks.adminCookie = "wrong"
    const { PATCH } = await import("@/app/api/admin/submissions/route")
    const response = await PATCH(patchRequest("https://search.example/api/admin/submissions", {
      id: 41, contactId: "contact-1", status: "Duplicate",
    }))
    expect(response.status).toBe(401)
    expect(mocks.updateSubmissionContact).not.toHaveBeenCalled()
  })
})
