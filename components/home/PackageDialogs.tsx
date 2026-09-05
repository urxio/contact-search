"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { Archive, Check, FileSpreadsheet, MoreHorizontal, PackageOpen, Search, UserRound, UsersRound } from "lucide-react"
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
  pendingUpload: PendingPackageUpload | null
  draftRevision: number
  hasDraft: boolean
  browseOpen: boolean
  preferredPackageId?: number | null
  canManagePackages?: boolean
  onBrowseOpenChange: (open: boolean) => void
  onCancelUpload: () => void
  onDraftLoaded: (draft: DraftPayload, packageRow?: { id: number; name: string; isMine?: boolean; state?: string }) => void
  onDraftConflict: (draft: DraftPayload) => void
}

function value<T>(row: PackageRow, camel: keyof PackageRow, snake: keyof PackageRow): T {
  return (row[camel] ?? row[snake]) as T
}

function isClaimableByViewer(row: PackageRow) {
  return row.visibility === "shared" &&
    !Boolean(value<boolean>(row, "isMine", "is_mine")) &&
    row.state === "available"
}

export function PackageDialogs({
  slug,
  pendingUpload,
  draftRevision,
  hasDraft,
  browseOpen,
  preferredPackageId,
  canManagePackages = false,
  onBrowseOpenChange,
  onCancelUpload,
  onDraftLoaded,
  onDraftConflict,
}: Props) {
  const api = `/api/c/${encodeURIComponent(slug)}/packages`
  const [zipcodes, setZipcodes] = useState<ZipcodeRow[]>([])
  const [packages, setPackages] = useState<PackageRow[]>([])
  const [libraryPackages, setLibraryPackages] = useState<PackageRow[]>([])
  const [librarySearch, setLibrarySearch] = useState("")
  const [libraryStatus, setLibraryStatus] = useState("all")
  const [libraryVisibility, setLibraryVisibility] = useState("all")
  const [name, setName] = useState("")
  const [zipcode, setZipcode] = useState("")
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

  const selectedZip = useMemo(() => zipcodes.find((item) => item.zipcode === zipcode), [zipcode, zipcodes])
  const packageSections = useMemo(() => [
    {
      id: "my-excels",
      title: "Private Excels",
      description: "Excels assigned to you, plus private Excels you uploaded or can administer.",
      emptyTitle: "No private Excels",
      emptyDescription: "Private Excels you can access will appear here.",
      icon: UserRound,
      rows: packages.filter((row) => row.visibility === "private" || value<boolean>(row, "isAssignedToViewer", "is_assigned_to_viewer")),
    },
    {
      id: "congregation-excels",
      title: "Congregation Excels",
      description: "Available shared Excels from your congregation.",
      emptyTitle: "No shared Excels available",
      emptyDescription: "New shared Excels will appear here when they are ready to claim.",
      icon: UsersRound,
      rows: packages.filter((row) => row.visibility === "shared" && !value<boolean>(row, "isAssignedToViewer", "is_assigned_to_viewer")),
    },
  ], [packages])
  const filteredLibraryPackages = useMemo(() => {
    const query = librarySearch.trim().toLocaleLowerCase()
    return libraryPackages.filter((row) => {
      const state = row.state ?? ""
      if (libraryStatus !== "all" && state !== libraryStatus) return false
      if (libraryVisibility !== "all" && row.visibility !== libraryVisibility) return false
      if (!query) return true
      const searchable = [row.name, row.originalFilename, row.original_filename, row.uploader?.displayName, row.uploaderName,
        row.segment?.owner, row.segment?.zipcode, row.segment?.city, row.zipcode].filter(Boolean).join(" ").toLocaleLowerCase()
      return searchable.includes(query)
    })
  }, [libraryPackages, librarySearch, libraryStatus, libraryVisibility])
  const packageToOpenIsClaim = Boolean(packageToOpen && isClaimableByViewer(packageToOpen))

  useEffect(() => {
    if (!pendingUpload) return
    setName(pendingUpload.filename.replace(/\.(xlsx?|xls)$/i, ""))
    setZipcode("")
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
      .then((rows) => setZipcodes(Array.isArray(rows) ? rows : rows.zipcodes ?? []))
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

  async function savePackage(action: UploadAction) {
    if (!pendingUpload || !name.trim() || !zipcode || !pageStart || !pageEnd) {
      toast.error("Add an Excel name, ZIP code, and complete page range.")
      return
    }
    const startNow = action === "start"
    const visibility = action === "share" ? "shared" : "private"
    setUploadAction(action)
    setBusy(true)
    try {
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
          draftRevision,
        }),
      })
      const result = await response.json()
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
      const response = await fetch(`${api}/${row.id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "open", draftRevision }),
      })
      const result = await response.json()
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
      const response = await fetch(`${api}/${row.id}`, action === "delete" ? { method: "DELETE" } : {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      })
      const result = await response.json()
      if (!response.ok) throw new Error(result.error || `Unable to ${action} Excel`)
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
    const packageStatus = row.state ? row.state.replace("_", " ") : row.status
    const assignedToAnotherMember = library && row.segment?.ownerUserId != null && !isAssignedToViewer
    const updatedAt = value<string | Date>(row, "updatedAt", "updated_at")
    const updatedLabel = updatedAt ? new Date(updatedAt).toLocaleDateString() : null

    return (
      <div key={row.id} className="admin-card grid min-w-0 grid-cols-[auto_minmax(0,1fr)] gap-4 rounded-2xl p-4 sm:grid-cols-[auto_minmax(0,1fr)_auto] sm:items-center">
        <div className="admin-icon-well flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-primary"><PackageOpen className="h-5 w-5" aria-hidden="true" /></div>
        <div className="min-w-0 flex-1">
          <p className="max-w-full break-words text-base font-semibold [overflow-wrap:anywhere]">{row.name}</p>
          <div className="mt-2 flex flex-wrap items-center gap-2"><Badge variant="outline">{row.visibility === "private" ? "Private" : "Shared"}</Badge>{isAssignedToViewer ? <Badge>Assigned to you</Badge> : null}<Badge variant="secondary" className="capitalize">{packageStatus}</Badge></div>
          <p className="mt-1 text-sm font-normal leading-relaxed text-muted-foreground">ZIP {row.segment?.zipcode ?? row.zipcode} · pages {pageStartValue}–{pageEndValue} · {contactCount.toLocaleString()} contacts{updatedLabel ? ` · Updated ${updatedLabel}` : ""}</p>
          {library ? <div className="mt-1 space-y-0.5 text-xs font-normal text-muted-foreground"><p>Uploaded by {uploader}</p><p>{assignedOwner ? `Assigned to ${assignedOwner}` : "Unassigned"}</p></div> : <p className="mt-1 text-xs font-normal text-muted-foreground">{assignedOwner ? `Assigned to ${assignedOwner}` : `Uploaded by ${uploader}`}</p>}
        </div>
        <div className="col-span-2 flex w-full items-center justify-end gap-2 sm:col-span-1 sm:w-auto">
          {!assignedToAnotherMember ? <Button className="min-h-11 rounded-xl" disabled={!canOpen || busy} onClick={() => { onBrowseOpenChange(false); setPackageToOpen(row) }}>{isClaim ? "Claim" : row.hasSavedProgress ? "Resume" : "Open"}</Button> : null}
          {canManage ? <DropdownMenu><DropdownMenuTrigger asChild><Button variant="ghost" size="icon" className="h-11 w-11 rounded-xl" aria-label={`Manage ${row.name}`}><MoreHorizontal aria-hidden="true" /></Button></DropdownMenuTrigger><DropdownMenuContent align="end" className="w-56 rounded-xl p-2"><DropdownMenuItem className="min-h-11 rounded-lg" onSelect={() => { onBrowseOpenChange(false); setEditingPackage(row); setEditName(row.name); setEditVisibility(row.visibility) }}>Edit details</DropdownMenuItem>{row.canAssign ? <DropdownMenuItem className="min-h-11 rounded-lg" onSelect={() => beginAssign(row)}>Assign or reassign member</DropdownMenuItem> : null}{row.state !== "available" ? <DropdownMenuItem className="min-h-11 rounded-lg" onSelect={() => packageAction(row, "release")}>Unassign & make available</DropdownMenuItem> : null}<DropdownMenuSeparator /><DropdownMenuItem className="min-h-11 rounded-lg text-destructive focus:text-destructive" onSelect={() => { onBrowseOpenChange(false); setPackageToDelete(row) }}>Delete Excel</DropdownMenuItem></DropdownMenuContent></DropdownMenu> : null}
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
              <Label>ZIP code</Label>
              <Select value={zipcode} onValueChange={setZipcode}>
                <SelectTrigger className="admin-field h-11 rounded-xl"><SelectValue placeholder="Choose a configured ZIP" /></SelectTrigger>
                <SelectContent>{zipcodes.map((item) => <SelectItem key={item.id} value={item.zipcode} disabled={item.total_pages < 1}>{item.zipcode} · {item.city}{item.total_pages < 1 ? " · setup needed" : ""}</SelectItem>)}</SelectContent>
              </Select>
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
                  <span className="block text-sm font-semibold">{uploadAction === "save" ? "Saving…" : "Save in My Excels"}</span>
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
        <DialogContent className="admin-material max-h-[88vh] w-[calc(100vw-2rem)] overflow-x-hidden overflow-y-auto rounded-2xl sm:max-w-2xl">
          <DialogHeader className="text-left">
            <DialogTitle className="text-base font-semibold">Browse Excels</DialogTitle>
            <DialogDescription>Your Excels and, for admins, congregation-wide management.</DialogDescription>
          </DialogHeader>
          {loadingPackages ? (
            <p className="py-10 text-center text-sm font-normal leading-relaxed text-muted-foreground">Loading Excels…</p>
          ) : (
            <Tabs defaultValue="mine" className="py-2">
              <TabsList className="w-full sm:w-auto"><TabsTrigger value="mine" className="flex-1 sm:flex-none">My Excels</TabsTrigger>{canManagePackages ? <TabsTrigger value="library" className="flex-1 sm:flex-none">Congregation Library</TabsTrigger> : null}</TabsList>
              <TabsContent value="mine" className="space-y-8 pt-4">
                {packageSections.map((section) => (
                  <section key={section.id} aria-labelledby={`${section.id}-title`} className="space-y-3">
                    <div className="flex items-start gap-3"><span className="admin-icon-well flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-primary"><section.icon className="h-5 w-5" aria-hidden="true" /></span><div className="min-w-0 flex-1"><div className="flex items-center gap-2"><h3 id={`${section.id}-title`} className="text-base font-semibold">{section.title}</h3><Badge variant="secondary" aria-label={`${section.rows.length} ${section.title}`}>{section.rows.length}</Badge></div><p className="mt-1 text-sm font-normal leading-relaxed text-muted-foreground">{section.description}</p></div></div>
                    {section.rows.length ? <div className="space-y-3">{section.rows.map((row) => renderPackageCard(row))}</div> : <div className="rounded-2xl border border-dashed bg-muted/20 px-6 py-8 text-center"><Archive className="mx-auto h-6 w-6 text-muted-foreground" aria-hidden="true" /><p className="mt-3 text-base font-semibold">{section.emptyTitle}</p><p className="mx-auto mt-1 max-w-md text-sm font-normal leading-relaxed text-muted-foreground">{section.emptyDescription}</p></div>}
                  </section>
                ))}
              </TabsContent>
              {canManagePackages ? <TabsContent value="library" className="space-y-4 pt-4">
                <div><h3 className="text-base font-semibold">Congregation Excel Library</h3><p className="mt-1 text-sm font-normal leading-relaxed text-muted-foreground">All active and available Excels, including private uploads. Completed work is not shown.</p></div>
                <div className="grid gap-3 sm:grid-cols-3"><Input value={librarySearch} onChange={(event) => setLibrarySearch(event.target.value)} placeholder="Search Excels, people, ZIP…" className="admin-field h-11 sm:col-span-3" aria-label="Search congregation Excel library" /><Select value={libraryStatus} onValueChange={setLibraryStatus}><SelectTrigger className="admin-field h-11"><SelectValue placeholder="Status" /></SelectTrigger><SelectContent><SelectItem value="all">All statuses</SelectItem><SelectItem value="available">Available</SelectItem><SelectItem value="assigned">Assigned</SelectItem><SelectItem value="in_progress">In progress</SelectItem></SelectContent></Select><Select value={libraryVisibility} onValueChange={setLibraryVisibility}><SelectTrigger className="admin-field h-11"><SelectValue placeholder="Visibility" /></SelectTrigger><SelectContent><SelectItem value="all">All visibility</SelectItem><SelectItem value="private">Private</SelectItem><SelectItem value="shared">Shared</SelectItem></SelectContent></Select></div>
                {filteredLibraryPackages.length ? <div className="space-y-3">{filteredLibraryPackages.map((row) => renderPackageCard(row, true))}</div> : <div className="rounded-2xl border border-dashed bg-muted/20 px-6 py-8 text-center"><Archive className="mx-auto h-6 w-6 text-muted-foreground" aria-hidden="true" /><p className="mt-3 text-base font-semibold">No Excels match these filters</p><p className="mx-auto mt-1 max-w-md text-sm font-normal leading-relaxed text-muted-foreground">Try another name, member, ZIP code, status, or visibility.</p></div>}
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
