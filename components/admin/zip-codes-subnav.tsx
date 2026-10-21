"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"

import { cn } from "@/lib/utils"

export function ZipCodesSubnav({ slug }: { slug: string }) {
  const pathname = usePathname()
  const base = `/c/${slug}/admin/zip-codes`
  const tabs = [
    { href: `${base}/coverage`, label: "Coverage" },
    { href: `${base}/territory`, label: "Territory setup" },
  ]

  return (
    <nav aria-label="ZIP code sections" className="inline-flex rounded-xl bg-muted p-1">
      {tabs.map(({ href, label }) => {
        const active = pathname === href || pathname.startsWith(`${href}/`)
        return (
          <Link key={href} href={href} aria-current={active ? "page" : undefined}
            className={cn("inline-flex min-h-9 items-center whitespace-nowrap rounded-lg px-4 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
              active && "bg-background text-foreground shadow-sm")}>
            {label}
          </Link>
        )
      })}
    </nav>
  )
}
