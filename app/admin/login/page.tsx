"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { LockKeyhole } from "lucide-react"

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
    <div className="admin-shell flex min-h-screen items-center justify-center px-4">
      <div className="admin-material w-full max-w-sm rounded-3xl p-8">
        <div className="admin-icon-well mb-6 flex h-12 w-12 items-center justify-center rounded-2xl text-primary">
          <LockKeyhole className="h-5 w-5" aria-hidden="true" />
        </div>
        <h1 className="text-2xl font-bold leading-tight tracking-tight">Welcome back</h1>
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
            className="h-11 rounded-xl border border-white/70 bg-background/75 px-4 text-sm shadow-inner outline-none backdrop-blur transition-all duration-150 ease-out focus-visible:ring-2 focus-visible:ring-ring dark:border-white/10"
            required
          />
          {error && <p className="text-sm text-destructive" role="alert">{error}</p>}
          <button
            type="submit"
            disabled={loading}
            className="admin-primary-button h-11 rounded-xl px-4 text-sm font-medium text-primary-foreground transition-all duration-150 ease-out disabled:opacity-50"
          >
            {loading ? "Signing in…" : "Sign in"}
          </button>
        </form>
      </div>
    </div>
  )
}
