import React from "react"
import { renderToString } from "react-dom/server"
import { describe, expect, it, vi } from "vitest"

import { ImportBar } from "@/components/home/ImportBar"

function renderBar(props: Partial<React.ComponentProps<typeof ImportBar>> = {}) {
  return renderToString(React.createElement(ImportBar, {
    isLoading: false,
    fileUploaded: true,
    error: null,
    fileInputRef: { current: null },
    onFileUpload: vi.fn(),
    onNewSession: vi.fn(),
    ...props,
  }))
}

function text(markup: string) {
  return markup.replaceAll(/<!--.*?-->/g, "")
}

describe("ImportBar Excel progress notification", () => {
  it("names the Excel currently being reviewed and makes its state clear", () => {
    const markup = text(renderBar({
      ownActivePackages: [{ id: 18, name: "Alexandria North — pages 541–582" }],
      currentPackageId: 18,
    }))

    expect(markup).toContain("Your Excel is in progress")
    expect(markup).toContain("Excel: Alexandria North — pages 541–582")
    expect(markup).toContain("Reviewing now")
    expect(markup).toContain("disabled")
  })

  it("offers to continue a prior review when it is not already open", () => {
    const markup = text(renderBar({ ownActivePackages: [{ id: 18, name: "West Alexandria" }] }))

    expect(markup).toContain("Excel: West Alexandria")
    expect(markup).toContain("Continue reviewing")
    expect(markup).not.toContain("Reviewing now")
  })

  it("keeps an unopened admin assignment separate from an active review", () => {
    const markup = text(renderBar({ assignedPackages: [{ id: 22, name: "Assigned Excel" }] }))

    expect(markup).toContain("An Excel has been assigned to you by an admin")
    expect(markup).toContain("Open Assigned Excel")
    expect(markup).not.toContain("Your Excel is in progress")
  })
})
