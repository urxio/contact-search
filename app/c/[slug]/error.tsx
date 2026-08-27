"use client"

import { useEffect } from "react"
import { AlertCircle, RefreshCw } from "lucide-react"

import { Button } from "@/components/ui/button"
import { chunkReloadStorageKey, isChunkLoadError } from "@/lib/chunk-load-recovery"

const AUTO_RELOAD_COOLDOWN_MS = 60_000

export default function CongregationError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const chunkError = isChunkLoadError(error)

  useEffect(() => {
    if (!chunkError) return
    const key = chunkReloadStorageKey(window.location.pathname)
    const lastReload = Number(window.sessionStorage.getItem(key) ?? 0)
    if (Date.now() - lastReload < AUTO_RELOAD_COOLDOWN_MS) return
    window.sessionStorage.setItem(key, String(Date.now()))
    window.location.reload()
  }, [chunkError])

  function retry() {
    if (chunkError) window.location.reload()
    else reset()
  }

  return (
    <main className="admin-shell flex min-h-screen items-center justify-center px-4">
      <section className="admin-material w-full max-w-md rounded-2xl p-6 text-center">
        <div className="admin-icon-well mx-auto flex h-12 w-12 items-center justify-center rounded-xl text-primary">
          <AlertCircle className="h-6 w-6" aria-hidden="true" />
        </div>
        <h1 className="mt-4 text-2xl font-bold leading-tight">Name Search did not finish loading</h1>
        <p className="mt-2 text-sm font-normal leading-relaxed text-muted-foreground">
          {chunkError
            ? "A new version of Name Search is available. Your saved work is safe; reload to open the latest version."
            : "Your saved work is safe. Retry the connection to reopen this congregation workspace."}
        </p>
        <Button onClick={retry} className="admin-primary-button mt-6 min-h-11 w-full rounded-xl">
          <RefreshCw aria-hidden="true" />
          {chunkError ? "Reload latest version" : "Try again"}
        </Button>
      </section>
    </main>
  )
}
