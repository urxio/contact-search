"use client"

import { type KeyboardEvent, useEffect, useMemo, useRef, useState } from "react"
import { Archive, Check, ChevronDown, ChevronRight, FileSpreadsheet, MoreHorizontal, Search, UserRound, UsersRound } from "lucide-react"
import { toast } from "sonner"

import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import type { BaseContact } from "@/types/contact"
import { packageNameForSegment } from "@/lib/package-name"

export type PendingPackageUpload = {
  filename: string
  contacts: BaseContact[]
}

type PackageRow = {
  id: number
  name: string
  visibility: "shared" | "private"
  originalFilename?: string
  original_filename?: string
  contactCount?: number
  contact_count?: number
  ownerName?: string
  owner_name?: string
  uploaderName?: string
  zipcode: string
  pageStart?: number
  page_start?: number
  pageEnd?: number
  page_end?: number
  status?: string
  canManage?: boolean
  can_manage?: boolean
  canOpen?: boolean
  can_open?: boolean
  canAssign?: boolean
  hasSavedProgress?: boolean
  updatedAt?: string | Date
  updated_at?: string | Date
  isMine?: boolean
  is_mine?: boolean
  isAssignedToViewer?: boolean
  is_assigned_to_viewer?: boolean
  state?: "available" | "assigned" | "in_progress" | "completed"
  uploader?: { id: number; displayName: string } | null
  segment?: {
    id: number
    zipcode: string
    city: string
    pageStart: number
    pageEnd: number
    ownerUserId: number | null
    owner: string
    status: string
    stoppedAtPage: number | null
  }
}

type ZipcodeRow = { id: number; zipcode: string; city: string; total_pages: number }
type MemberRow = { userId: number; displayName: string; congregationDisplayName?: string | null; status: string }
type UploadAction = "start" | "save" | "share"

type DraftPayload = {
  packageId?: number | null
  packageAssignmentRevision?: number | null
  resumed?: boolean
  contacts?: unknown[]
  globalNotes?: string
  territoryZipcode?: string
  territoryPageRange?: string
  lastVerifiedId?: string | null
  revision?: number
}

type Props = {
  slug: string
  draftSessionId: string | null
  pendingUpload: PendingPackageUpload | null
  draftRevision: number
  hasDraft: boolean
  browseOpen: boolean
  preferredPackageId?: number | null
  canManagePackages?: boolean
  onBrowseOpenChange: (open: boolean) => void
  onPackageReleased: (packageId: number) => void
  beforePackageRelease: (packageId: number) => Promise<void>
  onCancelUpload: () => void
  onDraftLoaded: (draft: DraftPayload, packageRow?: { id: number; name: string; isMine?: boolean; state?: string }) => void
  onDraftConflict: (draft: DraftPayload) => void
  onEditSessionConflict: (draft: DraftPayload) => void
  beforeDraftReplacement: () => Promise<number>
}

function value<T>(row: PackageRow, camel: keyof PackageRow, snake: keyof PackageRow): T {
  return (row[camel] ?? row[snake]) as T
}

function isClaimableByViewer(row: PackageRow) {
  return row.visibility === "shared" &&
    !Boolean(value<boolean>(row, "isMine", "is_mine")) &&
    row.state === "available"
}

const PAGE_SIZE = 25

const PILL = "rounded-full px-2.5 py-0.5 text-xs font-medium whitespace-nowrap"
const PILL_SUCCESS = "bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300"
const PILL_WARNING = "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300"
const PILL_ACCENT = "bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300"
const PILL_NEUTRAL = "border bg-muted/40 text-muted-foreground"

type ExcelFilter = { id: string; label: string; test: (row: PackageRow) => boolean }

const SORT_LABELS = { recent: "Most recent", name: "Name A–Z", zip: "ZIP code" } as const
type SortKey = keyof typeof SORT_LABELS

function rowSearchText(row: PackageRow) {
  return [row.name, row.originalFilename, row.original_filename, row.uploader?.displayName, row.uploaderName,
    row.segment?.owner, row.segment?.zipcode, row.segment?.city, row.zipcode, row.ownerName, row.owner_name]
    .filter(Boolean).join(" ").toLocaleLowerCase()
}

function rowTime(row: PackageRow) {
  const raw = value<string | Date>(row, "updatedAt", "updated_at")
  return raw ? new Date(raw).getTime() || 0 : 0
}

function ExcelBrowser({ rows, filters, renderRow, searchLabel }: {
  rows: PackageRow[]
  filters: ExcelFilter[]
  renderRow: (row: PackageRow) => React.ReactNode
  searchLabel: string
}) {
  const [search, setSearch] = useState("")
  const [filterId, setFilterId] = useState("all")
  const [sort, setSort] = useState<SortKey>("recent")
  const [shown, setShown] = useState(PAGE_SIZE)
  const [grouped, setGrouped] = useState(false)
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set())

  const counts = useMemo(() => Object.fromEntries(filters.map((filter) => [filter.id, rows.filter(filter.test).length])), [filters, rows])
  const visibleChips = filters.filter((filter) => filter.id === "all" || counts[filter.id] > 0 || filter.id === filterId)
  const results = useMemo(() => {
    const query = search.trim().toLocaleLowerCase()
    const active = filters.find((filter) => filter.id === filterId) ?? filters[0]
    const matches = rows.filter((row) => active.test(row) && (!query || rowSearchText(row).includes(query)))
    return [...matches].sort((a, b) => {
      if (sort === "name") return a.name.localeCompare(b.name, undefined, { numeric: true })
      if (sort === "zip") return (a.segment?.zipcode ?? a.zipcode).localeCompare(b.segment?.zipcode ?? b.zipcode) || a.name.localeCompare(b.name, undefined, { numeric: true })
      return rowTime(b) - rowTime(a)
    })
  }, [rows, filters, filterId, search, sort])

  const groups = useMemo(() => {
    const map = new Map<string, PackageRow[]>()
    for (const row of results) {
      const zip = row.segment?.zipcode ?? row.zipcode ?? "—"
      map.set(zip, [...(map.get(zip) ?? []), row])
    }
    return [...map.entries()].sort(([a], [b]) => a.localeCompare(b))
  }, [results])
  const toggleGroup = (zip: string) => setCollapsed((prev) => { const next = new Set(prev); if (next.has(zip)) next.delete(zip); else next.add(zip); return next })
  const filtered = Boolean(search.trim()) || filterId !== "all"
  const page = results.slice(0, shown)

  return (
    <div className="space-y-3">
      <div className="relative">
        <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
        <Input value={search} onChange={(event) => { setSearch(event.target.value); setShown(PAGE_SIZE) }} placeholder="Search name, member, or ZIP" className="admin-field h-11 pl-10" aria-label={searchLabel} />
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex flex-1 flex-wrap gap-1.5" role="group" aria-label="Filter Excels">
          {visibleChips.map((filter) => (
            <button key={filter.id} type="button" aria-pressed={filterId === filter.id} onClick={() => { setFilterId(filter.id); setShown(PAGE_SIZE) }}
              className={`min-h-8 rounded-full border px-3 text-xs font-medium transition-colors ${filterId === filter.id ? "border-primary bg-primary/10 text-primary" : "text-muted-foreground hover:bg-muted/50"}`}>
              {filter.label} <span className="font-normal opacity-80">{counts[filter.id]}</span>
            </button>
          ))}
        </div>
        <button type="button" aria-pressed={grouped} onClick={() => setGrouped((on) => !on)}
          className={`min-h-8 rounded-lg border px-3 text-xs font-medium transition-colors ${grouped ? "border-primary bg-primary/10 text-primary" : "text-muted-foreground hover:bg-muted/50"}`}>
          Group by ZIP
        </button>
        {grouped ? null : <Select value={sort} onValueChange={(next) => setSort(next as SortKey)}>
          <SelectTrigger className="admin-field h-8 w-auto gap-1.5 text-xs" aria-label="Sort Excels"><SelectValue /></SelectTrigger>
          <SelectContent>{(Object.keys(SORT_LABELS) as SortKey[]).map((key) => <SelectItem key={key} value={key}>{SORT_LABELS[key]}</SelectItem>)}</SelectContent>
        </Select>}
      </div>
      <div className="flex items-center justify-between text-xs text-muted-foreground" aria-live="polite">
        <span>{results.length === rows.length ? `${rows.length.toLocaleString()} Excels` : `${results.length.toLocaleString()} of ${rows.length.toLocaleString()} Excels`}</span>
        {filtered ? <button type="button" className="font-medium text-primary hover:underline" onClick={() => { setSearch(""); setFilterId("all"); setShown(PAGE_SIZE) }}>Clear filters</button> : null}
      </div>
      {results.length && grouped ? (
        <div className="space-y-2">
          <div className="flex justify-end"><button type="button" className="text-xs font-medium text-primary hover:underline" onClick={() => setCollapsed(collapsed.size ? new Set() : new Set(groups.map(([zip]) => zip)))}>{collapsed.size ? "Expand all" : "Collapse all"}</button></div>
          {groups.map(([zip, groupRows]) => {
            const open = !collapsed.has(zip)
            const city = groupRows.find((row) => row.segment?.city)?.segment?.city
            const availableCount = groupRows.filter((row) => row.state === "available").length
            return (
              <section key={zip} className="overflow-hidden rounded-xl border">
                <button type="button" aria-expanded={open} onClick={() => toggleGroup(zip)} className="flex w-full items-center gap-2 bg-muted/30 px-3 py-2.5 text-left hover:bg-muted/50">
                  <ChevronRight className={`h-4 w-4 shrink-0 transition-transform ${open ? "rotate-90" : ""}`} aria-hidden="true" />
                  <span className="text-sm font-semibold">{zip}{city ? ` ${city}` : ""}</span>
                  <Badge variant="secondary">{groupRows.length}</Badge>
                  {availableCount ? <span className="text-xs text-muted-foreground">{availableCount} available</span> : null}
                </button>
                {open ? <div className="divide-y border-t">{groupRows.map((row) => renderRow(row))}</div> : null}
              </section>
            )
          })}
        </div>
      ) : page.length && !grouped ? (
        <div className="divide-y rounded-xl border">{page.map((row) => renderRow(row))}</div>
      ) : (
        <div className="rounded-2xl border border-dashed bg-muted/20 px-6 py-8 text-center"><Archive className="mx-auto h-6 w-6 text-muted-foreground" aria-hidden="true" /><p className="mt-3 text-base font-semibold">{rows.length ? "No Excels match" : "No Excels yet"}</p><p className="mx-auto mt-1 max-w-md text-sm font-normal leading-relaxed text-muted-foreground">{rows.length ? "Try another name, member, or ZIP code, or clear the filters." : "Excels you can access will appear here."}</p></div>
      )}
      {!grouped && results.length > shown ? <Button variant="outline" className="h-10 w-full rounded-xl" onClick={() => setShown((count) => count + PAGE_SIZE)}>Show {Math.min(PAGE_SIZE, results.length - shown)} more <span className="ml-1 font-normal text-muted-foreground">({(results.length - shown).toLocaleString()} remaining)</span></Button> : null}
    </div>
  )
}

export function PackageDialogs({
  slug,
  draftSessionId,
  pendingUpload,
  draftRevision,
  hasDraft,
  browseOpen,
  preferredPackageId,
  canManagePackages = false,
  onBrowseOpenChange,
  onPackageReleased,
  beforePackageRelease,
  onCancelUpload,
  onDraftLoaded,
  onDraftConflict,
  onEditSessionConflict,
  beforeDraftReplacement,
}: Props) {
  const api = `/api/c/${encodeURIComponent(slug)}/packages`
  const [zipcodes, setZipcodes] = useState<ZipcodeRow[]>([])
  const [packages, setPackages] = useState<PackageRow[]>([])
  const [libraryPackages, setLibraryPackages] = useState<PackageRow[]>([])
  const [name, setName] = useState("")
  const [zipcode, setZipcode] = useState("")
  const [zipPickerOpen, setZipPickerOpen] = useState(false)
  const [showAllZipcodes, setShowAllZipcodes] = useState(false)
  const [pageStart, setPageStart] = useState("")
  const [pageEnd, setPageEnd] = useState("")
  const [busy, setBusy] = useState(false)
  const [uploadAction, setUploadAction] = useState<UploadAction | null>(null)
  const [loadingPackages, setLoadingPackages] = useState(false)
  const [packageToOpen, setPackageToOpen] = useState<PackageRow | null>(null)
  const [editingPackage, setEditingPackage] = useState<PackageRow | null>(null)
  const [packageToAssign, setPackageToAssign] = useState<PackageRow | null>(null)
  const [packageToDelete, setPackageToDelete] = useState<PackageRow | null>(null)
  const [members, setMembers] = useState<MemberRow[]>([])
  const [assignedUserId, setAssignedUserId] = useState("")
  const [editName, setEditName] = useState("")
  const [editVisibility, setEditVisibility] = useState<"shared" | "private">("shared")
  const handledPreferredPackage = useRef<number | null>(null)
  const zipPickerRef = useRef<HTMLDivElement>(null)
  const zipInputRef = useRef<HTMLInputElement>(null)

  const selectedZip = useMemo(() => zipcodes.find((item) => item.zipcode === zipcode), [zipcode, zipcodes])
  const visibleZipcodes = useMemo(() => zipcodes.filter((item) => showAllZipcodes || item.zipcode.includes(zipcode)), [showAllZipcodes, zipcode, zipcodes])
  const isOwnExcel = (row: PackageRow) => Boolean(value<boolean>(row, "isAssignedToViewer", "is_assigned_to_viewer") ||
    (value<boolean>(row, "isMine", "is_mine") && (row.visibility === "private" || row.state !== "available")))
  const ownExcels = useMemo(() => packages.filter((row) => row.state !== "completed" && isOwnExcel(row)), [packages])
  const otherExcels = useMemo(() => packages.filter((row) => row.state !== "completed" && !isOwnExcel(row)), [packages])
  const myFilters = useMemo<ExcelFilter[]>(() => [
    { id: "all", label: "All", test: () => true },
    { id: "available", label: "Available", test: (row) => row.state === "available" },
    { id: "in_progress", label: "In progress", test: (row) => row.state === "in_progress" },
    { id: "assigned", label: "Assigned", test: (row) => row.state === "assigned" },
  ], [])
  const libraryFilters = useMemo<ExcelFilter[]>(() => [
    { id: "all", label: "All", test: () => true },
    { id: "available", label: "Available", test: (row) => row.state === "available" },
    { id: "assigned", label: "Assigned", test: (row) => row.state === "assigned" },
    { id: "in_progress", label: "In progress", test: (row) => row.state === "in_progress" },
    { id: "private", label: "Private", test: (row) => row.visibility === "private" },
    { id: "shared", label: "Shared", test: (row) => row.visibility === "shared" },
  ], [])
  const packageToOpenIsClaim = Boolean(packageToOpen && isClaimableByViewer(packageToOpen))

  useEffect(() => {
    if (!pendingUpload) return
    setName(pendingUpload.filename.replace(/\.(xlsx?|xls)$/i, ""))
    setZipcode("")
    setZipPickerOpen(false)
    setShowAllZipcodes(false)
    setPageStart("")
    setPageEnd("")
  }, [pendingUpload])

  useEffect(() => {
    const generatedName = selectedZip && packageNameForSegment(selectedZip.zipcode, selectedZip.city, pageStart, pageEnd)
    if (generatedName) setName(generatedName)
  }, [pageEnd, pageStart, selectedZip])

  useEffect(() => {
    if (!pendingUpload && !browseOpen) return
    fetch(`/api/c/${encodeURIComponent(slug)}/team/zipcodes`, { cache: "no-store" })
      .then((response) => response.ok ? response.json() : [])
      .then((rows) => setZipcodes(Array.isArray(rows) ? rows : rows.rows ?? rows.zipcodes ?? []))
      .catch(() => setZipcodes([]))
  }, [browseOpen, pendingUpload, slug])

  async function refreshPackages() {
    setLoadingPackages(true)
    try {
      const includeAssigned = preferredPackageId && handledPreferredPackage.current !== preferredPackageId
        ? `?include=${preferredPackageId}`
        : ""
      const response = await fetch(`${api}${includeAssigned}`, { cache: "no-store" })
      const result = await response.json()
      if (!response.ok) throw new Error(result.error || "Unable to load Excels")
      setPackages(Array.isArray(result) ? result : result.packages ?? [])
      if (canManagePackages) {
        const libraryResponse = await fetch(`${api}?scope=library`, { cache: "no-store" })
        const libraryResult = await libraryResponse.json()
        if (!libraryResponse.ok) throw new Error(libraryResult.error || "Unable to load the Excel library")
        setLibraryPackages(Array.isArray(libraryResult) ? libraryResult : libraryResult.packages ?? [])
      } else {
        setLibraryPackages([])
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Unable to load Excels")
    } finally {
      setLoadingPackages(false)
    }
  }

  useEffect(() => {
    if (browseOpen) void refreshPackages()
  }, [browseOpen, canManagePackages])

  useEffect(() => {
    if (!preferredPackageId || handledPreferredPackage.current === preferredPackageId || loadingPackages) return
    const preferred = packages.find((row) => row.id === preferredPackageId)
    if (!preferred) return
    handledPreferredPackage.current = preferredPackageId
    onBrowseOpenChange(false)
    setPackageToOpen(preferred)
    const url = new URL(window.location.href)
    url.searchParams.delete("package")
    window.history.replaceState(null, "", `${url.pathname}${url.search}${url.hash}`)
  }, [loadingPackages, onBrowseOpenChange, packages, preferredPackageId])

  function applyDraft(result: any) {
    const draft = result.draft ?? result
    onDraftLoaded(draft, result.package)
  }

  function handleZipPickerKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === "Escape" && zipPickerOpen) {
      event.preventDefault()
      setZipPickerOpen(false)
      zipInputRef.current?.focus()
      return
    }
    if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return
    event.preventDefault()
    if (!zipPickerOpen) {
      setShowAllZipcodes(true)
      setZipPickerOpen(true)
      return
    }
    const options = Array.from(zipPickerRef.current?.querySelectorAll<HTMLButtonElement>("[data-zip-option]:not(:disabled)") ?? [])
    if (!options.length) return
    const current = options.indexOf(document.activeElement as HTMLButtonElement)
    const next = event.key === "ArrowDown" ? Math.min(current + 1, options.length - 1) : Math.max(current - 1, 0)
    options[next]?.focus()
  }

  async function savePackage(action: UploadAction) {
    if (!pendingUpload || !name.trim() || !zipcode || !pageStart || !pageEnd) {
      toast.error("Add an Excel name, ZIP code, and complete page range.")
      return
    }
    if (!/^\d{5}$/.test(zipcode) || !selectedZip) {
      toast.error("Enter a configured five-digit ZIP code or choose one from the list.")
      return
    }
    const startNow = action === "start"
    const visibility = action === "share" ? "shared" : "private"
    setUploadAction(action)
    setBusy(true)
    try {
      const revision = startNow ? await beforeDraftReplacement() : draftRevision
      const response = await fetch(api, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          visibility,
          originalFilename: pendingUpload.filename,
          contacts: pendingUpload.contacts,
          zipcode,
          pageStart: Number(pageStart),
          pageEnd: Number(pageEnd),
          startNow,
          draftRevision: revision,
          draftSessionId,
        }),
      })
      const result = await response.json()
      if (response.status === 409 && result.code === "DRAFT_EDIT_SESSION_REPLACED") {
        onEditSessionConflict(result.server)
        throw new Error("This Excel is being edited on another device. Switch editing to this device to continue.")
      }
      if (response.status === 409 && result.server) {
        onDraftConflict(result.server)
        throw new Error("Your draft changed in another tab. Resolve it before starting this Excel.")
      }
      if (!response.ok) throw new Error(result.error || "Unable to save Excel")
      if (startNow) applyDraft(result)
      onCancelUpload()
      toast.success(
        action === "start"
          ? "Excel is ready to search."
          : action === "save"
            ? "Excel saved to Private Excels for later."
            : "Excel shared with the congregation.",
      )
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Unable to save Excel")
    } finally {
      setBusy(false)
      setUploadAction(null)
    }
  }

  async function openPackage(row: PackageRow) {
    setBusy(true)
    try {
      const revision = await beforeDraftReplacement()
      const response = await fetch(`${api}/${row.id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "open", draftRevision: revision, draftSessionId }),
      })
      const result = await response.json()
      if (response.status === 409 && result.code === "DRAFT_EDIT_SESSION_REPLACED") {
        onEditSessionConflict(result.server)
        throw new Error("This Excel is being edited on another device. Switch editing to this device to continue.")
      }
      if (response.status === 409 && result.server) {
        onDraftConflict(result.server)
        throw new Error("Your draft changed in another tab. Resolve it before opening this Excel.")
      }
      if (!response.ok) throw new Error(result.error || "Unable to open Excel")
      applyDraft(result)
      setPackageToOpen(null)
      onBrowseOpenChange(false)
      toast.success(`${row.name} is ready to search.`)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Unable to open Excel")
    } finally {
      setBusy(false)
    }
  }

  async function updatePackage(row: PackageRow, patch: Record<string, unknown>) {
    setBusy(true)
    try {
      const response = await fetch(`${api}/${row.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      })
      const result = await response.json()
      if (!response.ok) throw new Error(result.error || "Unable to update Excel")
      await refreshPackages()
      setEditingPackage(null)
      onBrowseOpenChange(true)
      toast.success("Excel updated.")
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Unable to update Excel")
    } finally {
      setBusy(false)
    }
  }

  async function packageAction(row: PackageRow, action: "release" | "delete") {
    setBusy(true)
    try {
      if (action === "release") await beforePackageRelease(row.id)
      const response = await fetch(`${api}/${row.id}`, action === "delete" ? { method: "DELETE" } : {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      })
      const result = await response.json()
      if (!response.ok) throw new Error(result.error || `Unable to ${action} Excel`)
      if (action === "release") onPackageReleased(row.id)
      await refreshPackages()
      toast.success(action === "release" ? "Excel made available." : "Excel deleted.")
    } catch (error) {
      toast.error(error instanceof Error ? error.message : `Unable to ${action} Excel`)
    } finally {
      setBusy(false)
    }
  }

  async function beginAssign(row: PackageRow) {
    setPackageToAssign(row)
    onBrowseOpenChange(false)
    setAssignedUserId("")
    try {
      const response = await fetch(`/api/c/${encodeURIComponent(slug)}/members`, { cache: "no-store" })
      const result = await response.json()
      if (!response.ok) throw new Error(result.error || "Unable to load members")
      setMembers((result.members ?? []).filter((member: MemberRow) => member.status === "active"))
    } catch (error) {
      setPackageToAssign(null)
      toast.error(error instanceof Error ? error.message : "Unable to load members")
    }
  }

  async function assignPackage() {
    if (!packageToAssign || !assignedUserId) return
    setBusy(true)
    try {
      const response = await fetch(`${api}/${packageToAssign.id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "assign", userId: Number(assignedUserId) }),
      })
      const result = await response.json()
      if (!response.ok) throw new Error(result.error || "Unable to assign Excel")
      setPackageToAssign(null)
      await refreshPackages()
      onBrowseOpenChange(true)
      toast.success("Excel assigned.")
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Unable to assign Excel")
    } finally {
      setBusy(false)
    }
  }

  function renderPackageCard(row: PackageRow, library = false) {
    const contactCount = value<number>(row, "contactCount", "contact_count") || 0
    const pageStartValue = row.segment?.pageStart ?? value<number>(row, "pageStart", "page_start")
    const pageEndValue = row.segment?.pageEnd ?? value<number>(row, "pageEnd", "page_end")
    const isAssignedToViewer = Boolean(value<boolean>(row, "isAssignedToViewer", "is_assigned_to_viewer"))
    const assignedOwner = row.segment?.owner || value<string>(row, "ownerName", "owner_name")
    const uploader = row.uploader?.displayName || row.uploaderName || "Uploader unavailable"
    const canManage = Boolean(value<boolean>(row, "canManage", "can_manage"))
    const canOpen = value<boolean>(row, "canOpen", "can_open") !== false && row.state !== "completed"
    const isClaim = isClaimableByViewer(row)
    const openLabel = isClaim ? "Claim" : row.state === "available" ? "Open" : row.hasSavedProgress ? "Resume" : "Open"
    const packageStatus = row.state ? row.state.replace("_", " ") : row.status
    const assignedToAnotherMember = row.segment?.ownerUserId != null && !isAssignedToViewer
    const updatedAt = value<string | Date>(row, "updatedAt", "updated_at")
    const updatedLabel = updatedAt ? new Date(updatedAt).toLocaleDateString() : null

    return (
      <div key={row.id} className="flex min-w-0 flex-wrap items-center gap-3 px-3 py-3 sm:flex-nowrap">
        <FileSpreadsheet className="hidden h-5 w-5 shrink-0 text-primary sm:block" aria-hidden="true" />
        <div className="min-w-0 flex-1">
          <p className="max-w-full truncate text-sm font-semibold" title={row.name}>{row.name}</p>
          <p className="mt-0.5 text-xs font-normal text-muted-foreground">ZIP {row.segment?.zipcode ?? row.zipcode} · pages {pageStartValue}–{pageEndValue} · {contactCount.toLocaleString()} contacts{updatedLabel ? ` · ${updatedLabel}` : ""}</p>
          <p className="mt-0.5 truncate text-xs font-normal text-muted-foreground">{assignedOwner ? `Assigned to ${assignedOwner}` : `Uploaded by ${uploader}`}</p>
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-1.5"><span className={`${PILL} ${PILL_NEUTRAL}`}>{row.visibility === "private" ? "Private" : "Shared"}</span>{isAssignedToViewer ? <span className={`${PILL} ${PILL_ACCENT}`}>Assigned to you</span> : null}<span className={`${PILL} capitalize ${row.state === "available" ? PILL_SUCCESS : row.state === "in_progress" ? PILL_WARNING : row.state === "assigned" ? PILL_ACCENT : PILL_NEUTRAL}`}>{packageStatus}</span></div>
        <div className="flex shrink-0 items-center justify-end gap-1.5">
          {!assignedToAnotherMember ? <Button className="h-9 rounded-lg px-4" disabled={!canOpen || busy} onClick={() => { onBrowseOpenChange(false); setPackageToOpen(row) }}>{openLabel}</Button> : null}
          {canManage ? <DropdownMenu><DropdownMenuTrigger asChild><Button variant="ghost" size="icon" className="h-9 w-9 rounded-lg" aria-label={`Manage ${row.name}`}><MoreHorizontal aria-hidden="true" /></Button></DropdownMenuTrigger><DropdownMenuContent align="end" className="w-56 rounded-xl p-2"><DropdownMenuItem className="min-h-11 rounded-lg" onSelect={() => { onBrowseOpenChange(false); setEditingPackage(row); setEditName(row.name); setEditVisibility(row.visibility) }}>Edit details</DropdownMenuItem>{row.canAssign ? <DropdownMenuItem className="min-h-11 rounded-lg" onSelect={() => beginAssign(row)}>Assign or reassign member</DropdownMenuItem> : null}{row.state !== "available" ? <DropdownMenuItem className="min-h-11 rounded-lg" onSelect={() => packageAction(row, "release")}>Unassign & make available</DropdownMenuItem> : null}<DropdownMenuSeparator /><DropdownMenuItem className="min-h-11 rounded-lg text-destructive focus:text-destructive" onSelect={() => { onBrowseOpenChange(false); setPackageToDelete(row) }}>Delete Excel</DropdownMenuItem></DropdownMenuContent></DropdownMenu> : null}
        </div>
      </div>
    )
  }

  return (
    <>
      <Dialog open={Boolean(pendingUpload)} onOpenChange={(open) => { if (!open && !busy) onCancelUpload() }}>
        <DialogContent className="admin-material !inset-0 m-auto h-fit max-h-[90vh] w-[calc(100vw-2rem)] !transform-none overflow-y-auto rounded-2xl data-[state=closed]:!animate-none data-[state=open]:!animate-none sm:max-w-xl">
          <DialogHeader className="text-left">
            <div className="admin-icon-well mb-2 flex h-11 w-11 items-center justify-center rounded-xl text-primary">
              <FileSpreadsheet className="h-5 w-5" aria-hidden="true" />
            </div>
            <DialogTitle className="text-base font-semibold">Prepare this Excel</DialogTitle>
            <DialogDescription className="text-sm font-normal leading-relaxed">
              Add the Team Progress segment for these {pendingUpload?.contacts.length.toLocaleString() ?? 0} contacts, then choose what happens next.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label htmlFor="package-zipcode">ZIP code</Label>
              <div
                ref={zipPickerRef}
                className="relative"
                onKeyDown={handleZipPickerKeyDown}
                onBlur={(event) => { if (!event.currentTarget.contains(event.relatedTarget)) setZipPickerOpen(false) }}
              >
                <Input
                  ref={zipInputRef}
                  id="package-zipcode"
                  type="text"
                  inputMode="numeric"
                  autoComplete="postal-code"
                  maxLength={5}
                  placeholder="Type or choose a ZIP code"
                  value={zipcode}
                  onChange={(event) => {
                    setZipcode(event.target.value.replace(/\D/g, ""))
                    setShowAllZipcodes(false)
                    setZipPickerOpen(true)
                  }}
                  className="admin-field h-11 rounded-xl pr-12"
                />
                <button
                  type="button"
                  aria-label="Browse configured ZIP codes"
                  aria-expanded={zipPickerOpen}
                  aria-haspopup="listbox"
                  aria-controls="package-zipcode-options"
                  onClick={() => {
                    if (zipPickerOpen && showAllZipcodes) setZipPickerOpen(false)
                    else { setShowAllZipcodes(true); setZipPickerOpen(true) }
                    zipInputRef.current?.focus()
                  }}
                  className="absolute right-px top-px flex h-[calc(100%-2px)] w-11 items-center justify-center rounded-r-xl border-l bg-background text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <ChevronDown className="h-4 w-4" aria-hidden="true" />
                </button>
                {zipPickerOpen ? <div id="package-zipcode-options" role="listbox" aria-label="Configured ZIP codes" className="absolute left-0 right-0 top-full z-50 mt-1 max-h-56 overflow-y-auto overscroll-contain rounded-xl border bg-popover p-1 shadow-lg">
                  {visibleZipcodes.length ? visibleZipcodes.map((item) => <button
                    key={item.id}
                    type="button"
                    role="option"
                    aria-selected={item.zipcode === zipcode}
                    data-zip-option
                    disabled={item.total_pages < 1}
                    onClick={() => { setZipcode(item.zipcode); setZipPickerOpen(false); zipInputRef.current?.focus() }}
                    className="block w-full rounded-lg px-3 py-2 text-left text-sm hover:bg-accent focus:bg-accent focus:outline-none disabled:cursor-not-allowed disabled:text-muted-foreground disabled:hover:bg-transparent"
                  >
                    {item.zipcode} · {item.city}{item.total_pages < 1 ? " · setup needed" : ""}
                  </button>) : <p className="px-3 py-3 text-sm text-muted-foreground">No configured ZIP codes match.</p>}
                </div> : null}
              </div>
              {zipcode.length === 5 && !selectedZip ? <p className="text-xs text-amber-600 dark:text-amber-400">This ZIP is not configured in Team Progress.</p> : null}
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2"><Label htmlFor="package-page-start">Start page</Label><Input id="package-page-start" type="number" min={1} max={selectedZip?.total_pages} value={pageStart} onChange={(event) => setPageStart(event.target.value)} className="admin-field h-11 rounded-xl" /></div>
              <div className="space-y-2"><Label htmlFor="package-page-end">End page</Label><Input id="package-page-end" type="number" min={1} max={selectedZip?.total_pages} value={pageEnd} onChange={(event) => setPageEnd(event.target.value)} className="admin-field h-11 rounded-xl" /></div>
            </div>
            {selectedZip ? <p className={`text-xs font-normal ${selectedZip.total_pages < 1 ? "text-amber-600 dark:text-amber-400" : "text-muted-foreground"}`}>{selectedZip.total_pages < 1 ? "An admin must enter this ZIP’s page total before assignments can be created." : `Available pages: 1–${selectedZip.total_pages.toLocaleString()}`}</p> : null}
          </div>

          <fieldset className="space-y-3">
            <legend className="text-sm font-medium">What would you like to do with this Excel?</legend>
            <div className="grid gap-3 sm:grid-cols-2">
              <Button
                className="admin-primary-button h-auto min-h-16 justify-start gap-3 whitespace-normal rounded-xl px-4 py-3 text-left sm:col-span-2"
                disabled={busy}
                onClick={() => savePackage("start")}
              >
                <Search className="shrink-0" aria-hidden="true" />
                <span>
                  <span className="block text-sm font-semibold">{uploadAction === "start" ? "Starting…" : "Start searching now"}</span>
                  <span className="mt-0.5 block text-xs font-normal text-primary-foreground/80">Save privately and begin searching right away</span>
                </span>
              </Button>
              <Button
                variant="outline"
                className="h-auto min-h-20 justify-start gap-3 whitespace-normal rounded-xl px-4 py-3 text-left transition-all duration-150 ease-out"
                disabled={busy}
                onClick={() => savePackage("save")}
              >
                <UserRound className="shrink-0 text-primary" aria-hidden="true" />
                <span>
                  <span className="block text-sm font-semibold">{uploadAction === "save" ? "Saving…" : "Save in Your Excels"}</span>
                  <span className="mt-0.5 block text-xs font-normal text-muted-foreground">Keep it private for later</span>
                </span>
              </Button>
              <Button
                variant="outline"
                className="h-auto min-h-20 justify-start gap-3 whitespace-normal rounded-xl px-4 py-3 text-left transition-all duration-150 ease-out"
                disabled={busy}
                onClick={() => savePackage("share")}
              >
                <UsersRound className="shrink-0 text-primary" aria-hidden="true" />
                <span>
                  <span className="block text-sm font-semibold">{uploadAction === "share" ? "Sharing…" : "Share with congregation"}</span>
                  <span className="mt-0.5 block text-xs font-normal text-muted-foreground">Let another member claim it</span>
                </span>
              </Button>
            </div>
          </fieldset>
        </DialogContent>
      </Dialog>

      <Dialog open={browseOpen} onOpenChange={onBrowseOpenChange}>
        <DialogContent className="admin-material !inset-0 m-auto h-fit max-h-[88vh] w-[calc(100vw-2rem)] !transform-none overflow-x-hidden overflow-y-auto rounded-2xl data-[state=closed]:!animate-none data-[state=open]:!animate-none sm:max-w-3xl">
          <DialogHeader className="text-left">
            <DialogTitle className="text-base font-semibold">Browse Excels</DialogTitle>
            <DialogDescription>Your Excels and, for admins, congregation-wide management.</DialogDescription>
          </DialogHeader>
          {loadingPackages ? (
            <p className="py-10 text-center text-sm font-normal leading-relaxed text-muted-foreground">Loading Excels…</p>
          ) : (
            <Tabs defaultValue="mine" className="py-2">
              <TabsList className="w-full sm:w-auto"><TabsTrigger value="mine" className="flex-1 sm:flex-none">Excels</TabsTrigger>{canManagePackages ? <TabsTrigger value="library" className="flex-1 sm:flex-none">Congregation Library</TabsTrigger> : null}</TabsList>
              <TabsContent value="mine" className="space-y-6 pt-4">
                <section aria-labelledby="own-excels-title" className="space-y-2 rounded-xl border border-blue-200 bg-blue-50/60 p-3 dark:border-blue-900/60 dark:bg-blue-950/20">
                  <div className="flex items-center gap-2"><UserRound className="h-4 w-4 text-blue-700 dark:text-blue-300" aria-hidden="true" /><h3 id="own-excels-title" className="text-sm font-semibold">Your Excels</h3><span className={`${PILL} ${PILL_ACCENT}`}>{ownExcels.length}</span></div>
                  {ownExcels.length ? <div className="divide-y rounded-lg border bg-background">{ownExcels.map((row) => renderPackageCard(row))}</div> : <p className="rounded-lg border border-dashed bg-background/60 px-4 py-5 text-center text-sm text-muted-foreground">Excels you upload privately or claim will appear here.</p>}
                </section>
                <section aria-labelledby="all-excels-title" className="space-y-2">
                  <div className="flex items-center gap-2"><UsersRound className="h-4 w-4 text-muted-foreground" aria-hidden="true" /><h3 id="all-excels-title" className="text-sm font-semibold">Congregation Excels</h3></div>
                  <ExcelBrowser rows={otherExcels} filters={myFilters} renderRow={(row) => renderPackageCard(row)} searchLabel="Search congregation Excels" />
                </section>
              </TabsContent>
              {canManagePackages ? <TabsContent value="library" className="pt-4">
                <ExcelBrowser rows={libraryPackages} filters={libraryFilters} renderRow={(row) => renderPackageCard(row, true)} searchLabel="Search congregation Excel library" />
              </TabsContent> : null}
            </Tabs>
          )}
        </DialogContent>
      </Dialog>

      <AlertDialog open={Boolean(packageToOpen)} onOpenChange={(open) => { if (!open) setPackageToOpen(null) }}>
        <AlertDialogContent className="rounded-2xl"><AlertDialogHeader><AlertDialogTitle>{packageToOpenIsClaim ? (hasDraft ? "Claim and replace your current search?" : "Claim this Excel?") : (hasDraft ? "Replace your current search?" : "Open this Excel?")}</AlertDialogTitle><AlertDialogDescription>{hasDraft ? "Your current search will be replaced with this Excel’s saved progress. Saved contact reviews and notes stay with the Excel when it is handed to another member. Submitted work is not affected." : packageToOpenIsClaim ? "This assigns the Excel to you and restores any saved contact reviews, notes, and research checks." : "This Excel will open with its saved progress. Reviews and notes are preserved for the next member when you release it."}</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel className="min-h-11 rounded-xl" onClick={() => onBrowseOpenChange(true)}>Cancel</AlertDialogCancel><AlertDialogAction className="admin-primary-button min-h-11 rounded-xl" disabled={busy} onClick={(event) => { event.preventDefault(); if (packageToOpen) void openPackage(packageToOpen) }}>{busy ? (packageToOpenIsClaim ? "Claiming…" : "Opening…") : (packageToOpenIsClaim ? "Claim Excel" : "Open Excel")}</AlertDialogAction></AlertDialogFooter></AlertDialogContent>
      </AlertDialog>

      <Dialog open={Boolean(editingPackage)} onOpenChange={(open) => { if (!open) { setEditingPackage(null); onBrowseOpenChange(true) } }}>
        <DialogContent className="admin-material rounded-2xl sm:max-w-md"><DialogHeader className="text-left"><DialogTitle className="text-base font-semibold">Excel details</DialogTitle><DialogDescription>Rename the Excel or change who can find it.</DialogDescription></DialogHeader><div className="space-y-4 py-2"><div className="space-y-2"><Label htmlFor="edit-package-name">Excel name</Label><Input id="edit-package-name" value={editName} onChange={(event) => setEditName(event.target.value)} className="admin-field h-11 rounded-xl" /></div><div className="space-y-2"><Label>Visibility</Label><Select value={editVisibility} onValueChange={(next: "shared" | "private") => setEditVisibility(next)}><SelectTrigger className="admin-field h-11 rounded-xl"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="shared">Shared with congregation</SelectItem><SelectItem value="private">Uploader, assignee, and admins</SelectItem></SelectContent></Select></div></div><DialogFooter><Button className="admin-primary-button min-h-11 rounded-xl" disabled={busy || !editName.trim()} onClick={() => editingPackage && updatePackage(editingPackage, { name: editName.trim(), visibility: editVisibility })}><Check className="h-4 w-4" aria-hidden="true" />Save changes</Button></DialogFooter></DialogContent>
      </Dialog>

      <Dialog open={Boolean(packageToAssign)} onOpenChange={(open) => { if (!open) { setPackageToAssign(null); onBrowseOpenChange(true) } }}>
        <DialogContent className="admin-material rounded-2xl sm:max-w-md"><DialogHeader className="text-left"><DialogTitle className="text-base font-semibold">Assign Excel</DialogTitle><DialogDescription>The member will find this Excel under Your segments in Team Progress.</DialogDescription></DialogHeader><div className="py-2"><Label>Congregation member</Label><Select value={assignedUserId} onValueChange={setAssignedUserId}><SelectTrigger className="admin-field mt-2 h-11 rounded-xl"><SelectValue placeholder="Choose a member" /></SelectTrigger><SelectContent>{members.map((member) => <SelectItem key={member.userId} value={String(member.userId)}>{member.congregationDisplayName || member.displayName}</SelectItem>)}</SelectContent></Select></div><DialogFooter><Button className="admin-primary-button min-h-11 rounded-xl" disabled={busy || !assignedUserId} onClick={assignPackage}>{busy ? "Assigning…" : "Assign Excel"}</Button></DialogFooter></DialogContent>
      </Dialog>

      <AlertDialog open={Boolean(packageToDelete)} onOpenChange={(open) => { if (!open) setPackageToDelete(null) }}>
        <AlertDialogContent className="rounded-2xl"><AlertDialogHeader><AlertDialogTitle>Delete this Excel?</AlertDialogTitle><AlertDialogDescription>Existing member drafts are preserved. Claimed or completed Team Progress history is also preserved.</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel className="min-h-11 rounded-xl" onClick={() => onBrowseOpenChange(true)}>Cancel</AlertDialogCancel><AlertDialogAction className="min-h-11 rounded-xl bg-destructive text-destructive-foreground hover:bg-destructive/90" onClick={(event) => { event.preventDefault(); if (packageToDelete) void packageAction(packageToDelete, "delete").then(() => { setPackageToDelete(null); onBrowseOpenChange(true) }) }}>Delete Excel</AlertDialogAction></AlertDialogFooter></AlertDialogContent>
      </AlertDialog>
    </>
  )
}
