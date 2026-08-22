import { beforeEach, describe, expect, it, vi } from "vitest"
import { NextRequest } from "next/server"
import * as XLSX from "xlsx"

const mocks = vi.hoisted(() => ({
  auditEvent: vi.fn(),
  poolQuery: vi.fn(),
  requireCongregationAdmin: vi.fn(),
  validateMutationOrigin: vi.fn(),
}))

vi.mock("@/lib/auth", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/auth")>()),
  auditEvent: mocks.auditEvent,
  requireCongregationAdmin: mocks.requireCongregationAdmin,
  validateMutationOrigin: mocks.validateMutationOrigin,
}))

vi.mock("@/lib/db", () => ({ pool: { query: mocks.poolQuery } }))

const context = { params: { slug: "central" } }

function spreadsheetFile(rows: unknown[][]) {
  const workbook = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet(rows), "Addresses")
  const bytes = XLSX.write(workbook, { type: "buffer", bookType: "xlsx" })
  return new File([bytes], "database.xlsx", {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  })
}

function uploadRequest(file: File) {
  const form = new FormData()
  form.append("file", file)
  return new NextRequest("https://search.example/api/c/central/admin/otm-check", {
    method: "POST",
    headers: { origin: "https://search.example", host: "search.example" },
    body: form,
  })
}

beforeEach(() => {
  process.env.MULTI_TENANT_ENABLED = "true"
  mocks.auditEvent.mockReset().mockResolvedValue(undefined)
  mocks.poolQuery.mockReset()
  mocks.requireCongregationAdmin.mockReset().mockResolvedValue({
    user: { id: 12, isPlatformAdmin: false },
    congregation: { id: 34, slug: "central" },
    membership: { role: "admin" },
  })
  mocks.validateMutationOrigin.mockReset()
})

describe("Database Duplicates Check", () => {
  it("finds exact and address-plus-ZIP matches only in active tenant submissions", async () => {
    mocks.poolQuery.mockResolvedValueOnce({
      rows: [{
        id: 91,
        user_id: "Member One",
        submitted_at: "2026-08-22T12:00:00Z",
        contacts: [
          { id: "exact", fullName: "Exact Match", address: "123 N Main St 4", city: "Alexandria", zipcode: "22301", status: "Potentially French" },
          { id: "loose", fullName: "Loose Match", address: "44 Oak Ave", city: "Falls Church", zipcode: "22201", status: "Potentially French" },
          { id: "ignored-status", fullName: "Not French", address: "123 N Main St 4", city: "Alexandria", zipcode: "22301", status: "Not French" },
          { id: "unmatched", fullName: "No Match", address: "9 Other Rd", city: "Alexandria", zipcode: "22301", status: "Potentially French" },
        ],
      }],
      rowCount: 1,
    })
    const file = spreadsheetFile([
      ["Address", "City", "Zip"],
      ["123 N. Main St., #4", "Alexandria", "22301"],
      ["44 Oak Ave", "Arlington", "22201"],
    ])

    const { POST } = await import("@/app/api/c/[slug]/admin/otm-check/route")
    const response = await POST(uploadRequest(file), context)
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body.matchCount).toBe(2)
    expect(body.matches.map((match: { contactId: string; matchType: string }) => [match.contactId, match.matchType]))
      .toEqual([["exact", "exact"], ["loose", "loose"]])
    expect(mocks.poolQuery).toHaveBeenCalledWith(expect.stringContaining("congregation_id = $1 AND archived = FALSE"), [34])
    expect(mocks.validateMutationOrigin).toHaveBeenCalledOnce()
    expect(mocks.auditEvent).toHaveBeenCalledWith(expect.objectContaining({
      actorUserId: 12,
      congregationId: 34,
      action: "otm_scan.run",
      metadata: { rows: 2, matches: 2 },
    }))
  })

  it("matches split address columns with a numeric apartment value", async () => {
    mocks.poolQuery.mockResolvedValueOnce({
      rows: [{
        id: 92,
        user_id: "Member Two",
        submitted_at: "2026-08-22T12:00:00Z",
        contacts: [{
          id: "apartment",
          fullName: "Apartment Match",
          address: "2427 N Scuppers Ln Unit 300",
          city: "Alexandria",
          zipcode: "22301",
          status: "Potentially French",
        }],
      }],
      rowCount: 1,
    })
    const file = spreadsheetFile([
      ["HouseNum", "StreetDir", "StreetName", "AptBoxNum", "City", "Zip"],
      ["2427", "N", "Scuppers Ln", "300", "Alexandria", "22301"],
    ])

    const { POST } = await import("@/app/api/c/[slug]/admin/otm-check/route")
    const response = await POST(uploadRequest(file), context)
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body.matches).toEqual([
      expect.objectContaining({ contactId: "apartment", matchType: "exact", otmAddress: "2427 N Scuppers Ln APT 300" }),
    ])
  })

  it("accepts CSV address imports through the same comparison flow", async () => {
    mocks.poolQuery.mockResolvedValueOnce({
      rows: [{
        id: 93,
        user_id: "Member Three",
        submitted_at: "2026-08-22T12:00:00Z",
        contacts: [{
          id: "csv-match",
          fullName: "CSV Match",
          address: "18 Market St",
          city: "Alexandria",
          zipcode: "22301",
          status: "Potentially French",
        }],
      }],
      rowCount: 1,
    })
    const file = new File([
      "Address,City,Zip\n18 Market St,Alexandria,22301\n",
    ], "congregation-addresses.csv", { type: "text/csv" })

    const { POST } = await import("@/app/api/c/[slug]/admin/otm-check/route")
    const response = await POST(uploadRequest(file), context)
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body.otmRowCount).toBe(1)
    expect(body.matches).toEqual([
      expect.objectContaining({ contactId: "csv-match", matchType: "exact" }),
    ])
  })

  it("returns saved-file metadata in the shape consumed by the tool", async () => {
    const uploadedAt = new Date("2026-08-22T12:30:00Z")
    mocks.poolQuery.mockResolvedValueOnce({ rows: [{ filename: "database.xlsx", uploaded_at: uploadedAt }] })

    const { GET } = await import("@/app/api/c/[slug]/admin/otm-file/route")
    const response = await GET(new NextRequest("https://search.example/api/c/central/admin/otm-file"), context)

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({
      exists: true,
      filename: "database.xlsx",
      uploadedAt: uploadedAt.toISOString(),
    })
    expect(mocks.poolQuery).toHaveBeenCalledWith(
      expect.stringContaining("SELECT filename, uploaded_at FROM otm_files"),
      [34],
    )
  })

  it("returns an intuitive empty state when no saved database file exists", async () => {
    mocks.poolQuery.mockResolvedValueOnce({ rows: [] })
    const { GET } = await import("@/app/api/c/[slug]/admin/otm-file/route")
    const response = await GET(new NextRequest("https://search.example/api/c/central/admin/otm-file"), context)

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({ exists: false })
  })

  it("returns saved metadata after replacing the congregation database file", async () => {
    const uploadedAt = new Date("2026-08-22T12:45:00Z")
    mocks.poolQuery.mockResolvedValueOnce({ rows: [{ filename: "database.xlsx", uploaded_at: uploadedAt }] })
    const file = spreadsheetFile([["Address"], ["1 Main St"]])
    const form = new FormData()
    form.append("file", file)
    const request = new NextRequest("https://search.example/api/c/central/admin/otm-file", {
      method: "POST",
      headers: { origin: "https://search.example", host: "search.example" },
      body: form,
    })

    const { POST } = await import("@/app/api/c/[slug]/admin/otm-file/route")
    const response = await POST(request, context)

    expect(response.status).toBe(201)
    await expect(response.json()).resolves.toEqual({
      exists: true,
      filename: "database.xlsx",
      uploadedAt: uploadedAt.toISOString(),
    })
    expect(mocks.validateMutationOrigin).toHaveBeenCalledOnce()
    expect(mocks.auditEvent).toHaveBeenCalledWith(expect.objectContaining({
      actorUserId: 12,
      congregationId: 34,
      action: "otm_file.replaced",
    }))
  })
})
