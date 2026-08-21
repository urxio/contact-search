import { describe, expect, it } from "vitest"
import { AuthError, hashPassword, validateMutationOrigin, verifyPassword } from "@/lib/auth"

describe("password credentials", () => {
  it("uses a unique salted scrypt hash and verifies only the right password", async () => {
    const first = await hashPassword("correct horse battery staple")
    const second = await hashPassword("correct horse battery staple")

    expect(first).toMatch(/^scrypt\$/)
    expect(second).not.toBe(first)
    await expect(verifyPassword("correct horse battery staple", first)).resolves.toBe(true)
    await expect(verifyPassword("incorrect password", first)).resolves.toBe(false)
  })

  it("rejects passwords shorter than ten characters", async () => {
    await expect(hashPassword("short"))
      .rejects.toMatchObject({ status: 409, message: "Password must be at least 10 characters" })
  })

  it("treats malformed stored hashes as invalid credentials", async () => {
    await expect(verifyPassword("any password", "not-a-password-hash")).resolves.toBe(false)
  })
})

describe("mutation origin validation", () => {
  it("allows a request whose Origin matches the forwarded host", () => {
    const request = new Request("https://internal.example/api", {
      headers: { origin: "https://search.example", "x-forwarded-host": "search.example" },
    })
    expect(() => validateMutationOrigin(request)).not.toThrow()
  })

  it("rejects missing and cross-origin mutation requests", () => {
    const missing = new Request("https://search.example/api")
    const crossOrigin = new Request("https://search.example/api", {
      headers: { origin: "https://evil.example", host: "search.example" },
    })

    expect(() => validateMutationOrigin(missing)).toThrow(AuthError)
    expect(() => validateMutationOrigin(crossOrigin)).toThrowError("Invalid request origin")
  })
})
