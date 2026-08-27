"use client"

import { ChangeEvent, FormEvent, useEffect, useMemo, useRef, useState } from "react"
import { ArrowDown, ArrowUp, Check, Clock3, Copy, FileSpreadsheet, Loader2, MailPlus, MapPinned, Pencil, Save, Search, Settings2, Trash2, UserRound, UsersRound } from "lucide-react"
import { toast } from "sonner"

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Textarea } from "@/components/ui/textarea"
import { areaCardColorClass } from "@/lib/area-colors"
import { AREA_COLOR_OPTIONS } from "@/lib/area-colors"

type SettingsWorkspaceProps = {
  slug: string
  initialName: string
}

type InvitationResult = {
  url?: string
  inviteUrl?: string
  token?: string
}

type Invitation = {
  id: number
  email: string
  role: "member" | "admin"
  createdAt: string
  expiresAt: string
  acceptedAt: string | null
  revokedAt: string | null
  legacyDisplayName: string | null
  createdByDisplayName: string | null
}

type Member = {
  id: number
  userId: number
  email: string
  displayName: string
  congregationDisplayName?: string | null
  role: "member" | "admin"
  status: string
}

type LegacyIdentity = {
  id: number
  displayName?: string
  display_name?: string
  normalizedName?: string
  normalized_name?: string
}

type TerritoryZipRow = {
  id: number | null
  zipcode: string
  city: string
  area: string
  totalPages: number | null
  inCoverage: boolean
  inTeamProgress: boolean
}

type ZipImportRow = {
  rowNumber: number
  zipcode: string
  city: string
  area: string
  status: "new" | "unchanged" | "conflict" | "invalid"
  decision?: "create" | "keep" | "replace"
  error?: string
  existing?: { city: string; area: string; totalPages: number }
}

const tabClassName = "min-h-11 rounded-lg px-4 text-sm data-[state=active]:shadow-sm"
const createAreaValue = "__create_new_area__"
const isUnassignedArea = (area: string) => area.toLocaleLowerCase() === "unassigned"

export function SettingsWorkspace({ slug, initialName }: SettingsWorkspaceProps) {
  const [name, setName] = useState(initialName)
  const [editableSlug, setEditableSlug] = useState(slug)
  const [searchZipcodes, setSearchZipcodes] = useState("")
  const [saving, setSaving] = useState(false)
  const [inviteEmail, setInviteEmail] = useState("")
  const [inviteRole, setInviteRole] = useState<"member" | "admin">("member")
  const [inviteUrl, setInviteUrl] = useState("")
  const [inviting, setInviting] = useState(false)
  const [invitations, setInvitations] = useState<Invitation[]>([])
  const [invitationsLoading, setInvitationsLoading] = useState(true)
  const [revokingInvitationId, setRevokingInvitationId] = useState<number | null>(null)
  const [legacyIdentityId, setLegacyIdentityId] = useState("")
  const [members, setMembers] = useState<Member[]>([])
  const [legacyIdentities, setLegacyIdentities] = useState<LegacyIdentity[]>([])
  const [membersLoading, setMembersLoading] = useState(true)
  const [territoryRows, setTerritoryRows] = useState<TerritoryZipRow[]>([])
  const [territoryAreas, setTerritoryAreas] = useState<string[]>([])
  const [areaColors, setAreaColors] = useState<Record<string, string>>({})
  const [areaColorSaving, setAreaColorSaving] = useState<string | null>(null)
  const [territoryRowsLoading, setTerritoryRowsLoading] = useState(true)
  const [territorySearch, setTerritorySearch] = useState("")
  const [editingTerritoryRow, setEditingTerritoryRow] = useState<TerritoryZipRow | null>(null)
  const [mappingCity, setMappingCity] = useState("")
  const [mappingArea, setMappingArea] = useState("")
  const [creatingMappingArea, setCreatingMappingArea] = useState(false)
  const [mappingTotalPages, setMappingTotalPages] = useState("")
  const [mappingSaving, setMappingSaving] = useState(false)
  const territoryImportRef = useRef<HTMLInputElement>(null)
  const [importFileName, setImportFileName] = useState("")
  const [importRows, setImportRows] = useState<ZipImportRow[]>([])
  const [importDialogOpen, setImportDialogOpen] = useState(false)
  const [importPreviewLoading, setImportPreviewLoading] = useState(false)
  const [importApplying, setImportApplying] = useState(false)
  const [areaManagerOpen, setAreaManagerOpen] = useState(false)
  const [areaDraftOrder, setAreaDraftOrder] = useState<string[]>([])
  const [renamingArea, setRenamingArea] = useState<string | null>(null)
  const [areaRenameValue, setAreaRenameValue] = useState("")
  const [areaManagerSaving, setAreaManagerSaving] = useState(false)

  async function loadTerritoryRows() {
    setTerritoryRowsLoading(true)
    try {
      const response = await fetch(`/api/c/${slug}/settings/territory-zipcodes`, { cache: "no-store" })
      if (!response.ok) throw new Error("Territory ZIP mappings could not be loaded")
      const data = await response.json()
      const rows = Array.isArray(data.rows) ? data.rows as TerritoryZipRow[] : []
      setTerritoryRows(rows)
      setTerritoryAreas(Array.isArray(data.areas) ? data.areas : [])
      setAreaColors(typeof data.areaColors === "object" && data.areaColors !== null ? data.areaColors : {})
      setSearchZipcodes(rows.filter((row) => row.inCoverage).map((row) => row.zipcode).join("\n"))
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Territory ZIP mappings could not be loaded")
    } finally {
      setTerritoryRowsLoading(false)
    }
  }

  useEffect(() => { loadTerritoryRows() }, [slug])

  const filteredTerritoryRows = useMemo(() => {
    const query = territorySearch.trim().toLocaleLowerCase()
    if (!query) return territoryRows
    return territoryRows.filter((row) => [row.zipcode, row.city, row.area].some((value) => value.toLocaleLowerCase().includes(query)))
  }, [territoryRows, territorySearch])

  const territoryRowsByArea = useMemo(() => {
    const groups = new Map<string, TerritoryZipRow[]>()
    for (const row of filteredTerritoryRows) {
      const area = row.area.trim() || "Unassigned"
      const rows = groups.get(area)
      if (rows) rows.push(row)
      else groups.set(area, [row])
    }
    const areaIndex = new Map(territoryAreas.map((area, index) => [area.toLocaleLowerCase(), index]))
    return Array.from(groups, ([area, rows]) => ({
      area,
      rows: rows.sort((a, b) => a.zipcode.localeCompare(b.zipcode, undefined, { numeric: true })),
    })).sort((a, b) => {
      if (isUnassignedArea(a.area)) return 1
      if (isUnassignedArea(b.area)) return -1
      const orderDifference = (areaIndex.get(a.area.toLocaleLowerCase()) ?? territoryAreas.length)
        - (areaIndex.get(b.area.toLocaleLowerCase()) ?? territoryAreas.length)
      return orderDifference || a.area.localeCompare(b.area)
    })
  }, [filteredTerritoryRows, territoryAreas])

  const mappingAreaOptions = useMemo(() => {
    const currentArea = editingTerritoryRow?.area?.trim()
    const areas = territoryAreas.filter((area) => !isUnassignedArea(area))
    if (currentArea && !isUnassignedArea(currentArea) && !areas.includes(currentArea)) areas.push(currentArea)
    return [...areas, "Unassigned"]
  }, [editingTerritoryRow, territoryAreas])

  const areaZipCounts = useMemo(() => {
    const counts = new Map<string, number>()
    for (const row of territoryRows) {
      const area = row.area.trim() || "Unassigned"
      counts.set(area, (counts.get(area) ?? 0) + 1)
    }
    return counts
  }, [territoryRows])

  useEffect(() => {
    fetch(`/api/c/${slug}/settings`, { cache: "no-store" })
      .then((response) => (response.ok ? response.json() : null))
      .then((data) => {
        if (!data) return
        const congregation = data.congregation ?? data
        const settings = congregation.settings ?? data.settings ?? {}
        if (congregation.name) setName(congregation.name)
        if (congregation.slug) setEditableSlug(congregation.slug)
        const zipcodes = settings.searchTerritoryZipcodes ?? settings.searchZipcodes ?? settings.search_zipcodes ?? settings.territoryZipcodes
        if (Array.isArray(zipcodes)) setSearchZipcodes(zipcodes.join("\n"))
      })
      .catch(() => undefined)
  }, [slug])

  function loadMembers() {
    setMembersLoading(true)
    fetch(`/api/c/${slug}/members`, { cache: "no-store" })
      .then((response) => (response.ok ? response.json() : null))
      .then((data) => {
        setMembers(data?.members ?? [])
        setLegacyIdentities(data?.legacyIdentities ?? [])
      })
      .catch(() => {
        setMembers([])
        setLegacyIdentities([])
      })
      .finally(() => setMembersLoading(false))
  }

  useEffect(loadMembers, [slug])

  function loadInvitations() {
    setInvitationsLoading(true)
    fetch(`/api/c/${slug}/invitations`, { cache: "no-store" })
      .then((response) => (response.ok ? response.json() : null))
      .then((data) => setInvitations(data?.invitations ?? []))
      .catch(() => setInvitations([]))
      .finally(() => setInvitationsLoading(false))
  }

  useEffect(loadInvitations, [slug])

  async function saveSettings(event: FormEvent) {
    event.preventDefault()
    setSaving(true)
    const coverageZipcodes = Array.from(new Set(searchZipcodes
      .split(/[\s,]+/)
      .map((zipcode) => zipcode.trim())
      .filter(Boolean)))
    try {
      const response = await fetch(`/api/c/${slug}/settings`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          slug: editableSlug.trim(),
          searchZipcodes: coverageZipcodes,
        }),
      })
      if (!response.ok) throw new Error("Settings could not be saved")
      toast.success("Congregation settings saved")
      const coverage = new Set(coverageZipcodes)
      setTerritoryRows((current) => {
        const byZip = new Map(current
          .filter((row) => row.inTeamProgress || coverage.has(row.zipcode))
          .map((row) => [row.zipcode, { ...row, inCoverage: coverage.has(row.zipcode) }]))
        for (const zipcode of coverage) {
          if (!byZip.has(zipcode)) byZip.set(zipcode, { id: null, zipcode, city: "", area: "", totalPages: null, inCoverage: true, inTeamProgress: false })
        }
        return Array.from(byZip.values()).sort((a, b) => a.zipcode.localeCompare(b.zipcode))
      })
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Settings could not be saved")
    } finally {
      setSaving(false)
    }
  }

  function openMappingEditor(row: TerritoryZipRow) {
    setEditingTerritoryRow(row)
    setMappingCity(row.city)
    setMappingArea(!row.area || isUnassignedArea(row.area) ? "Unassigned" : row.area)
    setCreatingMappingArea(false)
    setMappingTotalPages(row.totalPages && row.totalPages > 0 ? String(row.totalPages) : "")
  }

  function selectedAreaColor(area: string) {
    const key = Object.keys(areaColors).find((value) => value.toLocaleLowerCase() === area.toLocaleLowerCase())
    return key ? areaColors[key] : "auto"
  }

  async function updateAreaColor(area: string, color: string) {
    const previousColors = areaColors
    const nextColors = { ...areaColors }
    const existingKey = Object.keys(nextColors).find((value) => value.toLocaleLowerCase() === area.toLocaleLowerCase())
    if (existingKey) delete nextColors[existingKey]
    if (color !== "auto") nextColors[area] = color
    setAreaColors(nextColors)
    setAreaColorSaving(area)
    try {
      const response = await fetch(`/api/c/${slug}/settings/territory-areas`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "set-color", area, color }),
      })
      const result = await response.json()
      if (!response.ok) throw new Error(result.error || "Area color could not be saved")
      setAreaColors(typeof result.areaColors === "object" && result.areaColors !== null ? result.areaColors : nextColors)
      toast.success(`${area} color updated`)
    } catch (error) {
      setAreaColors(previousColors)
      toast.error(error instanceof Error ? error.message : "Area color could not be saved")
    } finally {
      setAreaColorSaving(null)
    }
  }

  async function saveTerritoryMapping(event: FormEvent) {
    event.preventDefault()
    if (!editingTerritoryRow || !mappingCity.trim()) return
    setMappingSaving(true)
    try {
      const response = await fetch(`/api/c/${slug}/settings/territory-zipcodes`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ source: "manual", rows: [{
          zipcode: editingTerritoryRow.zipcode,
          city: mappingCity.trim(),
          area: mappingArea.trim() || "Unassigned",
          totalPages: mappingTotalPages ? Number(mappingTotalPages) : null,
          decision: editingTerritoryRow.inTeamProgress ? "replace" : "create",
        }] }),
      })
      const result = await response.json()
      if (!response.ok) throw new Error(result.error || "The mapping could not be saved")
      setEditingTerritoryRow(null)
      toast.success(editingTerritoryRow.inTeamProgress ? "ZIP mapping updated" : "ZIP added to Team Progress")
      await loadTerritoryRows()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "The mapping could not be saved")
    } finally {
      setMappingSaving(false)
    }
  }

  async function previewTerritoryImport(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    event.target.value = ""
    if (!file) return
    setImportPreviewLoading(true)
    try {
      const form = new FormData()
      form.append("file", file)
      const response = await fetch(`/api/c/${slug}/settings/territory-zipcodes`, { method: "POST", body: form })
      const result = await response.json()
      if (!response.ok) throw new Error(result.error || "The Excel file could not be reviewed")
      setImportFileName(file.name)
      setImportRows(result.rows ?? [])
      setImportDialogOpen(true)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "The Excel file could not be reviewed")
    } finally {
      setImportPreviewLoading(false)
    }
  }

  function setImportDecision(rowNumber: number, decision: "keep" | "replace") {
    setImportRows((rows) => rows.map((row) => row.rowNumber === rowNumber ? { ...row, decision } : row))
  }

  async function applyTerritoryImport() {
    const rows = importRows
      .filter((row) => row.status !== "invalid")
      .map((row) => ({ zipcode: row.zipcode, city: row.city, area: row.area, decision: row.decision }))
    if (!rows.length) return
    setImportApplying(true)
    try {
      const response = await fetch(`/api/c/${slug}/settings/territory-zipcodes`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ source: "excel", rows }),
      })
      const result = await response.json()
      if (!response.ok) throw new Error(result.error || "The ZIP mappings could not be imported")
      setImportDialogOpen(false)
      toast.success(`${result.count} ZIP${result.count === 1 ? "" : "s"} added to territory coverage and Team Progress`)
      await loadTerritoryRows()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "The ZIP mappings could not be imported")
    } finally {
      setImportApplying(false)
    }
  }

  function openAreaManager() {
    setAreaDraftOrder(territoryAreas)
    setRenamingArea(null)
    setAreaRenameValue("")
    setAreaManagerOpen(true)
  }

  function moveArea(area: string, direction: -1 | 1) {
    setAreaDraftOrder((current) => {
      const index = current.indexOf(area)
      const target = index + direction
      if (index < 0 || target < 0 || target >= current.length || isUnassignedArea(current[target])) return current
      const next = [...current]
      const targetArea = next[target]
      next[target] = next[index]
      next[index] = targetArea
      return next
    })
  }

  async function saveManagedAreaOrder() {
    setAreaManagerSaving(true)
    try {
      const response = await fetch(`/api/c/${slug}/settings/territory-areas`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "reorder", areas: areaDraftOrder }),
      })
      const result = await response.json()
      if (!response.ok) throw new Error(result.error || "Area order could not be saved")
      setTerritoryAreas(result.areas)
      setAreaDraftOrder(result.areas)
      toast.success("Area order saved")
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Area order could not be saved")
    } finally {
      setAreaManagerSaving(false)
    }
  }

  async function renameManagedArea(event: FormEvent) {
    event.preventDefault()
    if (!renamingArea || !areaRenameValue.trim()) return
    setAreaManagerSaving(true)
    try {
      const response = await fetch(`/api/c/${slug}/settings/territory-areas`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "rename", area: renamingArea, name: areaRenameValue.trim() }),
      })
      const result = await response.json()
      if (!response.ok) throw new Error(result.error || "Area could not be renamed")
      setTerritoryAreas(result.areas)
      setAreaDraftOrder(result.areas)
      setRenamingArea(null)
      setAreaRenameValue("")
      await loadTerritoryRows()
      toast.success(`${renamingArea} renamed to ${areaRenameValue.trim()}`)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Area could not be renamed")
    } finally {
      setAreaManagerSaving(false)
    }
  }

  async function deleteManagedArea(area: string) {
    setAreaManagerSaving(true)
    try {
      const response = await fetch(`/api/c/${slug}/settings/territory-areas?area=${encodeURIComponent(area)}`, { method: "DELETE" })
      const result = await response.json()
      if (!response.ok) throw new Error(result.error || "Area could not be deleted")
      setTerritoryAreas(result.areas)
      setAreaDraftOrder(result.areas)
      setRenamingArea(null)
      await loadTerritoryRows()
      toast.success(`${area} deleted; ${result.count} ZIP${result.count === 1 ? "" : "s"} moved to Unassigned`)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Area could not be deleted")
    } finally {
      setAreaManagerSaving(false)
    }
  }

  async function createInvitation(event: FormEvent) {
    event.preventDefault()
    setInviting(true)
    try {
      const response = await fetch(`/api/c/${slug}/invitations`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: inviteEmail.trim(),
          role: inviteRole,
          legacyIdentityId: legacyIdentityId ? Number(legacyIdentityId) : undefined,
        }),
      })
      if (!response.ok) throw new Error("Invitation could not be created")
      const result = (await response.json()) as InvitationResult
      const path = result.url ?? result.inviteUrl ?? (result.token ? `/join/${result.token}` : "")
      const absoluteUrl = path.startsWith("http") ? path : `${window.location.origin}${path}`
      setInviteUrl(absoluteUrl)
      loadInvitations()
      toast.success("Invitation link created")
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Invitation could not be created")
    } finally {
      setInviting(false)
    }
  }

  async function copyInvitation() {
    await navigator.clipboard.writeText(inviteUrl)
    toast.success("Invitation link copied")
  }

  async function revokeInvitation(invitation: Invitation) {
    setRevokingInvitationId(invitation.id)
    try {
      const response = await fetch(`/api/c/${slug}/invitations?id=${invitation.id}`, { method: "DELETE" })
      if (!response.ok) throw new Error("Invitation could not be revoked")
      toast.success(`Invitation for ${invitation.email} revoked`)
      loadInvitations()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Invitation could not be revoked")
    } finally {
      setRevokingInvitationId(null)
    }
  }

  function invitationStatus(invitation: Invitation) {
    if (invitation.acceptedAt) return "Accepted"
    if (invitation.revokedAt) return "Revoked"
    if (new Date(invitation.expiresAt).getTime() <= Date.now()) return "Expired"
    return "Pending"
  }

  function formatDate(value: string) {
    return new Intl.DateTimeFormat(undefined, { dateStyle: "medium" }).format(new Date(value))
  }

  async function updateMember(member: Member, changes: Partial<Pick<Member, "role" | "status">>) {
    const response = await fetch(`/api/c/${slug}/members`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId: member.userId, ...changes }),
    })
    if (!response.ok) {
      toast.error("Membership could not be updated")
      return
    }
    toast.success("Membership updated")
    loadMembers()
  }

  async function deleteMember(member: Member) {
    const response = await fetch(`/api/c/${slug}/members?userId=${member.userId}`, { method: "DELETE" })
    if (!response.ok) {
      const result = await response.json().catch(() => ({}))
      toast.error(result.error || "Member could not be permanently deleted")
      return
    }
    toast.success(`${member.congregationDisplayName || member.displayName} permanently removed`)
    loadMembers()
  }

  async function copyPasswordReset(member: Member) {
    const response = await fetch(`/api/c/${slug}/members/${member.userId}/password-reset`, { method: "POST" })
    if (!response.ok) {
      toast.error("Password reset link could not be created")
      return
    }
    const result = await response.json()
    const path = result.resetUrl ?? result.url ?? (result.token ? `/auth/reset/${result.token}` : "")
    const resetUrl = path.startsWith("http") ? path : `${window.location.origin}${path}`
    await navigator.clipboard.writeText(resetUrl)
    toast.success("One-hour password reset link copied")
  }

  return (
    <Tabs defaultValue="general" className="space-y-6">
      <div className="overflow-x-auto pb-1">
        <TabsList className="h-auto min-w-max rounded-xl p-1">
          <TabsTrigger value="general" className={tabClassName}>General</TabsTrigger>
          <TabsTrigger value="members" className={tabClassName}>Members</TabsTrigger>
          <TabsTrigger value="invitations" className={tabClassName}>Invitations</TabsTrigger>
          <TabsTrigger value="search" className={tabClassName}>Territory ZIPs</TabsTrigger>
          <TabsTrigger value="team" className={tabClassName}>Team Progress</TabsTrigger>
        </TabsList>
      </div>

      <TabsContent value="general">
        <form onSubmit={saveSettings}>
          <Card className="admin-card rounded-2xl">
            <CardHeader>
              <div className="admin-icon-well mb-2 flex h-10 w-10 items-center justify-center rounded-xl text-primary">
                <Settings2 className="h-5 w-5" aria-hidden="true" />
              </div>
              <CardTitle className="text-base font-semibold">General</CardTitle>
              <CardDescription>Update the congregation name and its address in Name Search.</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-6 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="congregation-name">Congregation name</Label>
                <Input id="congregation-name" value={name} onChange={(event) => setName(event.target.value)} className="h-11 rounded-xl" required />
              </div>
              <div className="space-y-2">
                <Label htmlFor="congregation-slug">Workspace slug</Label>
                <Input id="congregation-slug" value={editableSlug} onChange={(event) => setEditableSlug(event.target.value)} className="h-11 rounded-xl" required />
                <p className="text-xs font-normal text-muted-foreground">Changing this also changes congregation links.</p>
              </div>
              <div className="sm:col-span-2">
                <Button type="submit" disabled={saving} className="admin-primary-button min-h-11 rounded-xl">
                  {saving ? <Loader2 className="animate-spin" aria-hidden="true" /> : <Save aria-hidden="true" />}
                  Save changes
                </Button>
              </div>
            </CardContent>
          </Card>
        </form>
      </TabsContent>

      <TabsContent value="members">
        <Card className="admin-card rounded-2xl">
          <CardHeader className="flex-row items-start justify-between gap-4 space-y-0">
            <div>
              <CardTitle className="text-base font-semibold">Members</CardTitle>
              <CardDescription className="mt-2 max-w-3xl leading-relaxed">
                Manage roles and access for this congregation. Admin grants settings and member-management permissions; Deactivate removes access without deleting past work. Permanently deleting a member removes their congregation access and saved membership preferences, but preserves their account and past work. Reset link copies a secure, one-hour URL the member can use to choose a new password.
              </CardDescription>
            </div>
            <div className="admin-icon-well flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-primary">
              <UsersRound className="h-5 w-5" aria-hidden="true" />
            </div>
          </CardHeader>
          <CardContent>
            {membersLoading ? (
              <div className="h-32 animate-pulse rounded-xl bg-muted" aria-label="Loading members" aria-busy="true" />
            ) : members.length ? (
              <ul className="divide-y rounded-xl border" aria-label="Congregation members">
                {members.map((member) => (
                  <li key={member.id} className="flex flex-col gap-4 p-4 sm:flex-row sm:items-center">
                    <span className="admin-icon-well flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-primary">
                      <UserRound className="h-5 w-5" aria-hidden="true" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold">{member.congregationDisplayName || member.displayName}</p>
                      <p className="truncate text-xs font-normal text-muted-foreground">{member.email}</p>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <label className="sr-only" htmlFor={`member-role-${member.id}`}>Role for {member.displayName}</label>
                      <select id={`member-role-${member.id}`} value={member.role} onChange={(event) => updateMember(member, { role: event.target.value as Member["role"] })} className="min-h-11 rounded-xl border bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                        <option value="member">Member</option>
                        <option value="admin">Admin</option>
                      </select>
                      <Button type="button" variant="outline" onClick={() => updateMember(member, { status: member.status === "active" ? "inactive" : "active" })} className="min-h-11 rounded-xl">
                        {member.status === "active" ? "Deactivate" : "Reactivate"}
                      </Button>
                      <Button type="button" variant="ghost" onClick={() => copyPasswordReset(member)} className="min-h-11 rounded-xl">
                        <Copy aria-hidden="true" />
                        Reset link
                      </Button>
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button type="button" variant="ghost" className="min-h-11 text-destructive hover:bg-destructive/10 hover:text-destructive">
                            <Trash2 aria-hidden="true" />
                            Delete permanently
                          </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent className="rounded-2xl">
                          <AlertDialogHeader>
                            <AlertDialogTitle>Permanently delete {member.congregationDisplayName || member.displayName}?</AlertDialogTitle>
                            <AlertDialogDescription>This removes their access and membership preferences for this congregation. Their account and past work will be preserved. This cannot be undone.</AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel className="min-h-11 rounded-xl">Cancel</AlertDialogCancel>
                            <AlertDialogAction className="min-h-11 rounded-xl bg-destructive text-destructive-foreground hover:bg-destructive/90" onClick={(event) => { event.preventDefault(); void deleteMember(member) }}>
                              Delete permanently
                            </AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    </div>
                  </li>
                ))}
              </ul>
            ) : (
              <div className="rounded-xl border border-dashed px-6 py-10 text-center">
                <p className="text-base font-semibold">Invite your first teammate</p>
                <p className="mx-auto mt-2 max-w-md text-sm font-normal leading-relaxed text-muted-foreground">Invitation links expire after seven days and can be used once.</p>
              </div>
            )}
          </CardContent>
        </Card>
      </TabsContent>

      <TabsContent value="invitations">
        <Card className="admin-card rounded-2xl">
          <CardHeader>
            <CardTitle className="text-base font-semibold">Invitations</CardTitle>
            <CardDescription>Create a secure link to copy and share manually.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <Dialog onOpenChange={(open) => !open && setInviteUrl("")}>
              <DialogTrigger asChild>
                <Button className="admin-primary-button min-h-11 rounded-xl">
                  <MailPlus aria-hidden="true" />
                  Create invitation
                </Button>
              </DialogTrigger>
              <DialogContent className="rounded-2xl sm:max-w-md">
                <DialogHeader>
                  <DialogTitle className="text-base font-semibold">Invite a congregation member</DialogTitle>
                  <DialogDescription>The link will expire in seven days and can be accepted once.</DialogDescription>
                </DialogHeader>
                {!inviteUrl ? (
                  <form onSubmit={createInvitation} className="space-y-5">
                    <div className="space-y-2">
                      <Label htmlFor="invite-email">Email</Label>
                      <Input id="invite-email" type="email" value={inviteEmail} onChange={(event) => setInviteEmail(event.target.value)} className="h-11 rounded-xl" placeholder="name@example.com" required />
                    </div>
                    <fieldset className="space-y-2">
                      <legend className="text-sm font-medium">Role</legend>
                      <div className="grid grid-cols-2 gap-2">
                        {(["member", "admin"] as const).map((role) => (
                          <button key={role} type="button" onClick={() => setInviteRole(role)} className={`flex min-h-11 items-center justify-between rounded-xl border px-4 text-sm font-medium capitalize transition-all duration-150 ease-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${inviteRole === role ? "border-primary bg-primary/10 text-primary" : "hover:bg-muted"}`}>
                            {role}
                            {inviteRole === role ? <Check className="h-4 w-4" aria-hidden="true" /> : null}
                          </button>
                        ))}
                      </div>
                    </fieldset>
                    {legacyIdentities.length ? (
                      <div className="space-y-2">
                        <Label htmlFor="legacy-identity">Link historical work (optional)</Label>
                        <select id="legacy-identity" value={legacyIdentityId} onChange={(event) => setLegacyIdentityId(event.target.value)} className="min-h-11 w-full rounded-xl border bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                          <option value="">Do not link historical work</option>
                          {legacyIdentities.map((identity) => (
                            <option key={identity.id} value={identity.id}>
                              {identity.displayName ?? identity.display_name ?? identity.normalizedName ?? identity.normalized_name}
                            </option>
                          ))}
                        </select>
                        <p className="text-xs font-normal text-muted-foreground">Acceptance will link matching legacy submissions and segments in one transaction.</p>
                      </div>
                    ) : null}
                    <DialogFooter>
                      <Button type="submit" disabled={inviting} className="admin-primary-button min-h-11 rounded-xl">
                        {inviting ? <Loader2 className="animate-spin" aria-hidden="true" /> : <MailPlus aria-hidden="true" />}
                        Generate link
                      </Button>
                    </DialogFooter>
                  </form>
                ) : (
                  <div className="space-y-4">
                    <div className="rounded-xl bg-muted p-4">
                      <p className="break-all text-sm font-normal leading-relaxed">{inviteUrl}</p>
                    </div>
                    <Button type="button" onClick={copyInvitation} className="admin-primary-button min-h-11 w-full rounded-xl">
                      <Copy aria-hidden="true" />
                      Copy invitation link
                    </Button>
                  </div>
                )}
              </DialogContent>
            </Dialog>
            <div className="border-t pt-6">
              <div className="mb-4">
                <h3 className="text-sm font-semibold">Invitation history</h3>
                <p className="mt-1 text-sm font-normal text-muted-foreground">A record of links created for this congregation.</p>
              </div>
              {invitationsLoading ? (
                <div className="h-28 animate-pulse rounded-xl bg-muted" aria-label="Loading invitations" aria-busy="true" />
              ) : invitations.length ? (
                <ul className="divide-y rounded-xl border" aria-label="Invitation history">
                  {invitations.map((invitation) => {
                    const status = invitationStatus(invitation)
                    return (
                      <li key={invitation.id} className="flex flex-col gap-4 p-4 sm:flex-row sm:items-center">
                        <span className="admin-icon-well flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-primary">
                          <Clock3 className="h-5 w-5" aria-hidden="true" />
                        </span>
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <p className="truncate text-sm font-semibold">{invitation.email}</p>
                            <Badge variant={status === "Pending" ? "default" : "secondary"}>{status}</Badge>
                            <Badge variant="outline" className="capitalize">{invitation.role}</Badge>
                          </div>
                          <p className="mt-1 text-xs font-normal text-muted-foreground">
                            Created {formatDate(invitation.createdAt)}{invitation.createdByDisplayName ? ` by ${invitation.createdByDisplayName}` : ""}
                            {status === "Accepted" && invitation.acceptedAt ? ` · Accepted ${formatDate(invitation.acceptedAt)}` : null}
                            {status === "Revoked" && invitation.revokedAt ? ` · Revoked ${formatDate(invitation.revokedAt)}` : null}
                            {status === "Pending" || status === "Expired" ? ` · Expires ${formatDate(invitation.expiresAt)}` : null}
                          </p>
                          {invitation.legacyDisplayName ? <p className="mt-1 text-xs font-normal text-muted-foreground">Historical work: {invitation.legacyDisplayName}</p> : null}
                        </div>
                        {status === "Pending" ? (
                          <AlertDialog>
                            <AlertDialogTrigger asChild>
                              <Button type="button" variant="ghost" className="min-h-11 rounded-xl text-destructive hover:text-destructive">
                                <Trash2 aria-hidden="true" />
                                Revoke
                              </Button>
                            </AlertDialogTrigger>
                            <AlertDialogContent className="rounded-2xl sm:max-w-md">
                              <AlertDialogHeader>
                                <AlertDialogTitle>Revoke this invitation?</AlertDialogTitle>
                                <AlertDialogDescription>The link for {invitation.email} will stop working. The invitation will remain in the history as revoked.</AlertDialogDescription>
                              </AlertDialogHeader>
                              <AlertDialogFooter>
                                <AlertDialogCancel>Cancel</AlertDialogCancel>
                                <AlertDialogAction disabled={revokingInvitationId === invitation.id} onClick={() => revokeInvitation(invitation)} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                                  {revokingInvitationId === invitation.id ? <Loader2 className="animate-spin" aria-hidden="true" /> : null}
                                  Revoke invitation
                                </AlertDialogAction>
                              </AlertDialogFooter>
                            </AlertDialogContent>
                          </AlertDialog>
                        ) : null}
                      </li>
                    )
                  })}
                </ul>
              ) : (
                <div className="rounded-xl border border-dashed px-6 py-8 text-center">
                  <p className="text-sm font-semibold">No invitations yet</p>
                  <p className="mt-1 text-sm font-normal text-muted-foreground">New invitations will appear here after they are created.</p>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      </TabsContent>

      <TabsContent value="search" className="space-y-6">
        <form onSubmit={saveSettings}>
          <Card className="admin-card rounded-2xl">
            <CardHeader>
              <CardTitle className="text-base font-semibold">Territory ZIPs</CardTitle>
              <CardDescription className="max-w-3xl leading-relaxed">
                These ZIP codes define your congregation&apos;s search territory. When a member edits a contact&apos;s ZIP code to one not listed here, the app shows an &quot;Outside territory&quot; warning and marks the contact as &quot;Different territory.&quot; The contact remains visible and can still be reviewed or submitted.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="search-zipcodes">ZIP codes</Label>
                <Textarea id="search-zipcodes" value={searchZipcodes} onChange={(event) => setSearchZipcodes(event.target.value)} className="min-h-40 rounded-xl font-mono text-sm" placeholder="22301&#10;22302&#10;22304" />
                <p className="text-xs font-normal text-muted-foreground">Enter one ZIP code per line, or separate them with commas.</p>
              </div>
              <Button type="submit" disabled={saving} className="admin-primary-button min-h-11 rounded-xl">
                {saving ? <Loader2 className="animate-spin" aria-hidden="true" /> : <Save aria-hidden="true" />}
                Save territory ZIPs
              </Button>
            </CardContent>
          </Card>
        </form>

        <Card className="admin-card rounded-2xl">
          <CardHeader className="gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <div className="admin-icon-well mb-2 flex h-10 w-10 items-center justify-center rounded-xl text-primary">
                <MapPinned className="h-5 w-5" aria-hidden="true" />
              </div>
              <CardTitle className="text-base font-semibold">City and area mappings</CardTitle>
              <CardDescription className="mt-1 max-w-3xl text-sm font-normal leading-relaxed">
                Connect each territory ZIP to a city and Team Progress area. Reassigning an area keeps its page totals, segments, and history.
              </CardDescription>
            </div>
            <div className="flex shrink-0 flex-wrap items-center gap-2">
              <Button type="button" variant="outline" onClick={openAreaManager} className="min-h-11 rounded-xl">
                <Settings2 aria-hidden="true" />
                Manage areas
              </Button>
              <input ref={territoryImportRef} type="file" accept=".xlsx,.xls" onChange={previewTerritoryImport} className="sr-only" />
              <Button type="button" variant="outline" disabled={importPreviewLoading} onClick={() => territoryImportRef.current?.click()} className="min-h-11 rounded-xl">
                {importPreviewLoading ? <Loader2 className="animate-spin" aria-hidden="true" /> : <FileSpreadsheet aria-hidden="true" />}
                Upload Excel
              </Button>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="rounded-xl border bg-muted/30 p-4">
              <p className="text-sm font-semibold">Excel columns</p>
              <p className="mt-1 text-sm font-normal leading-relaxed text-muted-foreground">
                Use <span className="font-semibold text-foreground">City</span> and <span className="font-semibold text-foreground">Zip</span>. <span className="font-semibold text-foreground">Area</span> is optional; blank areas become Unassigned. New ZIPs are created with their page total marked as setup needed.
              </p>
            </div>
            <div className="relative max-w-sm">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
              <Input value={territorySearch} onChange={(event) => setTerritorySearch(event.target.value)} placeholder="Search ZIP, city, or area…" aria-label="Search ZIP mappings" className="h-11 rounded-xl pl-9" />
            </div>

            {territoryRowsLoading ? (
              <div className="h-40 animate-pulse rounded-xl bg-muted" aria-label="Loading ZIP mappings" aria-busy="true" />
            ) : filteredTerritoryRows.length ? (
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
                {territoryRowsByArea.map(({ area, rows }) => (
                  <section
                    key={area}
                    aria-labelledby={`area-${area.toLocaleLowerCase().replace(/[^a-z0-9]+/g, "-")}`}
                    className={`flex h-96 flex-col overflow-hidden rounded-2xl border shadow-sm transition-shadow duration-150 ease-out hover:shadow-md ${areaCardColorClass(area, territoryAreas, selectedAreaColor(area))}`}
                  >
                    <div className="flex items-start justify-between gap-3 border-b border-current/10 p-4">
                      <div className="min-w-0">
                        <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Area</p>
                        <h3 id={`area-${area.toLocaleLowerCase().replace(/[^a-z0-9]+/g, "-")}`} className="mt-1 truncate text-base font-semibold">{area}</h3>
                      </div>
                      <div className="flex shrink-0 items-center gap-2">
                        {!isUnassignedArea(area) && (
                          <Select value={selectedAreaColor(area)} onValueChange={(color) => updateAreaColor(area, color)} disabled={areaColorSaving === area}>
                            <SelectTrigger aria-label={`Change ${area} card color`} className="h-9 w-24 rounded-lg bg-background/80 text-xs font-semibold">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="auto">Auto</SelectItem>
                              {AREA_COLOR_OPTIONS.map((color) => (
                                <SelectItem key={color.value} value={color.value}>
                                  <span className="flex items-center gap-2"><span className={`h-2.5 w-2.5 rounded-full ${color.swatchClass}`} aria-hidden="true" />{color.label}</span>
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        )}
                        <Badge variant="outline" className="bg-background/80 font-normal">
                          {rows.length} {rows.length === 1 ? "ZIP" : "ZIPs"}
                        </Badge>
                      </div>
                    </div>
                    <div className="flex-1 space-y-2 overflow-y-auto p-3">
                      {rows.map((row) => (
                        <div key={row.zipcode} className="rounded-xl border bg-background/80 p-3 shadow-sm">
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                              <p className="font-mono text-sm font-semibold">{row.zipcode}</p>
                              <p className="mt-1 truncate text-sm font-normal text-muted-foreground">{row.city || "Not linked"}</p>
                              {!row.inCoverage ? <p className="mt-1 text-xs font-normal text-muted-foreground">Outside coverage</p> : null}
                            </div>
                            <Button type="button" variant="ghost" size="sm" onClick={() => openMappingEditor(row)} className="min-h-10 shrink-0 rounded-xl">
                              <Pencil aria-hidden="true" />
                              {row.inTeamProgress ? "Edit" : "Link"}
                            </Button>
                          </div>
                          <div className="mt-3">
                            {!row.inTeamProgress ? (
                              <Badge variant="outline">Not created</Badge>
                            ) : row.totalPages === 0 ? (
                              <Badge variant="secondary">Page total needed</Badge>
                            ) : (
                              <Badge variant="secondary">{row.totalPages?.toLocaleString()} pages</Badge>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </section>
                ))}
              </div>
            ) : (
              <div className="rounded-xl border border-dashed px-6 py-10 text-center">
                <p className="text-sm font-semibold">{territoryRows.length ? "No matching ZIPs" : "No territory ZIPs yet"}</p>
                <p className="mt-1 text-sm font-normal leading-relaxed text-muted-foreground">
                  {territoryRows.length ? "Try a different ZIP, city, or area." : "Add ZIPs above or upload an Excel file to begin."}
                </p>
              </div>
            )}
          </CardContent>
        </Card>

        <Dialog open={!!editingTerritoryRow} onOpenChange={(open) => { if (!open && !mappingSaving) setEditingTerritoryRow(null) }}>
          <DialogContent className="admin-material rounded-2xl sm:max-w-md">
            <DialogHeader>
              <DialogTitle className="text-base font-semibold">{editingTerritoryRow?.inTeamProgress ? "Edit ZIP mapping" : "Link ZIP to Team Progress"}</DialogTitle>
              <DialogDescription className="text-sm font-normal leading-relaxed">
                Set the city and area for ZIP {editingTerritoryRow?.zipcode}. You can enter an existing or new area name.
              </DialogDescription>
            </DialogHeader>
            <form onSubmit={saveTerritoryMapping} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="mapping-city">City</Label>
                <Input id="mapping-city" value={mappingCity} onChange={(event) => setMappingCity(event.target.value)} maxLength={100} className="h-11 rounded-xl" required autoFocus />
              </div>
              <div className="space-y-2">
                <Label htmlFor="mapping-area">Area</Label>
                <Select
                  value={creatingMappingArea ? createAreaValue : mappingArea}
                  onValueChange={(value) => {
                    const creatingArea = value === createAreaValue
                    setCreatingMappingArea(creatingArea)
                    setMappingArea(creatingArea ? "" : value)
                  }}
                >
                  <SelectTrigger id="mapping-area" className="h-11 rounded-xl">
                    <SelectValue placeholder="Choose an area" />
                  </SelectTrigger>
                  <SelectContent>
                    {mappingAreaOptions.map((area) => <SelectItem key={area} value={area}>{area}</SelectItem>)}
                    <SelectItem value={createAreaValue}>Create new area…</SelectItem>
                  </SelectContent>
                </Select>
                {creatingMappingArea ? (
                  <div className="space-y-2 rounded-xl border bg-muted/30 p-3">
                    <Label htmlFor="mapping-new-area">New area name</Label>
                    <Input
                      id="mapping-new-area"
                      value={mappingArea}
                      onChange={(event) => setMappingArea(event.target.value)}
                      maxLength={100}
                      className="h-11 rounded-xl bg-background"
                      placeholder="Enter an area name"
                      required
                    />
                  </div>
                ) : null}
                <p className="text-xs font-normal text-muted-foreground">Changing the area moves this ZIP without changing its Team Progress history.</p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="mapping-total-pages">Total pages in A–Z (optional)</Label>
                <Input id="mapping-total-pages" type="number" min={1} value={mappingTotalPages} onChange={(event) => setMappingTotalPages(event.target.value)} className="h-11 rounded-xl" placeholder="Setup later" />
                <p className="text-xs font-normal text-muted-foreground">Assignments stay disabled until a page total is entered.</p>
              </div>
              <DialogFooter>
                <Button type="button" variant="outline" disabled={mappingSaving} onClick={() => setEditingTerritoryRow(null)} className="min-h-11 rounded-xl">Cancel</Button>
                <Button type="submit" disabled={mappingSaving || !mappingCity.trim() || !mappingArea.trim()} className="admin-primary-button min-h-11 rounded-xl">
                  {mappingSaving ? <Loader2 className="animate-spin" aria-hidden="true" /> : <Save aria-hidden="true" />}
                  Save mapping
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>

        <Dialog open={areaManagerOpen} onOpenChange={(open) => { if (!areaManagerSaving) setAreaManagerOpen(open) }}>
          <DialogContent className="admin-material max-h-[85vh] overflow-hidden rounded-2xl sm:max-w-xl">
            <DialogHeader>
              <DialogTitle className="text-base font-semibold">Manage Team Progress areas</DialogTitle>
              <DialogDescription className="text-sm font-normal leading-relaxed">
                Rename areas, change their display order, or remove an area. Removing an area moves its ZIPs to Unassigned and keeps all Team Progress history.
              </DialogDescription>
            </DialogHeader>
            <div className="max-h-[55vh] space-y-2 overflow-y-auto pr-1">
              {areaDraftOrder.length ? areaDraftOrder.map((area, index) => {
                const isUnassigned = isUnassignedArea(area)
                const firstMovable = index === 0
                const nextArea = areaDraftOrder[index + 1]
                const lastMovable = nextArea === undefined || isUnassignedArea(nextArea)
                const count = areaZipCounts.get(area) ?? 0
                return (
                  <div key={area} className="rounded-xl border bg-background p-3">
                    {renamingArea === area ? (
                      <form onSubmit={renameManagedArea} className="flex flex-col gap-3 sm:flex-row sm:items-end">
                        <div className="min-w-0 flex-1 space-y-2">
                          <Label htmlFor="area-rename">Area name</Label>
                          <Input id="area-rename" value={areaRenameValue} onChange={(event) => setAreaRenameValue(event.target.value)} maxLength={100} className="h-11 rounded-xl" autoFocus required />
                        </div>
                        <div className="flex gap-2">
                          <Button type="button" variant="outline" disabled={areaManagerSaving} onClick={() => setRenamingArea(null)} className="min-h-11 rounded-xl">Cancel</Button>
                          <Button type="submit" disabled={areaManagerSaving || !areaRenameValue.trim()} className="admin-primary-button min-h-11 rounded-xl">
                            {areaManagerSaving ? <Loader2 className="animate-spin" aria-hidden="true" /> : <Save aria-hidden="true" />}
                            Rename
                          </Button>
                        </div>
                      </form>
                    ) : (
                      <div className="flex items-center gap-3">
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <p className="truncate text-sm font-semibold">{area}</p>
                            {isUnassigned ? <Badge variant="secondary">Protected</Badge> : null}
                          </div>
                          <p className="mt-1 text-xs font-normal text-muted-foreground">{count} {count === 1 ? "ZIP" : "ZIPs"}</p>
                        </div>
                        {isUnassigned ? (
                          <p className="text-xs font-normal text-muted-foreground">Always last</p>
                        ) : (
                          <div className="flex shrink-0 items-center gap-1">
                            <Button type="button" variant="ghost" size="icon" disabled={areaManagerSaving || firstMovable} onClick={() => moveArea(area, -1)} aria-label={`Move ${area} up`} className="rounded-xl">
                              <ArrowUp aria-hidden="true" />
                            </Button>
                            <Button type="button" variant="ghost" size="icon" disabled={areaManagerSaving || lastMovable} onClick={() => moveArea(area, 1)} aria-label={`Move ${area} down`} className="rounded-xl">
                              <ArrowDown aria-hidden="true" />
                            </Button>
                            <Button type="button" variant="ghost" size="icon" disabled={areaManagerSaving} onClick={() => { setRenamingArea(area); setAreaRenameValue(area) }} aria-label={`Rename ${area}`} className="rounded-xl">
                              <Pencil aria-hidden="true" />
                            </Button>
                            <AlertDialog>
                              <AlertDialogTrigger asChild>
                                <Button type="button" variant="ghost" size="icon" disabled={areaManagerSaving} aria-label={`Delete ${area}`} className="rounded-xl text-destructive hover:bg-destructive/10 hover:text-destructive">
                                  <Trash2 aria-hidden="true" />
                                </Button>
                              </AlertDialogTrigger>
                              <AlertDialogContent className="rounded-2xl sm:max-w-md">
                                <AlertDialogHeader>
                                  <AlertDialogTitle>Delete {area}?</AlertDialogTitle>
                                  <AlertDialogDescription>
                                    {count} {count === 1 ? "ZIP" : "ZIPs"} will move to Unassigned. Page totals, assignments, segments, and history will be preserved.
                                  </AlertDialogDescription>
                                </AlertDialogHeader>
                                <AlertDialogFooter>
                                  <AlertDialogCancel disabled={areaManagerSaving}>Cancel</AlertDialogCancel>
                                  <AlertDialogAction disabled={areaManagerSaving} onClick={() => deleteManagedArea(area)} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                                    Delete area
                                  </AlertDialogAction>
                                </AlertDialogFooter>
                              </AlertDialogContent>
                            </AlertDialog>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )
              }) : (
                <div className="rounded-xl border border-dashed px-6 py-8 text-center">
                  <p className="text-sm font-semibold">No areas yet</p>
                  <p className="mt-1 text-sm font-normal leading-relaxed text-muted-foreground">Link a ZIP or import an Excel file to create the first area.</p>
                </div>
              )}
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" disabled={areaManagerSaving} onClick={() => setAreaManagerOpen(false)} className="min-h-11 rounded-xl">Close</Button>
              <Button
                type="button"
                disabled={areaManagerSaving || !!renamingArea || JSON.stringify(areaDraftOrder) === JSON.stringify(territoryAreas)}
                onClick={saveManagedAreaOrder}
                className="admin-primary-button min-h-11 rounded-xl"
              >
                {areaManagerSaving ? <Loader2 className="animate-spin" aria-hidden="true" /> : <Save aria-hidden="true" />}
                Save order
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <Dialog open={importDialogOpen} onOpenChange={(open) => { if (!importApplying) setImportDialogOpen(open) }}>
          <DialogContent className="admin-material max-h-[85vh] overflow-hidden rounded-2xl sm:max-w-4xl">
            <DialogHeader>
              <DialogTitle className="text-base font-semibold">Review Excel import</DialogTitle>
              <DialogDescription className="text-sm font-normal leading-relaxed">
                Review {importFileName} before updating territory coverage and Team Progress. Existing conflicts keep their current mapping unless you choose the uploaded values.
              </DialogDescription>
            </DialogHeader>
            <div className="flex flex-wrap gap-2" aria-label="Import summary">
              <Badge variant="secondary">{importRows.filter((row) => row.status === "new").length} new</Badge>
              <Badge variant="secondary">{importRows.filter((row) => row.status === "conflict").length} conflicts</Badge>
              <Badge variant="outline">{importRows.filter((row) => row.status === "unchanged").length} unchanged</Badge>
              {importRows.some((row) => row.status === "invalid") ? <Badge variant="destructive">{importRows.filter((row) => row.status === "invalid").length} invalid</Badge> : null}
            </div>
            <div className="min-h-0 overflow-auto rounded-xl border">
              <table className="w-full min-w-[760px] text-sm">
                <thead className="sticky top-0 z-10 bg-muted">
                  <tr className="border-b">
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">Row</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">ZIP</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">Uploaded mapping</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">Status</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">Decision</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {importRows.map((row) => (
                    <tr key={row.rowNumber}>
                      <td className="px-4 py-3 text-muted-foreground">{row.rowNumber}</td>
                      <td className="px-4 py-3 font-mono font-semibold">{row.zipcode || "—"}</td>
                      <td className="px-4 py-3">
                        <p className="text-sm font-semibold">{row.city || "Missing city"}</p>
                        <p className="text-xs font-normal text-muted-foreground">{row.area}</p>
                      </td>
                      <td className="px-4 py-3">
                        {row.status === "invalid" ? <p className="max-w-52 text-sm font-normal leading-relaxed text-destructive">{row.error}</p>
                          : row.status === "conflict" ? <div><Badge variant="outline">Conflict</Badge><p className="mt-1 text-xs font-normal text-muted-foreground">Current: {row.existing?.city} · {row.existing?.area}</p></div>
                            : row.status === "new" ? <Badge>New</Badge> : <Badge variant="secondary">Already matches</Badge>}
                      </td>
                      <td className="px-4 py-3">
                        {row.status === "conflict" ? (
                          <select value={row.decision} onChange={(event) => setImportDecision(row.rowNumber, event.target.value as "keep" | "replace")} className="admin-field h-10 rounded-xl px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                            <option value="keep">Keep existing</option>
                            <option value="replace">Use uploaded</option>
                          </select>
                        ) : row.status === "invalid" ? <span className="text-sm text-muted-foreground">Skipped</span> : <span className="text-sm text-muted-foreground">Import</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" disabled={importApplying} onClick={() => setImportDialogOpen(false)} className="min-h-11 rounded-xl">Cancel</Button>
              <Button type="button" disabled={importApplying || importRows.every((row) => row.status === "invalid")} onClick={applyTerritoryImport} className="admin-primary-button min-h-11 rounded-xl">
                {importApplying ? <Loader2 className="animate-spin" aria-hidden="true" /> : <FileSpreadsheet aria-hidden="true" />}
                Apply import
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </TabsContent>

      <TabsContent value="team">
        <Card className="admin-card rounded-2xl">
          <CardHeader>
            <div className="admin-icon-well mb-2 flex h-10 w-10 items-center justify-center rounded-xl text-primary">
              <MapPinned className="h-5 w-5" aria-hidden="true" />
            </div>
            <CardTitle className="text-base font-semibold">Team Progress territories</CardTitle>
            <CardDescription>Add and organize territory ZIP codes from the Team Progress workspace.</CardDescription>
          </CardHeader>
          <CardContent>
            <Button asChild variant="outline" className="min-h-11 rounded-xl">
              <a href={`/c/${slug}/team`}>Open Team Progress</a>
            </Button>
          </CardContent>
        </Card>
      </TabsContent>
    </Tabs>
  )
}
