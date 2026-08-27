import { describe, expect, it } from "vitest"
import { areaColorClass } from "@/lib/area-colors"

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

})
