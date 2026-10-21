"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import Link from "next/link"
import { CheckCircle2, ChevronRight, FileSpreadsheet, FileUp, Minus, Plus, RefreshCw, Search, Share2, UserRound } from "lucide-react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Skeleton } from "@/components/ui/skeleton"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"
import { ExcelColumnsError, readContactsExcel } from "@/lib/contacts-excel"
import { packageNameForSegment } from "@/lib/package-name"
import {
  DEFAULT_UPLOAD_BATCH_PAGES, MAX_UPLOAD_BATCH_PAGES, MIN_UPLOAD_BATCH_PAGES, uploadBatches,
  type CoverageRange, type CoverageState,
} from "@/lib/zip-coverage"
import type { BaseContact } from "@/types/contact"
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

type UploadTarget = { zipcode: string; city: string; totalPages: number; pageStart: number; pageEnd: number }
type PendingUpload = UploadTarget & { filename: string; contacts: BaseContact[] }

const STATES: Record<CoverageState, { label: string; bar: string; dot: string }> = {
  open: { label: "Needs an Excel", bar: "bg-amber-300/80 dark:bg-amber-500/60", dot: "bg-amber-400" },
  available: { label: "Ready to claim", bar: "bg-sky-300 dark:bg-sky-700", dot: "bg-sky-400" },
  claimed: { label: "Claimed", bar: "bg-blue-600 dark:bg-blue-500", dot: "bg-blue-600" },
  completed: { label: "Completed", bar: "bg-emerald-500 dark:bg-emerald-600", dot: "bg-emerald-500" },
}

const number = new Intl.NumberFormat()
const pages = (range: Pick<CoverageRange, "pageStart" | "pageEnd">) =>
  range.pageStart === range.pageEnd ? `Page ${range.pageStart}` : `Pages ${range.pageStart}–${range.pageEnd}`
const areaKey = (slug: string) => `zip-coverage-areas:${slug}`

/** One square per batch-aligned block of pages; a block with any open page shows as open. */
function batchCells(zip: ZipRow, batchPages: number) {
  const cells: { pageStart: number; pageEnd: number; state: CoverageState; upload: { pageStart: number; pageEnd: number } | null }[] = []
  for (let start = 1; start <= zip.totalPages; start += batchPages) {
    const end = Math.min(zip.totalPages, start + batchPages - 1)
    const inBlock = zip.ranges.filter((range) => range.pageEnd >= start && range.pageStart <= end)
    const open = inBlock.find((range) => range.state === "open")
    cells.push({
      pageStart: start, pageEnd: end, state: open ? "open" : inBlock[0]?.state ?? "open",
      upload: open ? { pageStart: Math.max(open.pageStart, start), pageEnd: Math.min(open.pageEnd, end) } : null,
    })
  }
  return cells
}

export function ZipCoverage({ slug }: { slug: string }) {
  const [rows, setRows] = useState<ZipRow[] | null>(null)
  const [areas, setAreas] = useState<string[]>([])
  const [error, setError] = useState<string | null>(null)
  const [query, setQuery] = useState("")
  const [view, setView] = useState<"open" | "all">("open")
  const [selectedAreas, setSelectedAreas] = useState<string[]>([])
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const [batchPages, setBatchPages] = useState(DEFAULT_UPLOAD_BATCH_PAGES)
  const [batchSave, setBatchSave] = useState<"idle" | "saving" | "saved" | "error">("idle")
  const saveTimer = useRef<ReturnType<typeof setTimeout>>()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const uploadTarget = useRef<UploadTarget | null>(null)
  const [reading, setReading] = useState(false)
  const [pendingUpload, setPendingUpload] = useState<PendingUpload | null>(null)

  const load = useCallback(async () => {
    setError(null)
    try {
      const response = await fetch(`/api/c/${encodeURIComponent(slug)}/admin/zip-coverage`, { cache: "no-store" })
      const result = await response.json()
      if (!response.ok) throw new Error(result.error || "Unable to load ZIP coverage")
      setRows(result.rows)
      setAreas(result.areas)
      setBatchPages(result.batchPages)
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Unable to load ZIP coverage")
    }
  }, [slug])

  useEffect(() => { void load() }, [load])
  useEffect(() => () => clearTimeout(saveTimer.current), [])
  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(areaKey(slug)) ?? "[]")
      if (Array.isArray(saved)) setSelectedAreas(saved.map(String))
    } catch { /* No saved areas */ }
  }, [slug])

  const chooseAreas = (next: string[]) => {
    setSelectedAreas(next)
    try { localStorage.setItem(areaKey(slug), JSON.stringify(next)) } catch { /* Not remembered */ }
  }

  // Steps apply instantly; the congregation setting is saved once clicking pauses.
  const changeBatchPages = (delta: number) => {
    const next = Math.min(MAX_UPLOAD_BATCH_PAGES, Math.max(MIN_UPLOAD_BATCH_PAGES, batchPages + delta))
    if (next === batchPages) return
    setBatchPages(next)
    setBatchSave("saving")
    clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(async () => {
      try {
        const response = await fetch(`/api/c/${encodeURIComponent(slug)}/settings`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ uploadBatchPages: next }),
        })
        setBatchSave(response.ok ? "saved" : "error")
      } catch {
        setBatchSave("error")
      }
    }, 600)
  }

  const startUpload = (zip: ZipRow, range: { pageStart: number; pageEnd: number }) => {
    uploadTarget.current = { zipcode: zip.zipcode, city: zip.city, totalPages: zip.totalPages, ...range }
    fileInputRef.current?.click()
  }

  const handleFile = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    event.target.value = ""
    const target = uploadTarget.current
    if (!file || !target) return
    setReading(true)
    try {
      setPendingUpload({ ...target, filename: file.name, contacts: await readContactsExcel(file) })
    } catch (readError) {
      toast.error(readError instanceof ExcelColumnsError ? "Invalid file format" : "Unable to read this Excel", {
        description: readError instanceof Error ? readError.message : undefined,
        duration: 8000,
      })
    } finally {
      setReading(false)
    }
  }

  const allAreas = useMemo(() => {
    if (!rows) return []
    const present = new Set(rows.map((row) => row.area))
    return [...areas.filter((area) => present.has(area)), ...[...present].filter((area) => !areas.includes(area))]
  }, [areas, rows])
  const activeAreas = selectedAreas.filter((area) => allAreas.includes(area))

  const groups = useMemo(() => {
    if (!rows) return []
    const term = query.trim().toLocaleLowerCase()
    const visible = rows.filter((row) =>
      (activeAreas.length === 0 || activeAreas.includes(row.area)) &&
      (view === "all" || row.openPages > 0 || row.totalPages < 1) &&
      (!term || row.zipcode.includes(term) || row.city.toLocaleLowerCase().includes(term) || row.area.toLocaleLowerCase().includes(term)))
    return allAreas
      .map((area) => ({
        area,
        zips: visible.filter((row) => row.area === area).sort((a, b) => view === "open"
          ? b.openPages - a.openPages || a.zipcode.localeCompare(b.zipcode, undefined, { numeric: true })
          : a.city.localeCompare(b.city) || a.zipcode.localeCompare(b.zipcode, undefined, { numeric: true })),
      }))
      .filter((group) => group.zips.length > 0)
  }, [activeAreas, allAreas, query, rows, view])

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
        {Array.from({ length: 4 }, (_, index) => <Skeleton key={index} className="h-14 rounded-xl" />)}
      </div>
    )
  }

  const inScope = rows.filter((row) => activeAreas.length === 0 || activeAreas.includes(row.area))
  const openPages = inScope.reduce((total, row) => total + row.openPages, 0)
  const openZips = inScope.filter((row) => row.openPages > 0).length
  const readyPages = inScope.reduce((total, row) => total + row.availablePages, 0)

  return (
    <TooltipProvider delayDuration={150}>
      <input ref={fileInputRef} type="file" accept=".xlsx,.xls" className="hidden" onChange={handleFile} />
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

        {allAreas.length > 1 ? (
          <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Areas to show">
            <span className="mr-1 text-sm text-muted-foreground">Areas</span>
            {[null, ...allAreas].map((area) => {
              const on = area === null ? activeAreas.length === 0 : activeAreas.includes(area)
              return (
                <button key={area ?? "all"} type="button" aria-pressed={on}
                  onClick={() => chooseAreas(area === null ? [] : on ? activeAreas.filter((item) => item !== area) : [...activeAreas, area])}
                  className={cn("min-h-8 rounded-full border px-3 text-sm transition-colors",
                    on ? "border-primary/40 bg-primary/10 font-medium text-primary" : "text-muted-foreground hover:bg-muted hover:text-foreground")}>
                  {area ?? "All"}
                </button>
              )
            })}
          </div>
        ) : null}

        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground" aria-label="Legend">
            {(Object.keys(STATES) as CoverageState[]).map((state) => (
              <span key={state} className="inline-flex items-center gap-1.5"><span className={cn("h-2.5 w-2.5 rounded-sm", STATES[state].dot)} aria-hidden="true" />{STATES[state].label}</span>
            ))}
          </div>
          <div className="flex items-center gap-2 text-sm">
            <span className="text-muted-foreground">Pages per upload</span>
            <div className="inline-flex items-center rounded-xl border bg-card">
              <Button variant="ghost" size="icon" className="h-9 w-9 rounded-l-xl rounded-r-none" aria-label="Fewer pages per upload"
                onClick={() => changeBatchPages(-1)} disabled={batchPages <= MIN_UPLOAD_BATCH_PAGES}><Minus aria-hidden="true" /></Button>
              <span className="min-w-8 text-center font-semibold tabular-nums" aria-live="polite">{batchPages}</span>
              <Button variant="ghost" size="icon" className="h-9 w-9 rounded-l-none rounded-r-xl" aria-label="More pages per upload"
                onClick={() => changeBatchPages(1)} disabled={batchPages >= MAX_UPLOAD_BATCH_PAGES}><Plus aria-hidden="true" /></Button>
            </div>
            <span className={cn("w-16 text-xs text-muted-foreground", batchSave === "error" && "text-destructive")} aria-live="polite">
              {batchSave === "saving" ? "Saving…" : batchSave === "saved" ? "Saved" : batchSave === "error" ? "Not saved" : ""}
            </span>
          </div>
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
              {zips.map((zip) => {
                const batches = uploadBatches(zip.ranges, batchPages)
                const next = batches[0]
                const isOpen = expanded.has(zip.zipcode)
                const toggle = () => setExpanded((current) => {
                  const updated = new Set(current)
                  if (updated.has(zip.zipcode)) updated.delete(zip.zipcode)
                  else updated.add(zip.zipcode)
                  return updated
                })
                return (
                  <div key={zip.zipcode} className="px-4 py-3">
                    <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
                      <button type="button" onClick={toggle} aria-expanded={isOpen} disabled={zip.totalPages < 1}
                        className="flex min-h-9 min-w-0 flex-1 items-center gap-3 rounded-lg text-left disabled:cursor-default sm:min-w-[22rem]">
                        <ChevronRight className={cn("h-4 w-4 shrink-0 text-muted-foreground transition-transform", isOpen && "rotate-90", zip.totalPages < 1 && "invisible")} aria-hidden="true" />
                        <span className="w-40 shrink-0 truncate text-sm"><span className="font-semibold tabular-nums">{zip.zipcode}</span> <span className="text-muted-foreground">· {zip.city}</span></span>
                        {zip.totalPages < 1 ? null : (
                          <span className="flex h-2.5 min-w-16 flex-1 overflow-hidden rounded-full bg-muted" aria-hidden="true">
                            {zip.ranges.map((range) => (
                              <span key={range.pageStart} className={cn("h-full", STATES[range.state].bar)}
                                style={{ width: `${((range.pageEnd - range.pageStart + 1) / zip.totalPages) * 100}%` }} />
                            ))}
                          </span>
                        )}
                        <span className="hidden shrink-0 text-xs tabular-nums text-muted-foreground md:inline">
                          {zip.totalPages < 1 ? "No page total yet" : zip.openPages
                            ? `${number.format(zip.openPages)} of ${number.format(zip.totalPages)} pages need an Excel`
                            : `All ${number.format(zip.totalPages)} pages covered`}
                        </span>
                      </button>
                      {zip.totalPages < 1 ? (
                        <p className="text-sm text-muted-foreground">
                          Set the page total in <Link href={`/c/${slug}/admin/settings`} className="text-primary underline underline-offset-2">Settings</Link>
                        </p>
                      ) : next ? (
                        <Button variant="outline" size="sm" disabled={reading} onClick={() => startUpload(zip, next)}
                          className="h-9 shrink-0 rounded-lg border-amber-300 bg-amber-50 text-amber-800 hover:bg-amber-100 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-200 dark:hover:bg-amber-950/60">
                          <FileUp aria-hidden="true" />
                          Upload next {pages(next).toLocaleLowerCase()}
                        </Button>
                      ) : null}
                    </div>
                    {isOpen && zip.totalPages > 0 ? (
                      <div className="mt-3 space-y-2 pl-7">
                        <div className="grid grid-cols-[repeat(auto-fill,minmax(1.25rem,1fr))] gap-1">
                          {batchCells(zip, batchPages).map((cell) => (
                            <Tooltip key={cell.pageStart}>
                              <TooltipTrigger asChild>
                                <button type="button" disabled={!cell.upload || reading}
                                  onClick={() => cell.upload && startUpload(zip, cell.upload)}
                                  aria-label={`${pages(cell)}: ${STATES[cell.state].label}${cell.upload ? ". Upload an Excel" : ""}`}
                                  className={cn("h-5 rounded-[3px] disabled:cursor-default", STATES[cell.state].bar,
                                    cell.upload && "hover:ring-2 hover:ring-amber-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring")} />
                              </TooltipTrigger>
                              <TooltipContent>
                                {cell.upload ? `Upload ${pages(cell.upload).toLocaleLowerCase()}` : `${pages(cell)} · ${STATES[cell.state].label}`}
                              </TooltipContent>
                            </Tooltip>
                          ))}
                        </div>
                        <p className="text-xs text-muted-foreground">
                          Each square is {batchPages} {batchPages === 1 ? "page" : "pages"}. Click an amber square to upload its Excel.
                          {batches.length ? ` ${number.format(batches.length)} ${batches.length === 1 ? "batch" : "batches"} left.` : ""}
                        </p>
                      </div>
                    ) : null}
                  </div>
                )
              })}
            </div>
          </section>
        ))}
      </div>
      <UploadDialog slug={slug} upload={pendingUpload} onClose={() => setPendingUpload(null)} onUploaded={() => { setPendingUpload(null); void load() }} />
    </TooltipProvider>
  )
}

function UploadDialog({ slug, upload, onClose, onUploaded }: {
  slug: string
  upload: PendingUpload | null
  onClose: () => void
  onUploaded: () => void
}) {
  const [pageStart, setPageStart] = useState("")
  const [pageEnd, setPageEnd] = useState("")
  const [saving, setSaving] = useState<"shared" | "private" | null>(null)

  useEffect(() => {
    if (!upload) return
    setPageStart(String(upload.pageStart))
    setPageEnd(String(upload.pageEnd))
  }, [upload])

  const save = async (visibility: "shared" | "private") => {
    if (!upload) return
    const start = Number(pageStart)
    const end = Number(pageEnd)
    if (!Number.isInteger(start) || !Number.isInteger(end) || start < 1 || end < start || end > upload.totalPages) {
      toast.error(`Enter a page range between 1 and ${number.format(upload.totalPages)}.`)
      return
    }
    setSaving(visibility)
    try {
      const response = await fetch(`/api/c/${encodeURIComponent(slug)}/packages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: packageNameForSegment(upload.zipcode, upload.city, String(start), String(end)),
          visibility,
          originalFilename: upload.filename,
          contacts: upload.contacts,
          zipcode: upload.zipcode,
          pageStart: start,
          pageEnd: end,
          startNow: false,
        }),
      })
      const result = await response.json()
      if (!response.ok) throw new Error(result.error || "Unable to save Excel")
      toast.success(visibility === "shared" ? "Excel shared with the congregation." : "Excel saved to Your Excels.")
      onUploaded()
    } catch (saveError) {
      toast.error(saveError instanceof Error ? saveError.message : "Unable to save Excel")
    } finally {
      setSaving(null)
    }
  }

  return (
    <Dialog open={Boolean(upload)} onOpenChange={(open) => { if (!open && !saving) onClose() }}>
      <DialogContent className="rounded-2xl sm:max-w-md">
        <DialogHeader className="text-left">
          <div className="mb-2 flex h-11 w-11 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <FileSpreadsheet className="h-5 w-5" aria-hidden="true" />
          </div>
          <DialogTitle className="text-base font-semibold">Upload Excel for {upload?.zipcode} · {upload?.city}</DialogTitle>
          <DialogDescription className="text-sm leading-relaxed">
            {upload ? `${upload.filename} has ${number.format(upload.contacts.length)} contacts.` : null}
          </DialogDescription>
        </DialogHeader>
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2"><Label htmlFor="coverage-page-start">Start page</Label>
            <Input id="coverage-page-start" type="number" min={1} max={upload?.totalPages} value={pageStart} onChange={(event) => setPageStart(event.target.value)} className="h-11 rounded-xl" /></div>
          <div className="space-y-2"><Label htmlFor="coverage-page-end">End page</Label>
            <Input id="coverage-page-end" type="number" min={1} max={upload?.totalPages} value={pageEnd} onChange={(event) => setPageEnd(event.target.value)} className="h-11 rounded-xl" /></div>
        </div>
        <DialogFooter className="gap-2 sm:gap-2">
          <Button variant="outline" className="rounded-xl" disabled={Boolean(saving)} onClick={() => save("private")}>
            <UserRound aria-hidden="true" />{saving === "private" ? "Saving…" : "Save in Your Excels"}
          </Button>
          <Button className="rounded-xl" disabled={Boolean(saving)} onClick={() => save("shared")}>
            <Share2 aria-hidden="true" />{saving === "shared" ? "Sharing…" : "Share with congregation"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
