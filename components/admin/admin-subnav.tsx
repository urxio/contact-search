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
    { href: `${base}/settings`, label: "Settings", icon: Settings },
  ]
  const sections = tabs.map((tab) => tab.href).filter((href) => href !== base)
  // Review queue detail pages (people, tools help) stay under Submissions.
  const isActive = (href: string) => href === base
    ? !sections.some((section) => pathname === section || pathname.startsWith(`${section}/`))
    : pathname === href || pathname.startsWith(`${href}/`)

  return (
    <nav aria-label="Admin sections" className="-mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0">
      <div className="flex min-w-max gap-1 border-b">
        {tabs.map(({ href, label, icon: Icon }) => {
          const active = isActive(href)
          return (
            <Link
              key={href}
              href={href}
              aria-current={active ? "page" : undefined}
              className={cn(
                "-mb-px inline-flex min-h-11 items-center gap-2 border-b-2 px-3 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                active ? "border-blue-500 text-foreground" : "border-transparent text-muted-foreground hover:text-foreground",
              )}
            >
              <Icon className="h-4 w-4" aria-hidden="true" />
              {label}
            </Link>
          )
        })}
      </div>
    </nav>
  )
}
