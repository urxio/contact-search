import { PGlite } from "@electric-sql/pglite"
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest"
import { NextRequest } from "next/server"

const state = vi.hoisted(() => ({ db: null as any, userId: 1, role: "member", tenantId: 1 }))
vi.mock("@/lib/db-pool", () => ({ pool: {
  query: (sql: string, args?: unknown[]) => state.db.query(sql, args),
  connect: async () => ({ query: (sql: string, args?: unknown[]) => state.db.query(sql, args), release() {} }),
} }))
vi.mock("@/lib/auth", async (original) => ({
  ...(await original<typeof import("@/lib/auth")>()),
  requireMembership: async () => ({ user: { id: state.userId, displayName: `Member ${state.userId}` }, congregation: { id: state.tenantId }, membership: { role: state.role } }),
  requireCongregationAdmin: async () => ({ user: { id: state.userId }, congregation: { id: state.tenantId }, membership: { role: "admin" } }),
  validateMutationOrigin() {}, auditEvent: async () => {},
}))

const contact = { firstName: "Ana", lastName: "Martin", address: "1 Main", city: "Alexandria", zipcode: "22301", phone: "555" }
let packageId: number
let segmentId: number
let migratedProgress: any
const query = (sql: string, args?: unknown[]) => state.db.query(sql, args)
async function action(body: object) {
  const { POST } = await import("@/app/api/c/[slug]/packages/[id]/route")
  return POST(new NextRequest(`https://search.example/api/c/central/packages/${packageId}`, { method: "POST", body: JSON.stringify(body) }), { params: { slug: "central", id: String(packageId) } })
}
async function open(revision = 0) {
  const response = await action({ action: "open", draftRevision: revision })
  expect(response.status).toBe(200)
  return (await response.json()).draft
}
async function save(draft: any, changes: object = {}) {
  const { PUT } = await import("@/app/api/c/[slug]/draft/route")
  return PUT(new NextRequest("https://search.example/api/c/central/draft", { method: "PUT", body: JSON.stringify({ ...draft, ...changes }) }), { params: { slug: "central" } })
}
async function review() {
  const draft = await open()
  draft.contacts[0] = { ...draft.contacts[0], status: "Potentially French", notes: "Call after 6", checkedOnTPS: true, checkedOnOTM: true, needPhoneUpdate: true }
  draft.globalNotes = "Continue with the next address"
  draft.lastVerifiedId = draft.contacts[0].id
  const response = await save(draft)
  expect(response.status).toBe(200)
  return response.json()
}

beforeAll(async () => {
  state.db = new PGlite()
  const originalQuery = state.db.query.bind(state.db)
  vi.spyOn(state.db, "query").mockImplementation(async (sql: any, args: any) => {
    if (String(sql).includes("ADD COLUMN saved_progress")) {
      await originalQuery(`INSERT INTO users(id,email,display_name,password_hash) VALUES(101,'legacy@example.test','Legacy','test')`)
      const zip = await originalQuery(`INSERT INTO zt_zipcodes(congregation_id,zipcode,city,total_pages) VALUES(1,'22301','Alexandria',20) RETURNING id`)
      const segment = await originalQuery(`INSERT INTO zt_segments(congregation_id,zipcode_id,page_start,page_end,owner_user_id,status) VALUES(1,$1,1,5,101,'In progress') RETURNING id`, [zip.rows[0].id])
      await originalQuery(`INSERT INTO contact_packages(congregation_id,segment_id,uploaded_by_user_id,name,visibility,contacts,contact_count) VALUES(1,$1,101,'Existing work','private',$2,1)`, [segment.rows[0].id,JSON.stringify([contact])])
      await originalQuery(`INSERT INTO contact_drafts(user_id,congregation_id,contacts,global_notes,territory_zipcode,territory_page_range,last_verified_contact_id) VALUES(101,1,$1,'Existing notes','22301','1-5','legacy-id')`, [JSON.stringify([{ ...contact, id: "legacy-id", status: "Not French" }])])
    }
    return originalQuery(sql,args)
  })
  const { runMigrations } = await import("@/lib/migrations")
  await runMigrations()
  await runMigrations()
  migratedProgress = (await query("SELECT saved_progress FROM contact_packages WHERE uploaded_by_user_id=101")).rows[0].saved_progress
  const central = await query("SELECT id FROM congregations ORDER BY id LIMIT 1")
  state.tenantId = Number(central.rows[0].id)
  await query(`INSERT INTO users(id,email,display_name,password_hash) VALUES (1,'one@example.test','One','test'),(2,'two@example.test','Two','test')`)
  await query(`INSERT INTO congregation_memberships(user_id,congregation_id,role) VALUES(1,$1,'admin'),(2,$1,'member')`, [state.tenantId])
})
afterAll(async () => { await state.db?.close() })
beforeEach(async () => {
  state.userId = 1; state.role = "member"; state.tenantId = 1
  process.env.MULTI_TENANT_ENABLED = "true"
  await query("DELETE FROM contact_drafts")
  await query("DELETE FROM contact_packages")
  await query("DELETE FROM zt_segments")
  await query("DELETE FROM zt_zipcodes")
  const zip = await query(`INSERT INTO zt_zipcodes(congregation_id,zipcode,city,total_pages) VALUES(1,'22301','Alexandria',20) RETURNING id`)
  const segment = await query(`INSERT INTO zt_segments(congregation_id,zipcode_id,page_start,page_end) VALUES(1,$1,1,5) RETURNING id`, [zip.rows[0].id])
  segmentId = Number(segment.rows[0].id)
  const created = await query(`INSERT INTO contact_packages(congregation_id,segment_id,uploaded_by_user_id,name,visibility,contacts,contact_count) VALUES(1,$1,1,'Shared Excel','shared',$2,1) RETURNING id`, [segmentId, JSON.stringify([contact])])
  packageId = Number(created.rows[0].id)
})

describe("Excel progress handoffs with PostgreSQL", () => {
  it("backfills the current owner's matching pre-migration draft", async () => {
    expect(migratedProgress).toMatchObject({ contacts: [{ id: "legacy-id", status: "Not French" }], globalNotes: "Existing notes", lastVerifiedId: "legacy-id" })
  })
  it("applies the handoff migration", async () => {
    expect((await query("SELECT max(version) AS version FROM schema_migrations")).rows[0].version).toBe(10)
  })
  it("restores reviewed contacts, stable IDs, notes, flags, and last position after release and claim", async () => {
    const saved = await review()
    expect((await action({ action: "release" })).status).toBe(200)
    state.userId = 2
    const resumed = await open()
    expect(resumed).toMatchObject({ contacts: saved.contacts, globalNotes: saved.globalNotes, lastVerifiedId: saved.lastVerifiedId, packageId, resumed: true })
  })
  it("resumes the current owner's progress when reopened", async () => {
    const saved = await review()
    expect((await open(saved.revision)).contacts).toEqual(saved.contacts)
  })
  it("preserves progress and segment notes through administrator reassignment", async () => {
    const saved = await review()
    await query("UPDATE zt_segments SET stopped_at_page=3,notes='Start at page 3' WHERE id=$1", [segmentId])
    state.role = "admin"
    expect((await action({ action: "assign", userId: 2 })).status).toBe(200)
    state.userId = 2; state.role = "member"
    expect((await open()).contacts).toEqual(saved.contacts)
    expect((await query("SELECT stopped_at_page,notes FROM zt_segments WHERE id=$1", [segmentId])).rows[0]).toMatchObject({ stopped_at_page: 3, notes: "Start at page 3" })
  })
  it("preserves progress through Team Progress release", async () => {
    const saved = await review()
    const { DELETE } = await import("@/app/api/c/[slug]/team/segments/route")
    expect((await DELETE(new NextRequest(`https://search.example/api/c/central/team/segments?id=${segmentId}`, { method: "DELETE" }), { params: { slug: "central" } })).status).toBe(200)
    state.userId = 2
    expect((await open()).contacts).toEqual(saved.contacts)
  })
  it("rejects the old owner's late autosave without changing the handoff snapshot", async () => {
    const saved = await review()
    await action({ action: "release" })
    const response = await save(saved, { contacts: [], globalNotes: "stale overwrite" })
    expect(response.status).toBe(409)
    expect((await response.json()).server.packageId).toBeNull()
    state.userId = 2
    expect((await open()).contacts).toEqual(saved.contacts)
  })
  it("rejects an old draft even after the Excel is reassigned back to its previous owner", async () => {
    const saved = await review()
    state.role = "admin"
    await action({ action: "assign", userId: 2 })
    await action({ action: "assign", userId: 1 })
    expect((await save(saved, { globalNotes: "stale" })).status).toBe(409)
  })
  it("leaves saved package progress intact when a personal draft is cleared", async () => {
    const saved = await review()
    const { DELETE } = await import("@/app/api/c/[slug]/draft/route")
    await DELETE(new NextRequest("https://search.example/api/c/central/draft", { method: "DELETE" }), { params: { slug: "central" } })
    expect((await open()).contacts).toEqual(saved.contacts)
  })
  it("does not publish an unrelated imported draft to the Excel", async () => {
    const saved = await review()
    expect((await save(saved, { packageId: null, contacts: [], globalNotes: "Unrelated" })).status).toBe(200)
    expect((await query("SELECT saved_progress FROM contact_packages WHERE id=$1", [packageId])).rows[0].saved_progress.contacts).toEqual(saved.contacts)
  })
  it("rolls back assignment changes when opening conflicts with a newer draft", async () => {
    const saved = await review()
    expect((await action({ action: "open", draftRevision: 0 })).status).toBe(409)
    expect((await save(saved)).status).toBe(200)
  })
  it("does not allow another congregation to attach to the package", async () => {
    const saved = await review()
    await query(`INSERT INTO congregations(id,name,slug) VALUES(99,'Other','other') ON CONFLICT DO NOTHING`)
    state.tenantId = 99
    expect((await save({ ...saved, revision: 0 })).status).toBe(409)
    expect((await query("SELECT count(*)::int count FROM contact_drafts WHERE congregation_id=99")).rows[0].count).toBe(0)
  })
  it("retains the personal draft when its package is deleted", async () => {
    const saved = await review()
    const { DELETE } = await import("@/app/api/c/[slug]/packages/[id]/route")
    expect((await DELETE(new NextRequest(`https://search.example/api/c/central/packages/${packageId}`, { method: "DELETE" }), { params: { slug: "central", id: String(packageId) } })).status).toBe(200)
    const personal = (await query("SELECT contacts,package_id FROM contact_drafts WHERE user_id=1")).rows[0]
    expect(personal.package_id).toBeNull()
    expect(personal.contacts).toEqual(saved.contacts)
  })
  it("preserves final progress through submission and an administrator reopening completed work", async () => {
    const saved = await review()
    const { POST } = await import("@/app/api/c/[slug]/submissions/route")
    const response = await POST(new NextRequest("https://search.example/api/c/central/submissions", { method: "POST", body: JSON.stringify({ draftRevision: saved.revision }) }), { params: { slug: "central" } })
    expect(response.status).toBe(201)
    expect((await save(saved)).status).toBe(409)
    state.role = "admin"
    expect((await action({ action: "release" })).status).toBe(200)
    state.userId = 2; state.role = "member"
    expect((await open()).contacts).toEqual(saved.contacts)
  })
  it("rejects submission from a former assignee", async () => {
    const saved = await review()
    await action({ action: "release" })
    const { POST } = await import("@/app/api/c/[slug]/submissions/route")
    const response = await POST(new NextRequest("https://search.example/api/c/central/submissions", { method: "POST", body: JSON.stringify({ draftRevision: saved.revision }) }), { params: { slug: "central" } })
    expect(response.status).toBe(409)
  })
  it("retains deliberate contact deletions when resumed", async () => {
    const saved = await review()
    const response = await save(saved, { contacts: [] })
    expect(response.status).toBe(200)
    expect((await open((await response.json()).revision)).contacts).toEqual([])
  })

  it("rejects an old tab even when clearing and reopening reused its draft revision", async () => {
    const old = await open()
    const { DELETE } = await import("@/app/api/c/[slug]/draft/route")
    await DELETE(new NextRequest("https://search.example/api/c/central/draft", { method: "DELETE" }), { params: { slug: "central" } })
    const reopened = await open()
    expect(reopened.revision).toBe(old.revision)
    expect(reopened.packageAssignmentRevision).not.toBe(old.packageAssignmentRevision)
    expect((await save(old, { contacts: [] })).status).toBe(409)
  })

})
