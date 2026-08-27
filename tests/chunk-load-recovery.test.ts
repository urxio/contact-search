import { describe, expect, it } from "vitest"

import { chunkReloadStorageKey, isChunkLoadError } from "@/lib/chunk-load-recovery"

describe("chunk load recovery", () => {
  it.each([
    { name: "ChunkLoadError", message: "Loading chunk 6775 failed." },
    { name: "TypeError", message: "Failed to fetch dynamically imported module" },
    { name: "Error", message: "Importing a module script failed." },
  ])("recognizes deploy-related chunk failures", (error) => {
    expect(isChunkLoadError(error)).toBe(true)
  })

  it("does not classify normal page errors as chunk failures", () => {
    expect(isChunkLoadError({ name: "Error", message: "Settings request failed" })).toBe(false)
  })

  it("scopes the reload guard to the current path", () => {
    expect(chunkReloadStorageKey("/c/central/congregation-settings"))
      .toBe("name-search:chunk-reload:/c/central/congregation-settings")
  })
})
