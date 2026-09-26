import React from "react"
import { renderToString } from "react-dom/server"
import { describe, expect, it, vi } from "vitest"
import { TooltipProvider } from "@/components/ui/tooltip"
import { ContactTable } from "@/components/home/ContactTable"
import { ContactGrid } from "@/components/home/ContactGrid"
import { OriginBottomBar } from "@/components/home/OriginBottomBar"
import type { EnhancedContact } from "@/types/contact"

const contact: EnhancedContact = {
  id: "one", firstName: "Ana", lastName: "Dupont", fullName: "Ana Dupont",
  address: "1 Main St", city: "Alexandria", zipcode: "22301", phone: "",
  status: "Not checked", notes: "", isExpanded: false, checkedOnTPS: false,
  checkedOnOTM: false, checkedOnForebears: false, checkedOnOrigin: true,
  needAddressUpdate: false, needPhoneUpdate: false, territoryStatus: false,
}

const handlers = {
  contacts: [contact], selectedContacts: [], lastVerifiedId: null,
  onToggleSelection: vi.fn(), onToggleExpanded: vi.fn(), onStatusChange: vi.fn(),
  onNotesChange: vi.fn(), onFieldChange: vi.fn(), onAddressUpdateChange: vi.fn(),
  onPhoneUpdateChange: vi.fn(), onTerritoryStatusChange: vi.fn(),
  onSearchOrigin: vi.fn(), onSearchTPS: vi.fn(), activeOriginContactId: "one",
}

function renderWithTooltips(component: React.ReactElement) {
  return renderToString(React.createElement(TooltipProvider, null, component))
}

describe("Origin contact UI", () => {
  it("shows the Origin action in both views without surname country badges", () => {
    const table = renderWithTooltips(React.createElement(ContactTable, {
      ...handlers, onToggleSelectAll: vi.fn(),
    }))
    const grid = renderWithTooltips(React.createElement(ContactGrid, handlers))
    for (const markup of [table, grid]) {
      expect(markup).toContain('aria-label="Research origin of Dupont"')
      expect(markup).toContain("ring-indigo-500")
      expect(markup).not.toContain("Show saved surname countries")
    }
    expect(table).toContain("overflow-x-auto")
  })

  it("shows sourced results in a responsive nonmodal bottom panel", () => {
    const markup = renderToString(React.createElement(OriginBottomBar, {
      contactName: "Ana Dupont", surname: "dupont", loading: false, error: null,
      entry: { surname: "dupont", researchedAt: "2026-09-26T12:00:00Z", origins: [{
        country: "France", explanation: "French surname.",
        sources: [{ title: "Surname history", url: "https://example.org/names/dupont" }],
      }] },
      onRefresh: vi.fn(), onClose: vi.fn(),
    }))
    expect(markup).toContain("Possible origins")
    expect(markup).toContain('href="https://example.org/names/dupont"')
    expect(markup).toContain("Research again")
    expect(markup).toContain("Open Forebears")
    expect(markup).toContain("max-h-[60dvh]")
    expect(markup).toContain("rounded-2xl")
    expect(markup).toContain("shadow-2xl")
    expect(markup).toContain("md:grid-cols-2")
    expect(markup).toContain('aria-label="Close origin panel"')
    expect(markup).toContain("not evidence of this contact")
  })

  it("shows a clear inconclusive state", () => {
    const markup = renderToString(React.createElement(OriginBottomBar, {
      contactName: "Ana Dupont", surname: "dupont", loading: false, error: null,
      entry: { surname: "dupont", researchedAt: "2026-09-26T12:00:00Z", origins: [] },
      onRefresh: vi.fn(), onClose: vi.fn(),
    }))
    expect(markup).toContain("Origin unclear")
  })

  it("shows an animated and accessible loading state", () => {
    const markup = renderToString(React.createElement(OriginBottomBar, {
      contactName: "Ana Dupont", surname: "dupont", loading: true, error: null,
      entry: null, onRefresh: vi.fn(), onClose: vi.fn(),
    }))
    expect(markup).toContain('role="status"')
    expect(markup).toContain("Researching surname…")
    expect(markup).toContain("motion-safe:animate-spin")
  })
})
