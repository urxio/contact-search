import Link from "next/link"
import { Database, LayoutGrid, ShieldCheck } from "lucide-react"

import { ThemeSwitcher } from "@/components/theme-switcher"

export function PlatformHeader() {
  return (
    <header className="sticky top-0 z-40 border-b bg-background/90 backdrop-blur-xl supports-[backdrop-filter]:bg-background/75">
      <div className="mx-auto flex h-16 max-w-6xl items-center gap-4 px-4 sm:px-6">
        <Link href="/platform" className="flex min-h-11 items-center gap-3 rounded-xl px-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
          <span className="admin-icon-well flex h-9 w-9 items-center justify-center rounded-xl text-primary">
            <ShieldCheck className="h-4 w-4" aria-hidden="true" />
          </span>
          <span className="hidden text-sm font-semibold sm:inline">Platform administration</span>
        </Link>
        <nav aria-label="Platform" className="ml-auto flex items-center gap-1">
          <Link href="/platform" className="inline-flex min-h-11 items-center gap-2 rounded-xl px-3 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
            <LayoutGrid className="h-4 w-4" aria-hidden="true" />
            <span className="hidden sm:inline">Congregations</span>
          </Link>
          <Link href="/platform/dictionary" className="inline-flex min-h-11 items-center gap-2 rounded-xl px-3 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
            <Database className="h-4 w-4" aria-hidden="true" />
            <span className="hidden sm:inline">Dictionary</span>
          </Link>
          <ThemeSwitcher className="h-11 w-11 rounded-xl shadow-none hover:translate-y-0 hover:bg-muted" />
        </nav>
      </div>
    </header>
  )
}
