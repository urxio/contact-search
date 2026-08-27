import { describe, expect, it } from "vitest"
import { areaCardColorClass, areaCardColorStyle, areaCardPickerValue, areaColorClass } from "@/lib/area-colors"

describe("areaColorClass", () => {
  const areas = ["Central", "East", "West"]

  it("assigns a stable color for each configured area", () => {
    expect(areaColorClass("Central", areas)).toContain("sky")
    expect(areaColorClass("East", areas)).toContain("violet")
    expect(areaColorClass("West", areas)).toContain("emerald")
  })

  it("does not color ZIP codes without a configured area", () => {
    expect(areaColorClass(undefined, areas)).toBe("")
    expect(areaColorClass("Unknown", areas)).toBe("")
  })

  it("uses matching stable accents for area cards", () => {
    expect(areaCardColorClass("Central", areas)).toContain("sky")
    expect(areaCardColorClass("East", areas)).toContain("violet")
    expect(areaCardColorClass("Unknown", areas)).toContain("border-border")
  })

  it("uses an explicitly selected hex color as the card fill", () => {
    expect(areaCardColorClass("Central", areas, "#ef4444")).toBe("")
    expect(areaCardColorStyle("#ef4444")).toEqual({ backgroundColor: "#ef4444", borderColor: "#ef4444" })
    expect(areaCardPickerValue("rose")).toBe("#f43f5e")
  })
})
