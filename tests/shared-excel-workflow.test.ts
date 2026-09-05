import { beforeEach, describe, expect, it, vi } from "vitest"
import { NextRequest } from "next/server"

const mocks = vi.hoisted(() => ({ query: vi.fn(), release: vi.fn(), auth: vi.fn(), admin: vi.fn(), origin: vi.fn(), audit: vi.fn() }))
vi.mock("@/lib/db", () => ({ pool: { connect: async () => ({ query: mocks.query, release: mocks.release }), query: mocks.query } }))
vi.mock("@/lib/auth", async (original) => ({
  ...(await original<typeof import("@/lib/auth")>()), requireMembership: mocks.auth,
  requireCongregationAdmin: mocks.admin, validateMutationOrigin: mocks.origin, auditEvent: mocks.audit,
}))

const contact = { firstName: "Ana", lastName: "Martin", address: "1 Main St", city: "Alexandria", zipcode: "22301", phone: "" }
const row = { id: 56, visibility: "shared", uploaded_by_user_id: 20, segment_id: 91, zipcode_id: 4,
  zipcode: "22301", city: "Alexandria", page_start: 1, page_end: 5, owner_user_id: null,
  owner: "", status: "Not started", stopped_at_page: null, name: "Shared Excel", contact_count: 1, contacts: [contact] }
let current: any
let draft: any
let membership: any

beforeEach(() => {
  vi.clearAllMocks()
  process.env.MULTI_TENANT_ENABLED = "true"
  current = { ...row }
  draft = undefined
  membership = { user: { id: 12, displayName: "Member" }, congregation: { id: 34 }, membership: { role: "member" } }
  mocks.auth.mockImplementation(async () => membership)
  mocks.admin.mockImplementation(async () => membership)
  mocks.query.mockImplementation(async (sql: string, args: any[] = []) => {
    if (sql.includes("SELECT id,zipcode,total_pages FROM zt_zipcodes")) return { rows: [{ id: 4, zipcode: "22301", total_pages: 20 }] }
    if (sql.includes("INSERT INTO zt_segments")) return { rows: [{ id: 91 }] }
    if (sql.includes("INSERT INTO contact_packages")) return { rows: [{ id: 56 }] }
    if (sql.includes("FROM contact_packages cp")) return { rows: current ? [current] : [] }
    if (sql.includes("SELECT s.id, cp.id package_id")) return { rows: current ? [{ id: 91, package_id: 56 }] : [] }
    if (sql.includes("FROM congregation_memberships")) return { rows: [{ display_name: "Assignee" }] }
    if (sql.includes("FROM contact_drafts")) return { rows: draft ? [draft] : [] }
    if (sql.includes("INSERT INTO contact_drafts")) {
      draft = { contacts: JSON.parse(args[2]), territory_zipcode: args[3], territory_page_range: args[4], revision: 1 }
      return { rows: [draft] }
    }
    return { rows: [] }
  })
})

async function action(body: object, method = "POST") {
  const route = await import("@/app/api/c/[slug]/packages/[id]/route")
  return route[method as "POST" | "PATCH" | "DELETE"](new NextRequest("https://search.example/api/c/central/packages/56", {
    method, ...(method !== "DELETE" ? { body: JSON.stringify(body) } : {}),
  }), { params: { slug: "central", id: "56" } })
}
const writes = () => mocks.query.mock.calls.filter(([sql]) => /^(UPDATE|INSERT|DELETE)/.test(sql))

describe("shared Excel permissions and lifecycle", () => {
  it("claims available work with a fresh independent draft and scoped ownership", async () => {
    const response = await action({ action: "open", draftRevision: 0 })
    expect(response.status).toBe(200)
    const body = await response.json()
    expect(body.draft.contacts[0]).toMatchObject({ ...contact, status: "Not checked", notes: "" })
    expect(body.draft.territoryPageRange).toBe("1-5")
    expect(mocks.query).toHaveBeenCalledWith(expect.stringContaining("FOR UPDATE OF cp,s"), [56, 34])
    expect(mocks.query).toHaveBeenCalledWith(expect.stringContaining("UPDATE zt_segments SET owner=$1"), ["Member", 12, 91, 34])
    expect(mocks.query).toHaveBeenCalledWith("COMMIT")
    expect(mocks.release).toHaveBeenCalledOnce()
  })

  it.each(["In progress", "Not started"])("rejects another member's %s assignment without writes", async (status) => {
    current = { ...row, owner_user_id: 99, status }
    expect((await action({ action: "open", draftRevision: 0 })).status).toBe(409)
    expect(writes()).toEqual([])
    expect(mocks.query).toHaveBeenCalledWith("ROLLBACK")
  })

  it("rejects completed work", async () => {
    current.status = "Completed"
    expect((await action({ action: "open", draftRevision: 0 })).status).toBe(409)
    expect(writes()).toEqual([])
  })

  it("does not expose another member's private Excel", async () => {
    current.visibility = "private"
    expect((await action({ action: "open", draftRevision: 0 })).status).toBe(404)
    expect(writes()).toEqual([])
  })

  it("allows an assignee to open a private Excel", async () => {
    current = { ...row, visibility: "private", owner_user_id: 12 }
    expect((await action({ action: "open", draftRevision: 0 })).status).toBe(200)
  })

  it("returns not found when the congregation-scoped lookup is empty", async () => {
    current = null
    expect((await action({ action: "open", draftRevision: 0 })).status).toBe(404)
    expect(mocks.query).toHaveBeenCalledWith(expect.stringContaining("cp.congregation_id=$2"), [56, 34])
    expect(writes()).toEqual([])
  })

  it("rolls back ownership when the viewer has a newer saved draft", async () => {
    draft = { contacts: [{ id: "saved", notes: "Keep this" }], revision: 7 }
    const response = await action({ action: "open", draftRevision: 6 })
    expect(response.status).toBe(409)
    expect((await response.json()).server.contacts[0].notes).toBe("Keep this")
    expect(mocks.query).toHaveBeenCalledWith("ROLLBACK")
    expect(mocks.query).not.toHaveBeenCalledWith("COMMIT")
    expect(writes().some(([sql]) => sql.includes("INSERT INTO contact_drafts"))).toBe(false)
  })

  it("only lets administrators assign work", async () => {
    expect((await action({ action: "assign", userId: 99 })).status).toBe(404)
    expect(writes()).toEqual([])
  })

  it("assigns to an active member of the same congregation", async () => {
    membership.membership.role = "admin"
    expect((await action({ action: "assign", userId: 99 })).status).toBe(200)
    expect(mocks.query).toHaveBeenCalledWith(expect.stringContaining("m.status='active'"), [34, 99])
    expect(mocks.query).toHaveBeenCalledWith(expect.stringContaining("UPDATE zt_segments SET owner=$1"), ["Assignee", 99, 91, 34])
  })

  it("rejects assignment to an inactive or outside member", async () => {
    membership.membership.role = "admin"
    const normal = mocks.query.getMockImplementation()!
    mocks.query.mockImplementation((sql, args) => sql.includes("FROM congregation_memberships") ? Promise.resolve({ rows: [] }) : normal(sql, args))
    expect((await action({ action: "assign", userId: 99 })).status).toBe(404)
    expect(writes()).toEqual([])
  })

  it("releases the assignee's private Excel into shared availability without deleting their draft", async () => {
    current = { ...row, visibility: "private", owner_user_id: 12, status: "In progress" }
    expect((await action({ action: "release" })).status).toBe(200)
    expect(mocks.query).toHaveBeenCalledWith(expect.stringContaining("SET visibility='shared'"), [56, 34])
    expect(writes().some(([sql]) => sql.includes("contact_drafts"))).toBe(false)
  })

  it("prevents unrelated members from releasing work", async () => {
    current.owner_user_id = 99
    expect((await action({ action: "release" })).status).toBe(404)
    expect(writes()).toEqual([])
  })

  it.each(["PATCH", "DELETE"])("prevents a shared viewer from using %s to manage another uploader's file", async (method) => {
    expect((await action({ name: "Changed" }, method)).status).toBe(404)
    expect(writes()).toEqual([])
  })

  it("also shares a private Excel released through Team Progress", async () => {
    membership.membership.role = "admin"
    const { DELETE } = await import("@/app/api/c/[slug]/team/segments/route")
    const response = await DELETE(new NextRequest("https://search.example/api/c/central/team/segments?id=91", { method: "DELETE" }), { params: { slug: "central" } })
    expect(response.status).toBe(200)
    expect(mocks.query).toHaveBeenCalledWith(expect.stringContaining("UPDATE contact_packages SET visibility='shared'"), [56, 34])
    expect(mocks.query).not.toHaveBeenCalledWith(expect.stringContaining("DELETE FROM contact_packages"), expect.anything())
  })
})


describe("Excel upload and listing", () => {
  async function upload(overrides: object = {}) {
    const { POST } = await import("@/app/api/c/[slug]/packages/route")
    return POST(new NextRequest("https://search.example/api/c/central/packages", {
      method: "POST", body: JSON.stringify({ name: "Shared Excel", visibility: "shared", contacts: [contact], zipcode: "22301", pageStart: 1, pageEnd: 5, ...overrides }),
    }), { params: { slug: "central" } })
  }

  it("shares an upload without replacing the uploader's draft", async () => {
    expect((await upload()).status).toBe(201)
    expect(mocks.query).toHaveBeenCalledWith(expect.stringContaining("INSERT INTO contact_packages"), [34, 91, 12, "Shared Excel", "shared", "", JSON.stringify([contact]), 1])
    expect(writes().some(([sql]) => sql.includes("contact_drafts"))).toBe(false)
  })

  it("can save privately and start with a fresh draft", async () => {
    const response = await upload({ visibility: "private", startNow: true, draftRevision: 0 })
    expect(response.status).toBe(201)
    expect((await response.json()).draft.contacts).toHaveLength(1)
  })

  it.each([{ contacts: [] }, { visibility: "public" }, { pageEnd: 21 }, { pageStart: 6, pageEnd: 5 }])("rejects invalid uploads: %j", async (overrides) => {
    expect((await upload(overrides)).status).toBe(400)
    expect(writes()).toEqual([])
  })

  it("returns available shared files without returning their contact data", async () => {
    const { GET } = await import("@/app/api/c/[slug]/packages/route")
    const response = await GET(new NextRequest("https://search.example/api/c/central/packages"), { params: { slug: "central" } })
    const result = await response.json()
    expect(result.packages).toHaveLength(1)
    expect(result.packages[0]).not.toHaveProperty("contacts")
    expect(mocks.query).toHaveBeenCalledWith(expect.stringContaining("cp.congregation_id=$1"), [34, false, 12, false])
  })

  it("hides claimed shared files but permits the assignee's direct link", async () => {
    current.owner_user_id = 12
    const { GET } = await import("@/app/api/c/[slug]/packages/route")
    const request = (suffix: string) => GET(new NextRequest(`https://search.example/api/c/central/packages${suffix}`), { params: { slug: "central" } })
    expect((await (await request("")).json()).packages).toEqual([])
    expect((await (await request("?include=56")).json()).packages).toHaveLength(1)
  })
})

describe("member draft progress", () => {
  it("saves review progress and notes scoped to the signed-in member", async () => {
    const saved = { contacts: [{ ...contact, status: "Potentially French", notes: "Verified" }], global_notes: "Continue tomorrow", revision: 2 }
    draft = { ...saved, revision: 1 }
    const normal = mocks.query.getMockImplementation()!
    mocks.query.mockImplementation((sql, args) => sql.includes("INSERT INTO contact_drafts") ? Promise.resolve({ rows: [saved] }) : normal(sql, args))
    const { PUT } = await import("@/app/api/c/[slug]/draft/route")
    const response = await PUT(new NextRequest("https://search.example/api/c/central/draft", {
      method: "PUT", body: JSON.stringify({ contacts: saved.contacts, globalNotes: saved.global_notes, territoryZipcode: "22301", territoryPageRange: "1-5", revision: 1 }),
    }), { params: { slug: "central" } })
    expect(response.status).toBe(200)
    expect((await response.json()).contacts[0].notes).toBe("Verified")
    expect(mocks.query).toHaveBeenCalledWith(expect.stringContaining("WHERE contact_drafts.revision = $8"), [12, 34, JSON.stringify(saved.contacts), saved.global_notes, "22301", "1-5", null, 1, null, null])
  })

  it("returns the newer saved progress when an autosave is stale", async () => {
    draft = { contacts: [{ notes: "Newer work" }], revision: 3 }
    const { PUT } = await import("@/app/api/c/[slug]/draft/route")
    const response = await PUT(new NextRequest("https://search.example/api/c/central/draft", {
      method: "PUT", body: JSON.stringify({ contacts: [], revision: 1 }),
    }), { params: { slug: "central" } })
    expect(response.status).toBe(409)
    expect((await response.json()).server.revision).toBe(3)
  })
})
