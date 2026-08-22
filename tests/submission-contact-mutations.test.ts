import { describe, expect, it, vi } from "vitest"

import { updateSubmissionContact } from "@/lib/submission-contacts"

const counters = {
  contact_count: 2,
  potentially_french: 1,
  not_french: 1,
  duplicate: 0,
  not_checked: 0,
}

describe("submission contact mutations", () => {
  it("updates a final status within the congregation and recomputes cached counters", async () => {
    const query = vi.fn()
      .mockResolvedValueOnce({ rows: [{ contacts: [{ id: "contact-1", status: "Not French" }] }] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [counters] })

    const result = await updateSubmissionContact({ query }, {
      submissionId: 41,
      congregationId: 9,
      contactId: "contact-1",
      status: "Not French",
    })

    expect(result).toEqual({
      contact: { id: "contact-1", status: "Not French" },
      counters: { contactCount: 2, potentiallyFrench: 1, notFrench: 1, duplicate: 0, notChecked: 0 },
    })
    expect(query).toHaveBeenCalledTimes(3)
    expect(query.mock.calls[0][0]).toContain("congregation_id = $5")
    expect(query.mock.calls[0][1]).toEqual([41, "contact-1", "status", "Not French", 9])
    expect(query.mock.calls[1][0]).toContain("potentially_french = counts.potentially_french")
  })

  it("records a source check without rewriting cached counters", async () => {
    const query = vi.fn()
      .mockResolvedValueOnce({ rows: [{ contacts: [{ id: "contact-1", checkedOnTPS: true }] }] })
      .mockResolvedValueOnce({ rows: [counters] })

    const result = await updateSubmissionContact({ query }, {
      submissionId: 41,
      contactId: "contact-1",
      checkedSource: "truePeopleSearch",
    })

    expect(result?.contact).toEqual({ id: "contact-1", checkedOnTPS: true })
    expect(query).toHaveBeenCalledTimes(2)
    expect(query.mock.calls[0][0]).toContain("jsonb_build_object($3::text, $4::boolean)")
    expect(query.mock.calls[0][1]).toEqual([41, "contact-1", "checkedOnTPS", true])
    expect(query.mock.calls.some(([sql]) => String(sql).includes("UPDATE submissions s SET"))).toBe(false)
  })

  it("returns null without touching counters when the scoped contact is absent", async () => {
    const query = vi.fn().mockResolvedValueOnce({ rows: [] })
    await expect(updateSubmissionContact({ query }, {
      submissionId: 41,
      congregationId: 9,
      contactId: "missing",
      status: "Duplicate",
    })).resolves.toBeNull()
    expect(query).toHaveBeenCalledOnce()
  })
})
