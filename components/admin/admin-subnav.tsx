"use client"

import { useEffect, useRef, useState } from "react"
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
    { href: `${base}/zip-codes`, label: "ZIP codes", icon: MapPinned },
    { href: `${base}/settings`, label: "Congregation settings", icon: Settings },
  ]
  const sections = tabs.map((tab) => tab.href).filter((href) => href !== base)
  // Review queue detail pages (people, tools help) stay under Submissions.
  const isActive = (href: string) => href === base
    ? !sections.some((section) => pathname === section || pathname.startsWith(`${section}/`))
    : pathname === href || pathname.startsWith(`${href}/`)

  // After a tab is chosen the bar shrinks to icons. Mouse hover, keyboard focus,
  // or a tap (touch has no hover) opens it again.
  const [collapsed, setCollapsed] = useState(false)
  const [hovered, setHovered] = useState(false)
  const [keyboardFocus, setKeyboardFocus] = useState(false)
  const [tapOpen, setTapOpen] = useState(false)
  const pointerType = useRef("mouse")
  const barRef = useRef<HTMLDivElement>(null)
  const compact = collapsed && !hovered && !keyboardFocus && !tapOpen

  useEffect(() => {
    if (!tapOpen) return
    const close = (event: PointerEvent) => {
      if (!barRef.current?.contains(event.target as Node)) setTapOpen(false)
    }
    document.addEventListener("pointerdown", close)
    return () => document.removeEventListener("pointerdown", close)
  }, [tapOpen])

  return (
    <nav aria-label="Admin sections">
      <div
        ref={barRef}
        onPointerDown={(event) => { pointerType.current = event.pointerType }}
        onPointerEnter={(event) => { if (event.pointerType === "mouse") setHovered(true) }}
        onPointerLeave={(event) => { if (event.pointerType === "mouse") setHovered(false) }}
        onFocus={(event) => { if (event.target.matches(":focus-visible")) setKeyboardFocus(true) }}
        onBlur={(event) => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setKeyboardFocus(false) }}
        className={cn(
          "gap-1 rounded-xl border bg-muted/60 p-1",
          compact ? "inline-flex max-w-full" : "grid grid-cols-2 sm:grid-cols-4",
        )}
      >
        {tabs.map(({ href, label, icon: Icon }) => {
          const active = isActive(href)
          const iconOnly = compact && !active
          return (
            <Link
              key={href}
              href={href}
              title={iconOnly ? label : undefined}
              aria-current={active ? "page" : undefined}
              onClick={(event) => {
                // On touch, the first tap on the small bar only opens it.
                if (compact && pointerType.current !== "mouse") {
                  event.preventDefault()
                  setTapOpen(true)
                  return
                }
                setCollapsed(true)
                setHovered(false)
                setTapOpen(false)
              }}
              className={cn(
                "inline-flex min-h-10 items-center justify-center rounded-lg py-1.5 text-center text-sm font-medium leading-tight transition-all duration-200 ease-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                iconOnly ? "w-10 shrink-0 gap-0 px-0" : "gap-2 px-2 sm:px-4",
                compact && active && "px-3 sm:px-3",
                active
                  ? "bg-background text-foreground shadow-sm ring-1 ring-border"
                  : "text-muted-foreground hover:bg-background/60 hover:text-foreground",
              )}
            >
              <Icon className={cn("h-4 w-4 shrink-0", active && "text-blue-600 dark:text-blue-400")} aria-hidden="true" />
              <span
                className={cn(
                  "overflow-hidden transition-[max-width,opacity] duration-200 ease-out",
                  iconOnly ? "max-w-0 opacity-0" : "max-w-[14rem] opacity-100",
                  compact && "whitespace-nowrap",
                )}
              >
                {label}
              </span>
            </Link>
          )
        })}
      </div>
    </nav>
  )
}
