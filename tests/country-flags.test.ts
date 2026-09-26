import { describe, expect, it } from "vitest"
import { flagForCountry } from "@/lib/country-flags"

describe("country flags", () => {
  it("finds flags for country names and common variants", () => {
    expect(flagForCountry("France")).toBe("🇫🇷")
    expect(flagForCountry("Viet Nam")).toBe("🇻🇳")
    expect(flagForCountry("Ivory Coast")).toBe("🇨🇮")
  })

  it("does not guess a flag for ambiguous or historical names", () => {
    expect(flagForCountry("Congo")).toBeNull()
    expect(flagForCountry("Prussia")).toBeNull()
  })
})
