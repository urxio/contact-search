import React from "react"
import { renderToString } from "react-dom/server"
import { describe, expect, it } from "vitest"

import { AdminContactReview } from "@/components/admin/admin-contact-review"
import { SubmissionStatusSelect } from "@/components/admin/submission-status-select"

describe("AdminContactReview", () => {
  it("provides tooltip context when rendered outside the workspace shell", () => {
    expect(() => renderToString(React.createElement(AdminContactReview, {
      submissionId: 41,
      apiUrl: "/api/admin/submissions",
      initialContacts: [{
        id: "contact-1",
        firstName: "Marie",
        lastName: "Martin",
        fullName: "Marie Martin",
        zipcode: "22301",
        status: "Not checked",
      }],
    }))).not.toThrow()
  })

  it("renders compact research controls", () => {
    const markup = renderToString(React.createElement(AdminContactReview, {
      submissionId: 41,
      apiUrl: "/api/admin/submissions",
      initialContacts: [{
        id: "contact-1",
        fullName: "Marie Martin",
        lastName: "Martin",
        zipcode: "22301",
        status: "Not checked",
      }],
    }))
    expect(markup).toContain('aria-label="Search surname on Forebears"')
    expect(markup).toContain('aria-label="Search name and ZIP on TruePeopleSearch"')
  })

  it("renders the standalone submission status control", () => {
    const markup = renderToString(React.createElement(SubmissionStatusSelect, {
      submissionId: 41,
      apiUrl: "/api/admin/submissions",
      initialStatus: "in_review",
    }))
    expect(markup).toContain('aria-label="Submission status"')
    expect(markup).toContain("In review")
  })
})
