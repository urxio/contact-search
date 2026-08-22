import React from "react"
import { renderToString } from "react-dom/server"
import { describe, expect, it } from "vitest"

import { AdminContactReview } from "@/components/admin/admin-contact-review"

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
})
