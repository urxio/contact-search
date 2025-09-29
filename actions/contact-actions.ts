// Lightweight client-side stubs for contact update actions.
// These operate on localStorage so the UI's optimistic updates have a simple persistence layer.

export async function updateContact(id: string, patch: Record<string, any>): Promise<void> {
  try {
    const raw = localStorage.getItem("contacts")
    if (!raw) return
    const contacts = JSON.parse(raw)
    const updated = contacts.map((c: any) => (c.id === id ? { ...c, ...patch } : c))
    localStorage.setItem("contacts", JSON.stringify(updated))
  } catch (err) {
    // Re-throw so callers can handle/log
    throw err
  }
}

export async function bulkUpdateContacts(ids: string[], patch: Record<string, any>): Promise<void> {
  try {
    const raw = localStorage.getItem("contacts")
    if (!raw) return
    const contacts = JSON.parse(raw)
    const updated = contacts.map((c: any) => (ids.includes(c.id) ? { ...c, ...patch } : c))
    localStorage.setItem("contacts", JSON.stringify(updated))
  } catch (err) {
    throw err
  }
}
