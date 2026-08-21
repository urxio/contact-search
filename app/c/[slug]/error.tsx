"use client"

import { AlertCircle, RefreshCw } from "lucide-react"

import { Button } from "@/components/ui/button"

export default function CongregationError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <main className="admin-shell flex min-h-screen items-center justify-center px-4">
      <section className="admin-material w-full max-w-md rounded-2xl p-6 text-center">
        <div className="admin-icon-well mx-auto flex h-12 w-12 items-center justify-center rounded-xl text-primary">
          <AlertCircle className="h-6 w-6" aria-hidden="true" />
        </div>
        <h1 className="mt-4 text-2xl font-bold leading-tight">Search Helper did not finish loading</h1>
        <p className="mt-2 text-sm font-normal leading-relaxed text-muted-foreground">
          Your saved work is safe. Retry the connection to reopen this congregation workspace.
        </p>
        <Button onClick={reset} className="admin-primary-button mt-6 min-h-11 w-full rounded-xl">
          <RefreshCw aria-hidden="true" />
          Try again
        </Button>
      </section>
    </main>
  )
}
