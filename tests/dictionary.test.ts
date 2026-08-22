import { describe, expect, it } from "vitest"

import { normalizeDictionaryNames } from "@/lib/dictionary"

describe("platform dictionary normalization", () => {
  it("normalizes, validates, sorts, and deduplicates surname entries", () => {
    expect(normalizeDictionaryNames([
      " Clémence ",
      "clemence",
      "O'Neil",
      "saint   pierre",
      "bad123",
      "",
    ])).toEqual(["clemence", "o'neil", "saint pierre"])
  })

  it("removes the malformed legacy viewer placeholder", () => {
    expect(normalizeDictionaryNames([
      "... (file truncated in this viewer for brevity)",
      "Dupont",
    ])).toEqual(["dupont"])
  })
})
