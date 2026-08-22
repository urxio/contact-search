import { Loader2 } from "lucide-react"

export default function CongregationLoading() {
  return (
    <main className="admin-shell flex min-h-screen items-center justify-center px-4">
      <div className="flex items-center gap-3 rounded-2xl border bg-background px-5 py-4 text-sm text-muted-foreground shadow-sm" role="status">
        <Loader2 className="h-5 w-5 animate-spin text-primary" aria-hidden="true" />
        Loading Name Search…
      </div>
    </main>
  )
}
