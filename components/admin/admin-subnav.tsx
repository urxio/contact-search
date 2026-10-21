"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { BarChart3, Inbox, MapPinned, Settings } from "lucide-react"

import { cn } from "@/lib/utils"

export function AdminSubnav({ slug }: { slug: string }) {
  const pathname = usePathname()
  const base = `/c/${slug}/admin`
  const tabs = [
    { href: `${base}/stats`, label: "Statistics", icon: BarChart3 },
    { href: base, label: "Submissions", icon: Inbox },
    { href: `${base}/zip-coverage`, label: "ZIP coverage", icon: MapPinned },
    { href: `${base}/settings`, label: "Congregation settings", icon: Settings },
  ]
  const sections = tabs.map((tab) => tab.href).filter((href) => href !== base)
  // Review queue detail pages (people, tools help) stay under Submissions.
  const isActive = (href: string) => href === base
    ? !sections.some((section) => pathname === section || pathname.startsWith(`${section}/`))
    : pathname === href || pathname.startsWith(`${href}/`)

  return (
    <nav aria-label="Admin sections">
      <div className="grid grid-cols-2 gap-1 rounded-xl border bg-muted/60 p-1 sm:grid-cols-4">
        {tabs.map(({ href, label, icon: Icon }) => {
          const active = isActive(href)
          return (
            <Link
              key={href}
              href={href}
              aria-current={active ? "page" : undefined}
              className={cn(
                "inline-flex min-h-10 items-center justify-center gap-2 rounded-lg px-2 py-1.5 text-center text-sm leading-tight sm:px-4 font-medium transition-all duration-150 ease-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                active
                  ? "bg-background text-foreground shadow-sm ring-1 ring-border"
                  : "text-muted-foreground hover:bg-background/60 hover:text-foreground",
              )}
            >
              <Icon className={cn("h-4 w-4 shrink-0", active && "text-blue-600 dark:text-blue-400")} aria-hidden="true" />
              {label}
            </Link>
          )
        })}
      </div>
    </nav>
  )
}
