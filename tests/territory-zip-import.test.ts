import { beforeEach, describe, expect, it, vi } from "vitest"
import { NextRequest } from "next/server"
import * as XLSX from "xlsx"

import { parseTerritoryZipWorkbook } from "@/lib/territory-zip-import"

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
  pool: {
    connect: vi.fn(async () => ({ query: mocks.clientQuery, release: mocks.release })),
    query: mocks.poolQuery,
  },
}))

function workbook(rows: unknown[][]) {
  const book = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(book, XLSX.utils.aoa_to_sheet(rows), "Territories")
  return XLSX.write(book, { type: "buffer", bookType: "xlsx" }) as Buffer
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

describe("territory ZIP workbook parser", () => {
  it("accepts City and Zip, defaults blank areas, and preserves leading-zero numeric ZIPs", () => {
    expect(parseTerritoryZipWorkbook(workbook([
      ["City", "Zip", "Area"],
      ["Boston", 2110, "North"],
      ["Alexandria", "22304", ""],
    ]))).toEqual([
      { rowNumber: 2, city: "Boston", zipcode: "02110", area: "North" },
      { rowNumber: 3, city: "Alexandria", zipcode: "22304", area: "Unassigned" },
    ])
  })

  it("marks duplicate and malformed rows for review", () => {
    const rows = parseTerritoryZipWorkbook(workbook([
      ["CITY", "ZIP CODE"],
      ["Alexandria", "22304"],
      ["Alexandria", "22304"],
      ["", "abc"],
    ]))
    expect(rows[1].error).toBe("This ZIP appears more than once in the file.")
    expect(rows[2].error).toBe("City is required.")
  })

  it("rejects a workbook with headers but no data", () => {
    expect(() => parseTerritoryZipWorkbook(workbook([["City", "Zip", "Area"]])))
      .toThrow("does not contain any ZIP data rows")
  })
})

describe("territory ZIP mapping route", () => {
  it("adds coverage while creating and reassigning Team Progress ZIPs without touching page totals", async () => {
    mocks.clientQuery
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ settings: { searchTerritoryZipcodes: ["22302"] } }] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ id: 7, city: "Old City", territory: "Old Area" }] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
    const { PUT } = await import("@/app/api/c/[slug]/settings/territory-zipcodes/route")
    const response = await PUT(new NextRequest("https://search.example/api/c/central/settings/territory-zipcodes", {
      method: "PUT",
      headers: { "Content-Type": "application/json", origin: "https://search.example", host: "search.example" },
      body: JSON.stringify({ rows: [
        { zipcode: "22301", city: "Alexandria", area: "East", decision: "create" },
        { zipcode: "22302", city: "Alexandria", area: "West", decision: "replace" },
      ] }),
    }), { params: { slug: "central" } })

    expect(response.status).toBe(200)
    expect(mocks.clientQuery).toHaveBeenCalledWith(expect.stringContaining("INSERT INTO zt_zipcodes"), [34, "Alexandria", "22301", 0, "East"])
    const updateCall = mocks.clientQuery.mock.calls.find(([sql]) => String(sql).includes("UPDATE zt_zipcodes SET city"))
    expect(updateCall?.[0]).not.toContain("total_pages")
    expect(updateCall?.[1]).toEqual([34, "22302", "Alexandria", "West"])
    const settingsCall = mocks.clientQuery.mock.calls.find(([sql]) => String(sql).includes("UPDATE congregations SET settings"))
    expect(JSON.parse(settingsCall?.[1][1])).toEqual({ searchTerritoryZipcodes: ["22301", "22302"] })
    expect(mocks.auditEvent).toHaveBeenCalledWith(expect.objectContaining({
      action: "team.zipcodes.imported", metadata: { source: "excel", created: 1, updated: 1, kept: 0, count: 2 },
    }))
  })

  it("rejects a page total below existing Team Progress history", async () => {
    mocks.clientQuery
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ settings: { searchTerritoryZipcodes: ["22304"] } }] })
      .mockResolvedValueOnce({ rows: [{ id: 7, city: "Alexandria", territory: "Central", total_pages: 50 }] })
      .mockResolvedValueOnce({ rows: [{ max_page: 30 }] })
      .mockResolvedValueOnce({ rows: [] })
    const { PUT } = await import("@/app/api/c/[slug]/settings/territory-zipcodes/route")
    const response = await PUT(new NextRequest("https://search.example/api/c/central/settings/territory-zipcodes", {
      method: "PUT",
      headers: { "Content-Type": "application/json", origin: "https://search.example", host: "search.example" },
      body: JSON.stringify({ rows: [
        { zipcode: "22304", city: "Alexandria", area: "Central", totalPages: 25, decision: "replace" },
      ] }),
    }), { params: { slug: "central" } })

    expect(response.status).toBe(409)
    expect(await response.json()).toEqual({ error: "ZIP 22304 cannot be reduced below page 30, which is already in use." })
    expect(mocks.clientQuery).toHaveBeenCalledWith("ROLLBACK")
    expect(mocks.auditEvent).not.toHaveBeenCalled()
  })
})
