"use client"

import { FormEvent, useState } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { LockKeyhole } from "lucide-react"
import { ThemeSwitcher } from "@/components/theme-switcher"

export default function SignInPage() {
  const router = useRouter(); const search = useSearchParams()
  const [email,setEmail]=useState(""); const [password,setPassword]=useState(""); const [error,setError]=useState(""); const [busy,setBusy]=useState(false)
  async function submit(event:FormEvent){event.preventDefault();setBusy(true);setError("");const response=await fetch("/api/auth/sign-in",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({email,password})});const data=await response.json();if(response.ok)router.replace(search.get("next")||"/workspaces");else setError(data.error||"Unable to sign in");setBusy(false)}
  return <main className="admin-shell relative flex min-h-screen items-center justify-center px-4">
    <ThemeSwitcher className="admin-material absolute right-4 top-4" />
    <section className="admin-material w-full max-w-sm rounded-3xl p-8" aria-labelledby="signin-title">
      <div className="admin-icon-well mb-6 flex h-12 w-12 items-center justify-center rounded-2xl text-primary"><LockKeyhole className="h-5 w-5" aria-hidden /></div>
      <h1 id="signin-title" className="text-2xl font-bold tracking-tight">Welcome back</h1><p className="mb-6 mt-1 text-sm text-muted-foreground">Sign in to Search Helper.</p>
      <form onSubmit={submit} className="space-y-4">
        <label className="block text-sm font-medium" htmlFor="email">Email</label><input id="email" type="email" autoComplete="email" className="admin-field h-11 w-full rounded-xl px-4 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring" value={email} onChange={e=>setEmail(e.target.value)} required />
        <label className="block text-sm font-medium" htmlFor="password">Password</label><input id="password" type="password" autoComplete="current-password" className="admin-field h-11 w-full rounded-xl px-4 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring" value={password} onChange={e=>setPassword(e.target.value)} required />
        {error&&<p className="text-sm text-destructive" role="alert">{error}</p>}
        <button disabled={busy} className="admin-primary-button h-11 w-full rounded-xl px-4 text-sm font-medium text-white disabled:opacity-50">{busy?"Signing in…":"Sign in"}</button>
      </form><p className="mt-5 text-center text-xs text-muted-foreground">Need a reset link? Ask a congregation administrator.</p>
    </section>
  </main>
}
