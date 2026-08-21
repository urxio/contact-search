import { describe, expect, it } from "vitest"
import { freshDraftContacts, sanitizePackageContacts, serializePackage } from "@/lib/contact-packages"

describe("contact packages", () => {
  it("stores only reusable contact fields", () => {
    expect(sanitizePackageContacts([{
      firstName: " Ana ", lastName: "Martin", address: "1 Main St", city: "Alexandria",
      zipcode: "22301", phone: "555-0100", status: "Potentially French", notes: "private note",
    }])).toEqual([{ firstName: "Ana", lastName: "Martin", address: "1 Main St", city: "Alexandria", zipcode: "22301", phone: "555-0100" }])
  })

  it("rejects empty and malformed contact collections", () => {
    expect(sanitizePackageContacts([])).toBeNull()
    expect(sanitizePackageContacts([{ firstName: "Ana" }])).toBeNull()
  })

  it("creates clean independent draft contacts and recalculates duplicate addresses", () => {
    const source = [
      { firstName: "Ana", lastName: "Martin", address: "1 Main St", city: "Alexandria", zipcode: "22301", phone: "" },
      { firstName: "Luc", lastName: "Roy", address: "1 MAIN ST", city: "Alexandria", zipcode: "22301", phone: "" },
    ]
    const first = freshDraftContacts(source)
    const second = freshDraftContacts(source)
    expect(first.map(contact => contact.status)).toEqual(["Not checked", "Duplicate"])
    expect(first[0].id).not.toBe(second[0].id)
    expect(first[0].notes).toBe("")
  })

  it("derives availability and permissions without exposing contacts", () => {
    const value = serializePackage({
      id: 4, name: "North pages", visibility: "shared", original_filename: "north.xlsx", contact_count: 2,
      created_at: new Date(), updated_at: new Date(), uploaded_by_user_id: 10, uploader_name: "Ana",
      segment_id: 8, zipcode: "22301", city: "Alexandria", page_start: 1, page_end: 3,
      owner_user_id: null, owner: "", status: "Not started", stopped_at_page: null,
    }, 11, false)
    expect(value.state).toBe("available")
    expect(value.canOpen).toBe(true)
    expect(value.canManage).toBe(false)
    expect(value).not.toHaveProperty("contacts")
  })
})
