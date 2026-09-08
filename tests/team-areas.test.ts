import { beforeEach, describe, expect, it, vi } from "vitest"
import { NextRequest } from "next/server"

import { orderedTeamAreas } from "@/lib/team-areas"

const mocks = vi.hoisted(() => ({
  auditEvent: vi.fn(),
  clientQuery: vi.fn(),
  poolQuery: vi.fn(),
  release: vi.fn(),
  requireCongregationAdmin: vi.fn(),
  requireMembership: vi.fn(),
  validateMutationOrigin: vi.fn(),
}))

vi.mock("@/lib/auth", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/auth")>()),
  auditEvent: mocks.auditEvent,
  requireCongregationAdmin: mocks.requireCongregationAdmin,
  requireMembership: mocks.requireMembership,
  validateMutationOrigin: mocks.validateMutationOrigin,
}))

vi.mock("@/lib/db", () => ({
  pool: {
    connect: vi.fn(async () => ({ query: mocks.clientQuery, release: mocks.release })),
    query: mocks.poolQuery,
  },
}))

beforeEach(() => {
  process.env.MULTI_TENANT_ENABLED = "true"
  mocks.auditEvent.mockReset().mockResolvedValue(undefined)
  mocks.clientQuery.mockReset().mockResolvedValue({ rows: [] })
  mocks.poolQuery.mockReset().mockResolvedValue({ rows: [] })
  mocks.release.mockReset()
  mocks.requireCongregationAdmin.mockReset().mockResolvedValue({
    user: { id: 12 }, congregation: { id: 34, slug: "central" }, membership: { role: "admin" },
  })
  mocks.requireMembership.mockReset().mockResolvedValue({
    user: { id: 12 }, congregation: { id: 34, slug: "central" }, membership: { role: "member" },
  })
  mocks.validateMutationOrigin.mockReset()
})

describe("Team Progress area ordering", () => {
  it("keeps saved order, appends new areas, and fixes Unassigned last", () => {
    expect(orderedTeamAreas(
      ["Unassigned", "East", "North", "South"],
      ["South", "Unassigned", "North"],
    )).toEqual(["South", "North", "East", "Unassigned"])
  })

  it("keeps a saved empty area in the ordered list", () => {
    expect(orderedTeamAreas(["North"], ["South", "North"])).toEqual(["South", "North"])
  })

  it("applies the saved area order to Team Progress ZIP results", async () => {
    mocks.poolQuery
      .mockResolvedValueOnce({ rows: [
        { zipcode: "22301", city: "Alexandria", territory: "North" },
        { zipcode: "22191", city: "Woodbridge", territory: "South" },
        { zipcode: "20101", city: "Dulles", territory: "Unassigned" },
      ] })
      .mockResolvedValueOnce({ rows: [{ settings: { teamProgressAreaOrder: ["South", "North", "Unassigned"] } }] })
    const { GET } = await import("@/app/api/c/[slug]/team/zipcodes/route")
    const response = await GET(new NextRequest("https://search.example/api/c/central/team/zipcodes"), { params: { slug: "central" } })

    expect(response.status).toBe(200)
    const body = await response.json()
    expect(body.rows.map((row: { territory: string }) => row.territory))
      .toEqual(["South", "North", "Unassigned"])
    expect(body.areas).toEqual(["South", "North", "Unassigned"])
  })
})

describe("Team Progress area creation", () => {
  it("creates an empty area in the saved area order", async () => {
    mocks.clientQuery
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ settings: { teamProgressAreaOrder: ["North"] } }] })
      .mockResolvedValueOnce({ rows: [{ territory: "North" }] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
    const { POST } = await import("@/app/api/c/[slug]/team/areas/route")
    const response = await POST(new NextRequest("https://search.example/api/c/central/team/areas", {
      method: "POST",
      headers: { "Content-Type": "application/json", origin: "https://search.example", host: "search.example" },
      body: JSON.stringify({ name: "South" }),
    }), { params: { slug: "central" } })

    expect(response.status).toBe(201)
    expect(await response.json()).toEqual({ success: true, areas: ["North", "South"] })
    expect(mocks.auditEvent).toHaveBeenCalledWith(expect.objectContaining({ action: "team.area.created", targetId: "South" }))
  })
})

describe("Team Progress ZIP coverage synchronization", () => {
  it("adds a newly created Team Progress ZIP to congregation territory coverage", async () => {
    mocks.clientQuery
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ settings: { searchTerritoryZipcodes: ["22301"] } }] })
      .mockResolvedValueOnce({ rows: [{ id: 7, zipcode: "22302" }] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
    const { POST } = await import("@/app/api/c/[slug]/team/zipcodes/route")
    const response = await POST(new NextRequest("https://search.example/api/c/central/team/zipcodes", {
      method: "POST",
      headers: { "Content-Type": "application/json", origin: "https://search.example", host: "search.example" },
      body: JSON.stringify({ city: "Alexandria", zipcode: "22302", total_pages: 100, territory: "North" }),
    }), { params: { slug: "central" } })

    expect(response.status).toBe(201)
    const settingsCall = mocks.clientQuery.mock.calls.find(([sql]) => String(sql).includes("UPDATE congregations SET settings"))
    expect(JSON.parse(settingsCall?.[1][1])).toEqual({ searchTerritoryZipcodes: ["22301", "22302"] })
  })

  it("removes a deleted Team Progress ZIP from congregation territory coverage", async () => {
    mocks.clientQuery
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ settings: { searchTerritoryZipcodes: ["22301", "22302"] } }] })
      .mockResolvedValueOnce({ rows: [{ zipcode: "22302" }] })
      .mockResolvedValueOnce({ rows: [{ count: 0 }] })
      .mockResolvedValueOnce({ rows: [{ id: 7, zipcode: "22302" }] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
    const { DELETE } = await import("@/app/api/c/[slug]/team/zipcodes/route")
    const response = await DELETE(new NextRequest("https://search.example/api/c/central/team/zipcodes?id=7", {
      method: "DELETE", headers: { origin: "https://search.example", host: "search.example" },
    }), { params: { slug: "central" } })

    expect(response.status).toBe(200)
    const settingsCall = mocks.clientQuery.mock.calls.find(([sql]) => String(sql).includes("UPDATE congregations SET settings"))
    expect(JSON.parse(settingsCall?.[1][1])).toEqual({ searchTerritoryZipcodes: ["22301"] })
  })
})

describe("Team Progress area management route", () => {
  it("renames every ZIP in an area and preserves its position", async () => {
    mocks.clientQuery
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ settings: { teamProgressAreaOrder: ["South", "North", "Unassigned"] } }] })
      .mockResolvedValueOnce({ rows: [{ territory: "North" }, { territory: "South" }, { territory: "Unassigned" }] })
      .mockResolvedValueOnce({ rows: [], rowCount: 2 })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
    const { PATCH } = await import("@/app/api/c/[slug]/settings/territory-areas/route")
    const response = await PATCH(new NextRequest("https://search.example/api/c/central/settings/territory-areas", {
      method: "PATCH",
      headers: { "Content-Type": "application/json", origin: "https://search.example", host: "search.example" },
      body: JSON.stringify({ action: "rename", area: "North", name: "Central" }),
    }), { params: { slug: "central" } })

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ success: true, areas: ["South", "Central", "Unassigned"], count: 2 })
    expect(mocks.clientQuery).toHaveBeenCalledWith(
      expect.stringContaining("UPDATE zt_zipcodes SET territory"),
      [34, "North", "Central"],
    )
    expect(mocks.auditEvent).toHaveBeenCalledWith(expect.objectContaining({ action: "team.area.renamed" }))
  })

  it("persists an explicit area order with Unassigned fixed last", async () => {
    mocks.clientQuery
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ settings: {} }] })
      .mockResolvedValueOnce({ rows: [{ territory: "North" }, { territory: "South" }, { territory: "Unassigned" }] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
    const { PATCH } = await import("@/app/api/c/[slug]/settings/territory-areas/route")
    const response = await PATCH(new NextRequest("https://search.example/api/c/central/settings/territory-areas", {
      method: "PATCH",
      headers: { "Content-Type": "application/json", origin: "https://search.example", host: "search.example" },
      body: JSON.stringify({ action: "reorder", areas: ["Unassigned", "South", "North"] }),
    }), { params: { slug: "central" } })

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ success: true, areas: ["South", "North", "Unassigned"] })
    const settingsCall = mocks.clientQuery.mock.calls.find(([sql]) => String(sql).includes("UPDATE congregations SET settings"))
    expect(JSON.parse(settingsCall?.[1][1])).toEqual({ teamProgressAreaOrder: ["South", "North", "Unassigned"] })
  })


  it("deletes an area by moving its ZIPs to Unassigned", async () => {
    mocks.clientQuery
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ settings: { teamProgressAreaOrder: ["North", "South"] } }] })
      .mockResolvedValueOnce({ rows: [{ territory: "North" }, { territory: "South" }] })
      .mockResolvedValueOnce({ rows: [], rowCount: 3 })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
    const { DELETE } = await import("@/app/api/c/[slug]/settings/territory-areas/route")
    const response = await DELETE(new NextRequest("https://search.example/api/c/central/settings/territory-areas?area=North", {
      method: "DELETE",
      headers: { origin: "https://search.example", host: "search.example" },
    }), { params: { slug: "central" } })

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ success: true, areas: ["South", "Unassigned"], count: 3 })
    expect(mocks.clientQuery).toHaveBeenCalledWith(
      expect.stringContaining("UPDATE zt_zipcodes SET territory"),
      [34, "North", "Unassigned"],
    )
    expect(mocks.auditEvent).toHaveBeenCalledWith(expect.objectContaining({
      action: "team.area.deleted",
      metadata: { area: "North", movedTo: "Unassigned", zipcodeCount: 3 },
    }))
  })
})
