"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { CheckCircle2, FileUp, RefreshCw, Search } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Skeleton } from "@/components/ui/skeleton"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"
import type { CoverageRange, CoverageState } from "@/lib/zip-coverage"
import { cn } from "@/lib/utils"

type ZipRow = {
  zipcode: string
  city: string
  area: string
  totalPages: number
  ranges: CoverageRange[]
  openPages: number
  availablePages: number
  claimedPages: number
  completedPages: number
}

const STATES: Record<CoverageState, { label: string; bar: string; dot: string }> = {
  open: { label: "Needs an Excel", bar: "bg-amber-300/80 dark:bg-amber-500/60", dot: "bg-amber-400" },
  available: { label: "Ready to claim", bar: "bg-sky-300 dark:bg-sky-700", dot: "bg-sky-400" },
  claimed: { label: "Claimed", bar: "bg-blue-600 dark:bg-blue-500", dot: "bg-blue-600" },
  completed: { label: "Completed", bar: "bg-emerald-500 dark:bg-emerald-600", dot: "bg-emerald-500" },
}

const number = new Intl.NumberFormat()
const pages = (range: Pick<CoverageRange, "pageStart" | "pageEnd">) =>
  range.pageStart === range.pageEnd ? `Page ${range.pageStart}` : `Pages ${range.pageStart}–${range.pageEnd}`

export function ZipCoverage({ slug }: { slug: string }) {
  const [rows, setRows] = useState<ZipRow[] | null>(null)
  const [areas, setAreas] = useState<string[]>([])
  const [error, setError] = useState<string | null>(null)
  const [query, setQuery] = useState("")
  const [view, setView] = useState<"open" | "all">("open")

  const load = useCallback(async () => {
    setError(null)
    try {
      const response = await fetch(`/api/c/${encodeURIComponent(slug)}/admin/zip-coverage`, { cache: "no-store" })
      const result = await response.json()
      if (!response.ok) throw new Error(result.error || "Unable to load ZIP coverage")
      setRows(result.rows)
      setAreas(result.areas)
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Unable to load ZIP coverage")
    }
  }, [slug])

  useEffect(() => { void load() }, [load])

  const groups = useMemo(() => {
    if (!rows) return []
    const term = query.trim().toLocaleLowerCase()
    const visible = rows.filter((row) =>
      (view === "all" || row.openPages > 0 || row.totalPages < 1) &&
      (!term || row.zipcode.includes(term) || row.city.toLocaleLowerCase().includes(term) || row.area.toLocaleLowerCase().includes(term)))
    const order = new Map(areas.map((area, index) => [area.toLocaleLowerCase(), index]))
    const byArea = new Map<string, ZipRow[]>()
    for (const row of visible) byArea.set(row.area, [...(byArea.get(row.area) ?? []), row])
    return [...byArea.entries()]
      .sort(([a], [b]) => (order.get(a.toLocaleLowerCase()) ?? areas.length) - (order.get(b.toLocaleLowerCase()) ?? areas.length))
      .map(([area, zips]) => ({
        area,
        zips: zips.sort((a, b) => view === "open"
          ? b.openPages - a.openPages || a.zipcode.localeCompare(b.zipcode, undefined, { numeric: true })
          : a.city.localeCompare(b.city) || a.zipcode.localeCompare(b.zipcode, undefined, { numeric: true })),
      }))
  }, [areas, query, rows, view])

  if (error) {
    return (
      <Card><CardContent className="flex flex-col items-start gap-3 p-6">
        <p className="text-sm text-destructive">{error}</p>
        <Button variant="outline" onClick={() => { setRows(null); void load() }}><RefreshCw aria-hidden="true" />Try again</Button>
      </CardContent></Card>
    )
  }

  if (!rows) {
    return (
      <div className="space-y-3" aria-busy="true" aria-label="Loading ZIP coverage">
        <Skeleton className="h-20 rounded-xl" />
        {Array.from({ length: 4 }, (_, index) => <Skeleton key={index} className="h-24 rounded-xl" />)}
      </div>
    )
  }

  const openPages = rows.reduce((total, row) => total + row.openPages, 0)
  const openZips = rows.filter((row) => row.openPages > 0).length
  const readyPages = rows.reduce((total, row) => total + row.availablePages, 0)

  return (
    <TooltipProvider delayDuration={150}>
      <div className="space-y-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div className="grid grid-cols-3 divide-x rounded-xl border bg-card">
            {[
              ["Pages needing an Excel", openPages],
              ["ZIP codes affected", openZips],
              ["Pages ready to claim", readyPages],
            ].map(([label, value]) => (
              <div key={label} className="px-4 py-3">
                <p className="text-xs text-muted-foreground">{label}</p>
                <p className="mt-1 text-xl font-bold tabular-nums">{number.format(Number(value))}</p>
              </div>
            ))}
          </div>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
              <Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="ZIP code, city, or area" aria-label="Filter ZIP codes" className="h-11 rounded-xl pl-9 sm:w-64" />
            </div>
            <div className="inline-flex rounded-xl bg-muted p-1" role="group" aria-label="Which ZIP codes to show">
              {([["open", "Needs an Excel"], ["all", "All ZIP codes"]] as const).map(([value, label]) => (
                <button key={value} type="button" aria-pressed={view === value} onClick={() => setView(value)}
                  className={cn("min-h-9 whitespace-nowrap rounded-lg px-3 text-sm font-medium text-muted-foreground transition-colors", view === value && "bg-background text-foreground shadow-sm")}>
                  {label}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground" aria-label="Legend">
          {(Object.keys(STATES) as CoverageState[]).map((state) => (
            <span key={state} className="inline-flex items-center gap-1.5"><span className={cn("h-2.5 w-2.5 rounded-sm", STATES[state].dot)} aria-hidden="true" />{STATES[state].label}</span>
          ))}
        </div>

        {groups.length === 0 ? (
          <Card><CardContent className="flex items-center gap-3 p-6 text-sm text-muted-foreground">
            <CheckCircle2 className="h-5 w-5 text-emerald-500" aria-hidden="true" />
            {view === "open" && !query ? "Every page has an Excel. Nothing to upload right now." : "No ZIP codes match this filter."}
          </CardContent></Card>
        ) : groups.map(({ area, zips }) => (
          <section key={area} aria-label={area} className="space-y-2">
            <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{area}</h2>
            <div className="divide-y rounded-xl border bg-card">
              {zips.map((zip) => (
                <div key={zip.zipcode} className="space-y-3 p-4">
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <p className="text-sm"><span className="font-semibold tabular-nums">{zip.zipcode}</span> <span className="text-muted-foreground">· {zip.city}</span></p>
                    <p className="text-xs tabular-nums text-muted-foreground">
                      {zip.totalPages < 1 ? "No page total yet" : zip.openPages ? `${number.format(zip.openPages)} of ${number.format(zip.totalPages)} pages need an Excel` : `All ${number.format(zip.totalPages)} pages covered`}
                    </p>
                  </div>
                  {zip.totalPages < 1 ? (
                    <p className="text-sm text-muted-foreground">
                      Set this ZIP code&apos;s page total in <Link href={`/c/${slug}/admin/settings`} className="text-primary underline underline-offset-2">Congregation settings</Link> before uploading Excels.
                    </p>
                  ) : (
                    <>
                      <div className="flex h-4 overflow-hidden rounded-md border bg-muted">
                        {zip.ranges.map((range) => (
                          <Tooltip key={range.pageStart}>
                            <TooltipTrigger asChild>
                              <div tabIndex={0} aria-label={`${pages(range)}: ${STATES[range.state].label}`}
                                className={cn("h-full border-r border-background last:border-r-0", STATES[range.state].bar)}
                                style={{ width: `${((range.pageEnd - range.pageStart + 1) / zip.totalPages) * 100}%` }} />
                            </TooltipTrigger>
                            <TooltipContent>{pages(range)} · {STATES[range.state].label}</TooltipContent>
                          </Tooltip>
                        ))}
                      </div>
                      {zip.openPages ? (
                        <div className="flex flex-wrap gap-2">
                          {zip.ranges.filter((range) => range.state === "open").map((range) => (
                            <Button key={range.pageStart} asChild variant="outline" size="sm" className="h-9 rounded-lg border-amber-300 text-amber-800 hover:bg-amber-50 dark:border-amber-800 dark:text-amber-200 dark:hover:bg-amber-950/40">
                              <Link href={`/c/${slug}?uploadZip=${encodeURIComponent(zip.zipcode)}&uploadPages=${range.pageStart}-${range.pageEnd}`}>
                                <FileUp aria-hidden="true" />
                                Upload {pages(range).toLocaleLowerCase()}
                              </Link>
                            </Button>
                          ))}
                        </div>
                      ) : null}
                    </>
                  )}
                </div>
              ))}
            </div>
          </section>
        ))}
      </div>
    </TooltipProvider>
  )
}
