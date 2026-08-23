import React from "react"
import { renderToString } from "react-dom/server"
import { describe, expect, it } from "vitest"

import { AdminToolsFaq } from "@/components/admin/admin-tools-faq"

describe("AdminToolsFaq", () => {
  it("documents every admin review tool and distinguishes destructive actions", () => {
    const markup = renderToString(React.createElement(AdminToolsFaq, { backHref: "/c/central/admin" }))

    expect(markup).toContain("Potential French contacts")
    expect(markup).toContain("Find missed French contacts")
    expect(markup).toContain("Manage name dictionary")
    expect(markup).toContain("Database Duplicates Check")
    expect(markup).toContain("Rescan &amp; Mark Reviewed")
    expect(markup).toContain("Run with saved file")
    expect(markup).toContain("Deletes data")
    expect(markup).toContain('href="/c/central/admin"')
  })
})
