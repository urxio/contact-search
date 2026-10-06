import React from "react"
import { renderToString } from "react-dom/server"
import { describe, expect, it, vi } from "vitest"
import { TooltipProvider } from "@/components/ui/tooltip"
import { ContactTable } from "@/components/home/ContactTable"
import { ContactGrid } from "@/components/home/ContactGrid"
import { OriginBottomBar } from "@/components/home/OriginBottomBar"
import { flagForCountry } from "@/lib/country-flags"
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
  onSearchForebears: vi.fn(), onSearchOrigin: vi.fn(), onSearchTPS: vi.fn(),
  activeOriginContactId: "one",
}

function renderWithTooltips(component: React.ReactElement) {
  return renderToString(React.createElement(TooltipProvider, null, component))
}

function actionTags(markup: string, label: string) {
  return (markup.match(/<button\b[^>]*>/g) ?? []).filter((tag) => tag.includes(`aria-label="${label}"`))
}

describe("Origin contact UI", () => {
  it("shows separate Forebears and Luna actions in the table, mobile table, and grid", () => {
    const table = renderWithTooltips(React.createElement(ContactTable, {
      ...handlers, onToggleSelectAll: vi.fn(),
    }))
    const grid = renderWithTooltips(React.createElement(ContactGrid, handlers))
    for (const [markup, count] of [[table, 2], [grid, 1]] as const) {
      const forebears = actionTags(markup, "Search Dupont on Forebears")
      const luna = actionTags(markup, "Research Dupont with Luna")
      expect(forebears).toHaveLength(count)
      expect(luna).toHaveLength(count)
      expect(forebears.every((tag) => !tag.includes("border-green-300 bg-green-100 text-green-700"))).toBe(true)
      expect(luna.every((tag) => tag.includes("border-green-300 bg-green-100 text-green-700"))).toBe(true)
      expect(markup).toContain("ring-indigo-500")
    }
    expect(table).toContain("flex flex-wrap gap-1.5 sm:hidden")
    expect(table).toContain("hidden sm:inline-flex")
    expect(table).toContain("overflow-x-auto")
    expect(table).toContain("Forebears")
    expect(table).toContain("Luna")
  })

  it("tracks Forebears and Luna checked states independently", () => {
    for (const [checkedOnForebears, checkedOnOrigin] of [[true, false], [false, true], [false, false]] as const) {
      const candidate = { ...contact, checkedOnForebears, checkedOnOrigin }
      const table = renderWithTooltips(React.createElement(ContactTable, {
        ...handlers, contacts: [candidate], onToggleSelectAll: vi.fn(),
      }))
      const grid = renderWithTooltips(React.createElement(ContactGrid, {
        ...handlers, contacts: [candidate],
      }))
      for (const markup of [table, grid]) {
        for (const [label, checked] of [
          ["Search Dupont on Forebears", checkedOnForebears],
          ["Research Dupont with Luna", checkedOnOrigin],
        ] as const) {
          const tags = actionTags(markup, label)
          expect(tags.length).toBeGreaterThan(0)
          expect(tags.every((tag) => tag.includes("border-green-300 bg-green-100 text-green-700"))).toBe(checked)
        }
      }
    }
  })

  it("disables both surname actions when a contact has no last name", () => {
    const missingSurname = { ...contact, lastName: " " }
    const table = renderWithTooltips(React.createElement(ContactTable, {
      ...handlers, contacts: [missingSurname], onToggleSelectAll: vi.fn(),
    }))
    const grid = renderWithTooltips(React.createElement(ContactGrid, {
      ...handlers, contacts: [missingSurname],
    }))
    for (const markup of [table, grid]) {
      for (const label of ["Search surname on Forebears", "Research surname with Luna"]) {
        const tags = actionTags(markup, label)
        expect(tags.length).toBeGreaterThan(0)
        expect(tags.every((tag) => tag.includes("disabled"))).toBe(true)
      }
    }
  })

  it("tells the user what Luna is doing at every step", () => {
    const props = { contactName: "Ana Dupont", surname: "dupont", error: null,
      onRefresh: vi.fn(), onOpenForebears: vi.fn(), onClose: vi.fn() }
    const render = (extra: Record<string, unknown>) => renderToString(React.createElement(OriginBottomBar, { ...props, loading: false, ...extra } as never))
    const entry = { surname: "dupont", researchedAt: "2026-09-26T12:00:00Z", origins: [] }

    expect(render({ loading: true, entry: null })).toContain("Step 1 of 3")
    expect(render({ loading: true, entry: null, progress: "Step 2 of 3: the web search found nothing, so Luna is checking Forebears." }))
      .toContain("Step 2 of 3")

    const opened = render({ entry: { ...entry, forebearsFallback: true }, forebearsTab: "opened" })
    expect(opened).toContain("web search did not find")
    expect(opened).toContain("checked Forebears but it listed no countries")
    expect(opened).toContain("opened Forebears in a new tab")

    const unavailable = render({ entry: { ...entry, forebearsUnavailable: true }, forebearsTab: "blocked" })
    expect(unavailable).toContain("could not read Forebears")
    expect(unavailable).toContain("blocked the new Forebears tab")

    expect(render({ entry })).toContain("Try searching Forebears")
  })

  it("shows sourced results in a responsive nonmodal bottom panel", () => {
    const markup = renderToString(React.createElement(OriginBottomBar, {
      contactName: "Ana Dupont", surname: "dupont", loading: false, error: null,
      entry: { surname: "dupont", researchedAt: "2026-09-26T12:00:00Z", origins: [{
        country: "France", explanation: "French surname.",
        sources: [{ title: "Surname history", url: "https://example.org/names/dupont" }],
      }, {
        country: "England", explanation: "English surname usage.",
        sources: [{ title: "English surname record", url: "https://example.org/names/english" }],
      }] },
      onRefresh: vi.fn(), onOpenForebears: vi.fn(), onClose: vi.fn(),
    }))
    expect(markup).toContain("Possible origins")
    expect(markup).toContain("🇫🇷")
    expect(markup).toContain(flagForCountry("England"))
    expect(markup).toContain('href="https://example.org/names/dupont"')
    expect(markup).toContain("Research again")
    expect(markup).toContain("Open Forebears")
    expect(markup).toContain('href="https://forebears.io/surnames/dupont"')
    expect(markup).toContain('aria-label="Luna surname origin for dupont"')
    expect(markup).not.toContain("origin-forebears-attention")
    expect(markup).toContain("max-h-[60dvh]")
    expect(markup).toContain("origin-glass-panel")
    expect(markup).toContain("rounded-2xl")
    expect(markup).toContain("origin-glass-card")
    expect(markup).toContain("md:grid-cols-2")
    expect(markup).toContain('aria-label="Close origin panel"')
    expect(markup).toContain("not evidence of this contact")
  })

  it("shows a clear inconclusive state", () => {
    const markup = renderToString(React.createElement(OriginBottomBar, {
      contactName: "Ana Dupont", surname: "dupont", loading: false, error: null,
      entry: { surname: "dupont", researchedAt: "2026-09-26T12:00:00Z", origins: [] },
      onRefresh: vi.fn(), onOpenForebears: vi.fn(), onClose: vi.fn(),
    }))
    expect(markup).toContain("Origin unclear")
    expect(markup).toContain("Try searching Forebears")
    expect(markup).toContain("origin-forebears-attention")
  })

  it("shows an animated and accessible loading state", () => {
    const markup = renderToString(React.createElement(OriginBottomBar, {
      contactName: "Ana Dupont", surname: "dupont", loading: true, error: null,
      entry: null, onRefresh: vi.fn(), onOpenForebears: vi.fn(), onClose: vi.fn(),
    }))
    expect(markup).toContain('role="status"')
    expect(markup).toContain("Luna is researching this surname…")
    expect(markup).toContain("motion-safe:animate-spin")
  })
})
