"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"

export default function AdminLoginPage() {
  const [password, setPassword] = useState("")
  const [error, setError] = useState("")
  const [loading, setLoading] = useState(false)
  const router = useRouter()

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError("")

    const res = await fetch("/api/admin/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password }),
    })

    if (res.ok) {
      router.push("/admin")
    } else {
      setError("Incorrect password.")
    }
    setLoading(false)
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-muted/30 px-4">
      <div className="w-full max-w-sm rounded-lg border bg-card p-6 shadow-sm">
        <h1 className="text-2xl font-bold leading-tight">Admin</h1>
        <p className="mb-6 mt-1 text-sm leading-relaxed text-muted-foreground">Sign in to review submissions.</p>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <label htmlFor="admin-password" className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Password
          </label>
          <input
            id="admin-password"
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="h-10 rounded-md border bg-background px-3 text-sm outline-none transition-shadow focus-visible:ring-2 focus-visible:ring-ring"
            required
          />
          {error && <p className="text-sm text-destructive" role="alert">{error}</p>}
          <button
            type="submit"
            disabled={loading}
            className="h-10 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground transition-colors duration-150 ease-out hover:bg-primary/90 disabled:opacity-50"
          >
            {loading ? "Signing in…" : "Sign in"}
          </button>
        </form>
      </div>
    </div>
  )
}
