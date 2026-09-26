import { describe, expect, it } from "vitest"
import { flagForCountry } from "@/lib/country-flags"

describe("country flags", () => {
  it("finds flags for country names and common variants", () => {
    expect(flagForCountry("France")).toBe("🇫🇷")
    expect(flagForCountry("Viet Nam")).toBe("🇻🇳")
    expect(flagForCountry("Ivory Coast")).toBe("🇨🇮")
    expect(flagForCountry("United Kingdom")).toBe("🇬🇧")
  })

  it("uses subdivision flags for England, Scotland, and Wales", () => {
    for (const [name, tag] of [["England", "gbeng"], ["Scotland", "gbsct"], ["Wales", "gbwls"]]) {
      const flag = flagForCountry(name)
      expect(flag).not.toBeNull()
      expect([...flag!].map((character) => character.codePointAt(0))).toEqual([
        0x1f3f4, ...[...tag].map((letter) => 0xe0061 + letter.charCodeAt(0) - 97), 0xe007f,
      ])
    }
  })

  it("does not guess a flag for ambiguous or historical names", () => {
    expect(flagForCountry("Congo")).toBeNull()
    expect(flagForCountry("Prussia")).toBeNull()
  })
})
