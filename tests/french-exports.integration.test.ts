import { PGlite } from "@electric-sql/pglite"
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest"

const state = vi.hoisted(() => ({ db: null as any }))
vi.mock("@/lib/db-pool", () => ({ pool: {
  query: (sql: string, args?: unknown[]) => state.db.query(sql, args),
  connect: async () => ({ query: (sql: string, args?: unknown[]) => state.db.query(sql, args), release() {} }),
} }))

const db = { query: (sql: string, args?: unknown[]) => state.db.query(sql, args) }
let tenantId: number
let otherTenantId: number

const person = (id: string, fullName: string, address: string, status = "Potentially French") =>
  ({ id, fullName, address, city: "Alexandria", zipcode: "22301", phone: "555", notes: "", status })

beforeAll(async () => {
  state.db = new PGlite()
  const { runMigrations } = await import("@/lib/migrations")
  await runMigrations()
  tenantId = Number((await db.query("SELECT id FROM congregations ORDER BY id LIMIT 1")).rows[0].id)
  otherTenantId = Number((await db.query(`INSERT INTO congregations(name,slug) VALUES('Other','other') RETURNING id`)).rows[0].id)
  await db.query(`INSERT INTO users(id,email,display_name,password_hash) VALUES(1,'admin@example.test','Admin','test')`)
})
afterAll(async () => { await state.db?.close() })
beforeEach(async () => {
  await db.query("DELETE FROM french_contact_exports")
  await db.query("DELETE FROM submissions")
  await db.query(`INSERT INTO submissions(id,user_id,congregation_id,contacts) VALUES
    (1,'Ana',$1,$3), (2,'Ben',$1,$4), (3,'Cy',$2,$5)`, [
    tenantId, otherTenantId,
    JSON.stringify([person("a", "Jean Dupont", "1 Main St"), person("b", "Paul Roy", "2 Oak Ave", "Not French")]),
    JSON.stringify([person("c", "Marie Curie", "3 Elm Rd"), person("d", "Luc Roy", "1 Main St")]),
    JSON.stringify([person("e", "Other Tenant", "9 Far Rd")]),
  ])
})

describe("Potentially French export batches with PostgreSQL", () => {
  it("moves exported contacts out of To export, keeps a snapshot, and undoes cleanly", async () => {
    const { createFrenchExport, listFrenchContacts, updateFrenchExport } = await import("@/lib/french-exports")
    const before = await listFrenchContacts(db, tenantId)
    expect(before.contacts.map((c) => c.contactId).sort()).toEqual(["a", "c", "d"])
    expect(before.exports).toEqual([])

    const batch = await createFrenchExport(db, {
      scope: tenantId, userId: 1, stateValue: "VA",
      contacts: [{ submissionId: 1, contactId: "a" }, { submissionId: 1, contactId: "b" }, { submissionId: 3, contactId: "e" }],
    })
    // b is Not French and e belongs to another congregation, so only a is exported.
    expect(batch?.contacts.map((c) => c.contactId)).toEqual(["a"])
    expect(batch?.contacts[0]).toMatchObject({ submissionId: 1, userId: "Ana", fullName: "Jean Dupont", address: "1 Main St" })

    const after = await listFrenchContacts(db, tenantId)
    expect(after.contacts.map((c) => c.contactId).sort()).toEqual(["c", "d"])
    expect(after.contacts.find((c) => c.contactId === "d")?.exportedMatch).toBe("address")
    expect(after.exports).toHaveLength(1)
    expect(after.exports[0]).toMatchObject({ id: batch!.id, createdBy: "Admin", stateValue: "VA", archivedAt: null })

    // A contact can only be in one batch.
    expect(await createFrenchExport(db, { scope: tenantId, userId: 1, stateValue: "", contacts: [{ submissionId: 1, contactId: "a" }] })).toBeNull()

    // Edits after export don't change the batch's snapshot.
    await db.query(`UPDATE submissions SET contacts = $1 WHERE id = 1`, [JSON.stringify([person("a", "Renamed", "1 Main St")])])
    expect((await listFrenchContacts(db, tenantId)).exports[0].contacts[0].fullName).toBe("Jean Dupont")

    expect(await updateFrenchExport(db, otherTenantId, batch!.id, "archiveExport")).toBe(false)
    expect(await updateFrenchExport(db, tenantId, batch!.id, "archiveExport")).toBe(true)
    expect((await listFrenchContacts(db, tenantId)).exports[0].archivedAt).not.toBeNull()
    expect(await updateFrenchExport(db, tenantId, batch!.id, "unarchiveExport")).toBe(true)
    expect((await listFrenchContacts(db, tenantId)).exports[0].archivedAt).toBeNull()

    expect(await updateFrenchExport(db, tenantId, batch!.id, "undoExport")).toBe(true)
    const undone = await listFrenchContacts(db, tenantId)
    expect(undone.contacts.map((c) => c.contactId).sort()).toEqual(["a", "c", "d"])
    expect(undone.exports).toEqual([])
  })

  it("keeps legacy (unscoped) batches separate from congregation batches", async () => {
    const { createFrenchExport, listFrenchContacts } = await import("@/lib/french-exports")
    const legacy = await createFrenchExport(db, { scope: null, userId: null, stateValue: "", contacts: [{ submissionId: 3, contactId: "e" }] })
    expect(legacy?.contacts.map((c) => c.contactId)).toEqual(["e"])
    expect((await listFrenchContacts(db, null)).exports.map((b) => b.id)).toEqual([legacy!.id])
    expect((await listFrenchContacts(db, otherTenantId)).exports).toEqual([])
  })
})
