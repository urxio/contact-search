"use client"

import { useEffect, useMemo, useState } from "react"
import { Archive, Check, FileSpreadsheet, Lock, MoreHorizontal, PackageOpen, Users } from "lucide-react"
import { toast } from "sonner"

import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import type { BaseContact } from "@/types/contact"

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
  isMine?: boolean
  is_mine?: boolean
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

type DraftPayload = {
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
  onBrowseOpenChange: (open: boolean) => void
  onCancelUpload: () => void
  onDraftLoaded: (draft: DraftPayload) => void
  onDraftConflict: (draft: DraftPayload) => void
}

function value<T>(row: PackageRow, camel: keyof PackageRow, snake: keyof PackageRow): T {
  return (row[camel] ?? row[snake]) as T
}

export function PackageDialogs({
  slug,
  pendingUpload,
  draftRevision,
  hasDraft,
  browseOpen,
  onBrowseOpenChange,
  onCancelUpload,
  onDraftLoaded,
  onDraftConflict,
}: Props) {
  const api = `/api/c/${encodeURIComponent(slug)}/packages`
  const [zipcodes, setZipcodes] = useState<ZipcodeRow[]>([])
  const [packages, setPackages] = useState<PackageRow[]>([])
  const [name, setName] = useState("")
  const [visibility, setVisibility] = useState<"shared" | "private">("shared")
  const [zipcode, setZipcode] = useState("")
  const [pageStart, setPageStart] = useState("")
  const [pageEnd, setPageEnd] = useState("")
  const [busy, setBusy] = useState(false)
  const [loadingPackages, setLoadingPackages] = useState(false)
  const [packageToOpen, setPackageToOpen] = useState<PackageRow | null>(null)
  const [editingPackage, setEditingPackage] = useState<PackageRow | null>(null)
  const [packageToAssign, setPackageToAssign] = useState<PackageRow | null>(null)
  const [packageToDelete, setPackageToDelete] = useState<PackageRow | null>(null)
  const [members, setMembers] = useState<MemberRow[]>([])
  const [assignedUserId, setAssignedUserId] = useState("")
  const [editName, setEditName] = useState("")
  const [editVisibility, setEditVisibility] = useState<"shared" | "private">("shared")

  const selectedZip = useMemo(() => zipcodes.find((item) => item.zipcode === zipcode), [zipcode, zipcodes])

  useEffect(() => {
    if (!pendingUpload) return
    setName(pendingUpload.filename.replace(/\.(xlsx?|xls)$/i, ""))
    setVisibility("shared")
    setZipcode("")
    setPageStart("")
    setPageEnd("")
  }, [pendingUpload])

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
      const response = await fetch(api, { cache: "no-store" })
      const result = await response.json()
      if (!response.ok) throw new Error(result.error || "Unable to load Excels")
      setPackages(Array.isArray(result) ? result : result.packages ?? [])
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Unable to load Excels")
    } finally {
      setLoadingPackages(false)
    }
  }

  useEffect(() => {
    if (browseOpen) void refreshPackages()
  }, [browseOpen])

  function applyDraft(result: any) {
    const draft = result.draft ?? result
    onDraftLoaded(draft)
  }

  async function savePackage(startNow: boolean) {
    if (!pendingUpload || !name.trim() || !zipcode || !pageStart || !pageEnd) {
      toast.error("Add an Excel name, ZIP code, and complete page range.")
      return
    }
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
      toast.success(startNow ? "Excel saved and ready to search." : "Excel saved for the congregation.")
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Unable to save Excel")
    } finally {
      setBusy(false)
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

  return (
    <>
      <Dialog open={Boolean(pendingUpload)} onOpenChange={(open) => { if (!open && !busy) onCancelUpload() }}>
        <DialogContent className="admin-material max-h-[90vh] overflow-y-auto rounded-2xl sm:max-w-xl">
          <DialogHeader className="text-left">
            <div className="admin-icon-well mb-2 flex h-11 w-11 items-center justify-center rounded-xl text-primary">
              <FileSpreadsheet className="h-5 w-5" aria-hidden="true" />
            </div>
            <DialogTitle className="text-base font-semibold">Prepare this Excel</DialogTitle>
            <DialogDescription className="text-sm font-normal leading-relaxed">
              Add the Team Progress segment for these {pendingUpload?.contacts.length.toLocaleString() ?? 0} contacts.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label htmlFor="package-name">Excel name</Label>
              <Input id="package-name" value={name} onChange={(event) => setName(event.target.value)} className="admin-field h-11 rounded-xl" />
            </div>
            <fieldset className="space-y-2">
              <legend className="text-sm font-medium">Who can find this Excel?</legend>
              <div className="grid grid-cols-2 rounded-xl bg-muted p-1">
                {(["shared", "private"] as const).map((option) => (
                  <button key={option} type="button" onClick={() => setVisibility(option)} aria-pressed={visibility === option}
                    className={`flex min-h-11 items-center justify-center gap-2 rounded-lg px-3 text-sm font-medium transition-all duration-150 ease-out ${visibility === option ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}>
                    {option === "shared" ? <Users className="h-4 w-4" aria-hidden="true" /> : <Lock className="h-4 w-4" aria-hidden="true" />}
                    {option === "shared" ? "Congregation" : "Only me"}
                  </button>
                ))}
              </div>
            </fieldset>
            <div className="space-y-2">
              <Label>ZIP code</Label>
              <Select value={zipcode} onValueChange={setZipcode}>
                <SelectTrigger className="admin-field h-11 rounded-xl"><SelectValue placeholder="Choose a configured ZIP" /></SelectTrigger>
                <SelectContent>{zipcodes.map((item) => <SelectItem key={item.id} value={item.zipcode}>{item.zipcode} · {item.city}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2"><Label htmlFor="package-page-start">Start page</Label><Input id="package-page-start" type="number" min={1} max={selectedZip?.total_pages} value={pageStart} onChange={(event) => setPageStart(event.target.value)} className="admin-field h-11 rounded-xl" /></div>
              <div className="space-y-2"><Label htmlFor="package-page-end">End page</Label><Input id="package-page-end" type="number" min={1} max={selectedZip?.total_pages} value={pageEnd} onChange={(event) => setPageEnd(event.target.value)} className="admin-field h-11 rounded-xl" /></div>
            </div>
            {selectedZip ? <p className="text-xs font-normal text-muted-foreground">Available pages: 1–{selectedZip.total_pages.toLocaleString()}</p> : null}
          </div>

          <DialogFooter className="gap-2 sm:space-x-0">
            <Button variant="outline" className="min-h-11 rounded-xl" disabled={busy} onClick={() => savePackage(false)}>Save Excel</Button>
            <Button className="admin-primary-button min-h-11 rounded-xl" disabled={busy} onClick={() => savePackage(true)}>{busy ? "Saving…" : "Save & start"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={browseOpen} onOpenChange={onBrowseOpenChange}>
        <DialogContent className="admin-material max-h-[88vh] w-[calc(100vw-2rem)] overflow-x-hidden overflow-y-auto rounded-2xl sm:max-w-2xl">
          <DialogHeader className="text-left">
            <DialogTitle className="text-base font-semibold">Search Excels</DialogTitle>
            <DialogDescription>Choose an available segment or manage one you uploaded.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-2">
            {loadingPackages ? <p className="py-10 text-center text-sm text-muted-foreground">Loading Excels…</p> : packages.length === 0 ? (
              <div className="rounded-2xl border border-dashed p-8 text-center"><Archive className="mx-auto h-6 w-6 text-muted-foreground" aria-hidden="true" /><p className="mt-3 text-base font-semibold">No Excels yet</p><p className="mt-1 text-sm text-muted-foreground">Upload the first Excel for this congregation.</p></div>
            ) : packages.map((row) => {
              const contactCount = value<number>(row, "contactCount", "contact_count") || 0
              const pageStartValue = row.segment?.pageStart ?? value<number>(row, "pageStart", "page_start")
              const pageEndValue = row.segment?.pageEnd ?? value<number>(row, "pageEnd", "page_end")
              const owner = row.segment?.owner || value<string>(row, "ownerName", "owner_name") || row.uploader?.displayName || row.uploaderName || "Unassigned"
              const canManage = Boolean(value<boolean>(row, "canManage", "can_manage"))
              const canOpen = value<boolean>(row, "canOpen", "can_open") !== false && row.state !== "completed"
              const packageStatus = row.state ? row.state.replace("_", " ") : row.status
              return (
                <div key={row.id} className="admin-card grid min-w-0 grid-cols-[auto_minmax(0,1fr)] gap-4 rounded-2xl p-4 sm:grid-cols-[auto_minmax(0,1fr)_auto] sm:items-center">
                  <div className="admin-icon-well flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-primary"><PackageOpen className="h-5 w-5" aria-hidden="true" /></div>
                  <div className="min-w-0 flex-1">
                    <p className="max-w-full break-words text-base font-semibold [overflow-wrap:anywhere]">{row.name}</p>
                    <div className="mt-2 flex flex-wrap items-center gap-2"><Badge variant="outline">{row.visibility === "private" ? "Private" : "Shared"}</Badge><Badge variant="secondary" className="capitalize">{packageStatus}</Badge></div>
                    <p className="mt-1 text-sm font-normal leading-relaxed text-muted-foreground">ZIP {row.segment?.zipcode ?? row.zipcode} · pages {pageStartValue}–{pageEndValue} · {contactCount.toLocaleString()} contacts</p>
                    <p className="mt-1 text-xs font-normal text-muted-foreground">{owner}</p>
                  </div>
                  <div className="col-span-2 flex w-full items-center justify-end gap-2 sm:col-span-1 sm:w-auto">
                    <Button className="min-h-11 rounded-xl" disabled={!canOpen || busy} onClick={() => { onBrowseOpenChange(false); setPackageToOpen(row) }}>Open</Button>
                    {canManage ? <DropdownMenu><DropdownMenuTrigger asChild><Button variant="ghost" size="icon" className="h-11 w-11 rounded-xl" aria-label={`Manage ${row.name}`}><MoreHorizontal aria-hidden="true" /></Button></DropdownMenuTrigger><DropdownMenuContent align="end" className="w-56 rounded-xl p-2"><DropdownMenuItem className="min-h-11 rounded-lg" onSelect={() => { onBrowseOpenChange(false); setEditingPackage(row); setEditName(row.name); setEditVisibility(row.visibility) }}>Edit details</DropdownMenuItem>{row.canAssign ? <DropdownMenuItem className="min-h-11 rounded-lg" onSelect={() => beginAssign(row)}>Assign member</DropdownMenuItem> : null}{row.state !== "available" ? <DropdownMenuItem className="min-h-11 rounded-lg" onSelect={() => packageAction(row, "release")}>Unassign & make available</DropdownMenuItem> : null}<DropdownMenuSeparator /><DropdownMenuItem className="min-h-11 rounded-lg text-destructive focus:text-destructive" onSelect={() => { onBrowseOpenChange(false); setPackageToDelete(row) }}>Delete Excel</DropdownMenuItem></DropdownMenuContent></DropdownMenu> : null}
                  </div>
                </div>
              )
            })}
          </div>
        </DialogContent>
      </Dialog>

      <AlertDialog open={Boolean(packageToOpen)} onOpenChange={(open) => { if (!open) setPackageToOpen(null) }}>
        <AlertDialogContent className="rounded-2xl"><AlertDialogHeader><AlertDialogTitle>{hasDraft ? "Replace your current search?" : "Open this Excel?"}</AlertDialogTitle><AlertDialogDescription>{hasDraft ? "Your current draft will be replaced with a fresh copy of this Excel. Submitted work is not affected." : "This claims the segment for you and marks it in progress."}</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel className="min-h-11 rounded-xl" onClick={() => onBrowseOpenChange(true)}>Cancel</AlertDialogCancel><AlertDialogAction className="admin-primary-button min-h-11 rounded-xl" disabled={busy} onClick={(event) => { event.preventDefault(); if (packageToOpen) void openPackage(packageToOpen) }}>{busy ? "Opening…" : "Open Excel"}</AlertDialogAction></AlertDialogFooter></AlertDialogContent>
      </AlertDialog>

      <Dialog open={Boolean(editingPackage)} onOpenChange={(open) => { if (!open) { setEditingPackage(null); onBrowseOpenChange(true) } }}>
        <DialogContent className="admin-material rounded-2xl sm:max-w-md"><DialogHeader className="text-left"><DialogTitle className="text-base font-semibold">Excel details</DialogTitle><DialogDescription>Rename the Excel or change who can find it.</DialogDescription></DialogHeader><div className="space-y-4 py-2"><div className="space-y-2"><Label htmlFor="edit-package-name">Excel name</Label><Input id="edit-package-name" value={editName} onChange={(event) => setEditName(event.target.value)} className="admin-field h-11 rounded-xl" /></div><div className="space-y-2"><Label>Visibility</Label><Select value={editVisibility} onValueChange={(next: "shared" | "private") => setEditVisibility(next)}><SelectTrigger className="admin-field h-11 rounded-xl"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="shared">Shared with congregation</SelectItem><SelectItem value="private">Only me and admins</SelectItem></SelectContent></Select></div></div><DialogFooter><Button className="admin-primary-button min-h-11 rounded-xl" disabled={busy || !editName.trim()} onClick={() => editingPackage && updatePackage(editingPackage, { name: editName.trim(), visibility: editVisibility })}><Check className="h-4 w-4" aria-hidden="true" />Save changes</Button></DialogFooter></DialogContent>
      </Dialog>

      <Dialog open={Boolean(packageToAssign)} onOpenChange={(open) => { if (!open) { setPackageToAssign(null); onBrowseOpenChange(true) } }}>
        <DialogContent className="admin-material rounded-2xl sm:max-w-md"><DialogHeader className="text-left"><DialogTitle className="text-base font-semibold">Assign Excel</DialogTitle><DialogDescription>The member will see this Excel as assigned and can start it from Browse Excels.</DialogDescription></DialogHeader><div className="py-2"><Label>Congregation member</Label><Select value={assignedUserId} onValueChange={setAssignedUserId}><SelectTrigger className="admin-field mt-2 h-11 rounded-xl"><SelectValue placeholder="Choose a member" /></SelectTrigger><SelectContent>{members.map((member) => <SelectItem key={member.userId} value={String(member.userId)}>{member.congregationDisplayName || member.displayName}</SelectItem>)}</SelectContent></Select></div><DialogFooter><Button className="admin-primary-button min-h-11 rounded-xl" disabled={busy || !assignedUserId} onClick={assignPackage}>{busy ? "Assigning…" : "Assign Excel"}</Button></DialogFooter></DialogContent>
      </Dialog>

      <AlertDialog open={Boolean(packageToDelete)} onOpenChange={(open) => { if (!open) setPackageToDelete(null) }}>
        <AlertDialogContent className="rounded-2xl"><AlertDialogHeader><AlertDialogTitle>Delete this Excel?</AlertDialogTitle><AlertDialogDescription>Existing member drafts are preserved. Claimed or completed Team Progress history is also preserved.</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel className="min-h-11 rounded-xl" onClick={() => onBrowseOpenChange(true)}>Cancel</AlertDialogCancel><AlertDialogAction className="min-h-11 rounded-xl bg-destructive text-destructive-foreground hover:bg-destructive/90" onClick={(event) => { event.preventDefault(); if (packageToDelete) void packageAction(packageToDelete, "delete").then(() => { setPackageToDelete(null); onBrowseOpenChange(true) }) }}>Delete Excel</AlertDialogAction></AlertDialogFooter></AlertDialogContent>
      </AlertDialog>
    </>
  )
}
