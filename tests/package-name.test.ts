import { describe, expect, it } from "vitest"

import { packageNameForSegment } from "@/lib/package-name"

describe("packageNameForSegment", () => {
  it("uses the ZIP, city, and selected page range", () => {
    expect(packageNameForSegment("22314", "Alexandria", "541", "582"))
      .toBe("22314 - Alexandria - 541-582")
  })

  it("waits until the complete segment has been selected", () => {
    expect(packageNameForSegment("22314", "Alexandria", "541", "")).toBe("")
  })
})
