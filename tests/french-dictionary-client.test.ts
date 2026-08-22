import { afterEach, describe, expect, it, vi } from "vitest"

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
  vi.resetModules()
})

describe("browser dictionary loading", () => {
  it("loads the platform dictionary and refreshes it after the short cache expires", async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date("2026-08-22T12:00:00Z"))
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ lines: ["dupont"] }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ lines: ["martin"] }), { status: 200 }))
    vi.stubGlobal("fetch", fetchMock)

    const dictionary = await import("@/utils/french-name-detection")
    await dictionary.loadDictionaryIfNeeded()
    expect(dictionary.isPotentiallyFrench("Jean Dupont")).toBe(true)
    expect(fetchMock).toHaveBeenCalledTimes(1)

    vi.advanceTimersByTime(59_000)
    await dictionary.loadDictionaryIfNeeded()
    expect(fetchMock).toHaveBeenCalledTimes(1)

    vi.advanceTimersByTime(2_000)
    await dictionary.loadDictionaryIfNeeded()
    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(dictionary.isPotentiallyFrench("Jean Dupont")).toBe(false)
    expect(dictionary.isPotentiallyFrench("Jean Martin")).toBe(true)
  })

  it("keeps the last successful dictionary when a refresh temporarily fails", async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date("2026-08-22T12:00:00Z"))
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ lines: ["dupont"] }), { status: 200 }))
      .mockResolvedValueOnce(new Response(null, { status: 503 }))
    vi.stubGlobal("fetch", fetchMock)
    vi.spyOn(console, "warn").mockImplementation(() => undefined)

    const dictionary = await import("@/utils/french-name-detection")
    await dictionary.loadDictionaryIfNeeded()
    vi.advanceTimersByTime(61_000)
    await dictionary.loadDictionaryIfNeeded()

    expect(dictionary.isPotentiallyFrench("Jean Dupont")).toBe(true)
  })
})
