import { beforeEach, describe, expect, it, vi } from "vitest"
import { NextRequest } from "next/server"

import {
  createFrenchExport,
  parseStateValue,
  updateFrenchExport,
  withDuplicateCounts,
  type FrenchContact,
} from "@/lib/french-exports"

const mocks = vi.hoisted(() => ({
  auditEvent: vi.fn(),
  clientQuery: vi.fn(),
  poolQuery: vi.fn(),
  release: vi.fn(),
  requireCongregationAdmin: vi.fn(),
  validateMutationOrigin: vi.fn(),
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

const contact = (overrides: Partial<FrenchContact>): FrenchContact => ({
  submissionId: 1, contactId: "c1", userId: "Ana", submittedAt: "2026-11-01T00:00:00Z",
  fullName: "Jean Dupont", address: "1 Main St", city: "Alexandria", zipcode: "22301",
  phone: "", notes: "", ...overrides,
})

function request(method: string, body: Record<string, unknown>) {
  return new NextRequest("https://search.example/api/c/central/admin/potentially-french", {
    method,
    headers: { "Content-Type": "application/json", origin: "https://search.example", host: "search.example" },
    body: JSON.stringify(body),
  })
}

beforeEach(() => {
  process.env.MULTI_TENANT_ENABLED = "true"
  mocks.auditEvent.mockReset().mockResolvedValue(undefined)
  mocks.clientQuery.mockReset().mockResolvedValue({ rows: [] })
  mocks.poolQuery.mockReset().mockResolvedValue({ rows: [] })
  mocks.release.mockReset()
  mocks.requireCongregationAdmin.mockReset().mockResolvedValue({
    user: { id: 12 }, congregation: { id: 34, slug: "central" }, membership: { role: "admin" },
  })
  mocks.validateMutationOrigin.mockReset()
})

describe("withDuplicateCounts", () => {
  it("counts duplicates among pending contacts and flags matches with exported ones", () => {
    const pending = [
      contact({ contactId: "a", fullName: "Marie Curie", address: "5 Oak Ave" }),
      contact({ contactId: "b", fullName: "Marie  curie", address: "9 Elm Rd" }),
      contact({ contactId: "c", fullName: "Paul Martin", address: "1 Main St" }),
      contact({ contactId: "d", fullName: "Luc Besson", address: "7 Pine Ct" }),
    ]
    const exported = [contact({ contactId: "x", fullName: "Someone Else", address: "1 main st" })]
    const result = Object.fromEntries(withDuplicateCounts(pending, exported).map((c) => [c.contactId, c]))
    expect(result.a.duplicateNameCount).toBe(2)
    expect(result.b.duplicateNameCount).toBe(2)
    expect(result.c.exportedMatch).toBe("address")
    expect(result.d).toMatchObject({ duplicateAddressCount: 1, duplicateNameCount: 1, exportedMatch: null })
  })
})

describe("parseStateValue", () => {
  it("trims, allows empty, and rejects long or non-string values", () => {
    expect(parseStateValue(undefined)).toBe("")
    expect(parseStateValue(" VA ")).toBe("VA")
    expect(parseStateValue("x".repeat(21))).toBeNull()
    expect(parseStateValue(5)).toBeNull()
  })
})

describe("createFrenchExport", () => {
  it("records a batch inside a transaction and returns the snapshotted rows", async () => {
    const query = vi.fn(async (sql: string) => {
      if (sql.includes("INSERT INTO french_contact_exports")) return { rows: [{ id: "7", created_at: "2026-11-11T10:00:00Z" }] }
      if (sql.includes("INSERT INTO french_contact_export_items")) return { rows: [{ contact: contact({ contactId: "c9" }) }] }
      return { rows: [] }
    })
    const batch = await createFrenchExport({ query }, {
      scope: 34, userId: 12, stateValue: "VA", contacts: [{ submissionId: 1, contactId: "c9" }],
    })
    expect(batch).toMatchObject({ id: 7, stateValue: "VA", archivedAt: null })
    expect(batch?.contacts.map((c) => c.contactId)).toEqual(["c9"])
    expect(query.mock.calls.map(([sql]) => sql.trim().split(/\s/)[0])).toEqual(["BEGIN", "INSERT", "INSERT", "COMMIT"])
    const itemCall = query.mock.calls[2] as unknown as [string, unknown[]]
    expect(itemCall[0]).toContain("s.congregation_id = $3")
    expect(itemCall[0]).toContain("ON CONFLICT (submission_id, contact_id) DO NOTHING")
    expect(itemCall[1]).toEqual([7, JSON.stringify([{ submission_id: 1, contact_id: "c9" }]), 34])
  })

  it("rolls back and returns null when every contact was already exported", async () => {
    const query = vi.fn(async (sql: string) =>
      sql.includes("INSERT INTO french_contact_exports") ? { rows: [{ id: "8", created_at: "now" }] } : { rows: [] })
    const batch = await createFrenchExport({ query }, {
      scope: null, userId: null, stateValue: "", contacts: [{ submissionId: 1, contactId: "c1" }],
    })
    expect(batch).toBeNull()
    expect(query.mock.calls.at(-1)?.[0]).toBe("ROLLBACK")
    expect(query.mock.calls[2][0]).not.toContain("congregation_id = $3")
  })
})

describe("updateFrenchExport", () => {
  it.each([
    ["undoExport", "DELETE FROM french_contact_exports"],
    ["archiveExport", "archived_at = NOW()"],
    ["unarchiveExport", "archived_at = NULL"],
  ] as const)("%s runs a scoped statement", async (action, fragment) => {
    const query = vi.fn(async () => ({ rows: [{ id: 3 }] }))
    await expect(updateFrenchExport({ query }, 34, 3, action)).resolves.toBe(true)
    const [sql, values] = query.mock.calls[0] as unknown as [string, unknown[]]
    expect(sql).toContain(fragment)
    expect(sql).toContain("congregation_id IS NOT DISTINCT FROM $2")
    expect(values).toEqual([3, 34])
  })
})

describe("congregation potentially French export route", () => {
  it("creates an export batch and audits it", async () => {
    mocks.clientQuery.mockImplementation(async (sql: string) => {
      if (sql.includes("INSERT INTO french_contact_exports")) return { rows: [{ id: "4", created_at: "2026-11-11T10:00:00Z" }] }
      if (sql.includes("INSERT INTO french_contact_export_items")) return { rows: [{ contact: contact({}) }] }
      return { rows: [] }
    })
    const { POST } = await import("@/app/api/c/[slug]/admin/potentially-french/route")
    const response = await POST(request("POST", { contacts: [{ submissionId: 1, contactId: "c1" }], stateValue: "VA" }), { params: { slug: "central" } })
    expect(response.status).toBe(200)
    expect((await response.json()).export).toMatchObject({ id: 4, stateValue: "VA" })
    expect(mocks.release).toHaveBeenCalled()
    expect(mocks.auditEvent).toHaveBeenCalledWith(expect.objectContaining({
      action: "potentially_french.exported", congregationId: 34, targetId: "4", metadata: { contactCount: 1 },
    }))
  })

  it("returns 409 when nothing is left to export", async () => {
    mocks.clientQuery.mockImplementation(async (sql: string) =>
      sql.includes("INSERT INTO french_contact_exports") ? { rows: [{ id: "4", created_at: "now" }] } : { rows: [] })
    const { POST } = await import("@/app/api/c/[slug]/admin/potentially-french/route")
    const response = await POST(request("POST", { contacts: [{ submissionId: 1, contactId: "c1" }] }), { params: { slug: "central" } })
    expect(response.status).toBe(409)
    expect(mocks.auditEvent).not.toHaveBeenCalled()
  })

  it("rejects an export with no contacts", async () => {
    const { POST } = await import("@/app/api/c/[slug]/admin/potentially-french/route")
    const response = await POST(request("POST", { contacts: [] }), { params: { slug: "central" } })
    expect(response.status).toBe(400)
  })

  it("archives a batch and 404s for one outside the congregation", async () => {
    const { PATCH } = await import("@/app/api/c/[slug]/admin/potentially-french/route")
    mocks.poolQuery.mockResolvedValueOnce({ rows: [{ id: 5 }] })
    const ok = await PATCH(request("PATCH", { action: "archiveExport", exportId: 5 }), { params: { slug: "central" } })
    expect(ok.status).toBe(200)
    expect(mocks.poolQuery.mock.calls[0][1]).toEqual([5, 34])
    mocks.poolQuery.mockResolvedValueOnce({ rows: [] })
    const missing = await PATCH(request("PATCH", { action: "undoExport", exportId: 6 }), { params: { slug: "central" } })
    expect(missing.status).toBe(404)
  })
})
