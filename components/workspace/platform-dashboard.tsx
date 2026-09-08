"use client"

import { FormEvent, useEffect, useState } from "react"
import Link from "next/link"
import { ArrowRight, Building2, Copy, Edit3, Loader2, Plus, Trash2 } from "lucide-react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
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
import { CongregationMark } from "./congregation-mark"
import { EmptyState } from "./empty-state"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from "@/components/ui/context-menu"

type Congregation = {
  id?: number
  name: string
  slug: string
  status?: string
  memberCount?: number
  member_count?: number
}

export function PlatformDashboard() {
  const [congregations, setCongregations] = useState<Congregation[]>([])
  const [loading, setLoading] = useState(true)
  const [name, setName] = useState("")
  const [slug, setSlug] = useState("")
  const [adminEmail, setAdminEmail] = useState("")
  const [saving, setSaving] = useState(false)
  const [firstAdminLink, setFirstAdminLink] = useState("")
  const [congregationToDelete, setCongregationToDelete] = useState<Congregation | null>(null)
  const [deleteConfirmation, setDeleteConfirmation] = useState("")
  const [deleting, setDeleting] = useState(false)
  const [congregationToEdit, setCongregationToEdit] = useState<Congregation | null>(null)
  const [editName, setEditName] = useState("")
  const [editSlug, setEditSlug] = useState("")
  const [editing, setEditing] = useState(false)

  function loadCongregations() {
    fetch("/api/platform/congregations", { cache: "no-store" })
      .then((response) => (response.ok ? response.json() : null))
      .then((data) => setCongregations(data?.congregations ?? []))
      .catch(() => setCongregations([]))
      .finally(() => setLoading(false))
  }

  useEffect(loadCongregations, [])

  function updateName(value: string) {
    setName(value)
    setSlug(
      value
        .trim()
        .toLocaleLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-|-$/g, ""),
    )
  }

  async function createCongregation(event: FormEvent) {
    event.preventDefault()
    setSaving(true)
    try {
      const response = await fetch("/api/platform/congregations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim(), slug: slug.trim(), adminEmail: adminEmail.trim() }),
      })
      if (!response.ok) throw new Error("Congregation could not be created")
      const result = await response.json()
      const congregation = result.congregation ?? result
      if (result.inviteUrl || result.url || result.token) {
        const path = result.inviteUrl ?? result.url ?? `/join/${result.token}`
        setFirstAdminLink(path.startsWith("http") ? path : `${window.location.origin}${path}`)
      }
      setName("")
      setSlug("")
      setAdminEmail("")
      loadCongregations()
      toast.success("Congregation created")
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Congregation could not be created")
    } finally {
      setSaving(false)
    }
  }

  async function copyAdminLink() {
    await navigator.clipboard.writeText(firstAdminLink)
    toast.success("First admin invitation copied")
  }

  async function deleteCongregation() {
    if (!congregationToDelete?.id) return
    setDeleting(true)
    try {
      const response = await fetch("/api/platform/congregations", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: congregationToDelete.id, confirmation: deleteConfirmation }),
      })
      const result = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(result.error ?? "Congregation could not be deleted")
      setCongregations((current) => current.filter((congregation) => congregation.id !== congregationToDelete.id))
      setCongregationToDelete(null)
      setDeleteConfirmation("")
      toast.success("Congregation deleted")
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Congregation could not be deleted")
    } finally {
      setDeleting(false)
    }
  }

  function openEditDialog(congregation: Congregation) {
    setCongregationToEdit(congregation)
    setEditName(congregation.name)
    setEditSlug(congregation.slug)
  }

  async function updateCongregation(event: FormEvent) {
    event.preventDefault()
    if (!congregationToEdit?.id) return
    setEditing(true)
    try {
      const response = await fetch("/api/platform/congregations", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: congregationToEdit.id, name: editName.trim(), slug: editSlug.trim() }),
      })
      const result = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(result.error ?? "Congregation could not be updated")
      const updated = result.congregation as Congregation
      setCongregations((current) => current.map((congregation) => congregation.id === updated.id ? { ...congregation, ...updated } : congregation))
      setCongregationToEdit(null)
      toast.success("Congregation updated")
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Congregation could not be updated")
    } finally {
      setEditing(false)
    }
  }

  const createButton = (
    <Dialog onOpenChange={(open) => !open && setFirstAdminLink("")}>
      <DialogTrigger asChild>
        <Button className="admin-primary-button min-h-11 rounded-xl">
          <Plus aria-hidden="true" />
          New congregation
        </Button>
      </DialogTrigger>
      <DialogContent className="rounded-2xl sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="text-base font-semibold">Create a congregation</DialogTitle>
          <DialogDescription>Create its private workspace, then copy the first administrator invitation.</DialogDescription>
        </DialogHeader>
        {!firstAdminLink ? (
          <form onSubmit={createCongregation} className="space-y-5">
            <div className="space-y-2">
              <Label htmlFor="new-congregation-name">Name</Label>
              <Input id="new-congregation-name" value={name} onChange={(event) => updateName(event.target.value)} className="h-11 rounded-xl" placeholder="Central French Alexandria" required />
            </div>
            <div className="space-y-2">
              <Label htmlFor="new-congregation-slug">Slug</Label>
              <Input id="new-congregation-slug" value={slug} onChange={(event) => setSlug(event.target.value)} className="h-11 rounded-xl" placeholder="central-french-alexandria" required pattern="[a-z0-9]+(?:-[a-z0-9]+)*" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="new-congregation-admin">First administrator email</Label>
              <Input id="new-congregation-admin" type="email" value={adminEmail} onChange={(event) => setAdminEmail(event.target.value)} className="h-11 rounded-xl" placeholder="admin@example.com" required />
            </div>
            <DialogFooter>
              <Button type="submit" disabled={saving} className="admin-primary-button min-h-11 rounded-xl">
                {saving ? <Loader2 className="animate-spin" aria-hidden="true" /> : <Plus aria-hidden="true" />}
                Create congregation
              </Button>
            </DialogFooter>
          </form>
        ) : (
          <div className="space-y-4">
            <div className="rounded-xl bg-muted p-4">
              <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">First admin invitation</p>
              <p className="break-all text-sm font-normal leading-relaxed">{firstAdminLink}</p>
            </div>
            <Button onClick={copyAdminLink} className="admin-primary-button min-h-11 w-full rounded-xl">
              <Copy aria-hidden="true" />
              Copy invitation link
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )

  if (loading) {
    return <div className="h-40 animate-pulse rounded-2xl bg-muted" aria-busy="true" aria-label="Loading congregations" />
  }

  if (!congregations.length) {
    return (
      <div className="space-y-6">
        <div className="flex justify-end">{createButton}</div>
        <EmptyState icon={Building2} title="Create the first congregation" description="Each congregation gets a private Name Search and Team Progress workspace with isolated members and data." />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-end">{createButton}</div>
      <div className="grid gap-4 sm:grid-cols-2">
        {congregations.map((congregation) => (
          <ContextMenu key={congregation.slug}>
            <ContextMenuTrigger asChild>
              <Card className="admin-card h-full rounded-2xl">
                <CardContent className="flex min-h-32 items-center gap-4 p-6">
                  <Link href={`/c/${congregation.slug}`} className="group flex min-w-0 flex-1 items-center gap-4 rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2">
                    <CongregationMark name={congregation.name} className="h-12 w-12 text-base" />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-base font-semibold">{congregation.name}</p>
                      <p className="mt-1 text-sm font-normal text-muted-foreground">{congregation.memberCount ?? congregation.member_count ?? 0} members</p>
                    </div>
                    <ArrowRight className="h-5 w-5 text-muted-foreground transition-transform duration-150 ease-out group-hover:translate-x-1" aria-hidden="true" />
                  </Link>
                </CardContent>
              </Card>
            </ContextMenuTrigger>
            <ContextMenuContent>
              <ContextMenuItem onSelect={() => openEditDialog(congregation)}><Edit3 className="mr-2 h-4 w-4" aria-hidden="true" />Edit congregation</ContextMenuItem>
              <ContextMenuSeparator />
              <ContextMenuItem className="text-destructive focus:bg-destructive/10 focus:text-destructive" onSelect={() => { setCongregationToDelete(congregation); setDeleteConfirmation("") }}><Trash2 className="mr-2 h-4 w-4" aria-hidden="true" />Delete congregation</ContextMenuItem>
            </ContextMenuContent>
          </ContextMenu>
        ))}
      </div>
      <Dialog open={Boolean(congregationToEdit)} onOpenChange={(open) => { if (!open && !editing) setCongregationToEdit(null) }}>
        <DialogContent className="rounded-2xl sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Edit congregation</DialogTitle>
            <DialogDescription>Update the workspace name or URL slug.</DialogDescription>
          </DialogHeader>
          <form onSubmit={updateCongregation} className="space-y-5">
            <div className="space-y-2"><Label htmlFor="edit-congregation-name">Name</Label><Input id="edit-congregation-name" value={editName} onChange={(event) => setEditName(event.target.value)} className="h-11 rounded-xl" required /></div>
            <div className="space-y-2"><Label htmlFor="edit-congregation-slug">Slug</Label><Input id="edit-congregation-slug" value={editSlug} onChange={(event) => setEditSlug(event.target.value)} className="h-11 rounded-xl" pattern="[a-z0-9]+(?:-[a-z0-9]+)*" required /></div>
            <DialogFooter><Button type="submit" disabled={editing} className="admin-primary-button min-h-11 rounded-xl">{editing && <Loader2 className="animate-spin" aria-hidden="true" />}Save changes</Button></DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
      <AlertDialog open={Boolean(congregationToDelete)} onOpenChange={(open) => { if (!open && !deleting) { setCongregationToDelete(null); setDeleteConfirmation("") } }}>
        <AlertDialogContent className="rounded-2xl">
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {congregationToDelete?.name}?</AlertDialogTitle>
            <AlertDialogDescription>This permanently deletes the congregation, its members, invitations, and all workspace data. Type <strong>{congregationToDelete?.slug}</strong> to confirm.</AlertDialogDescription>
          </AlertDialogHeader>
          <Input aria-label="Congregation slug confirmation" value={deleteConfirmation} onChange={(event) => setDeleteConfirmation(event.target.value)} placeholder={congregationToDelete?.slug} autoComplete="off" />
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction className="bg-destructive text-destructive-foreground hover:bg-destructive/90" disabled={deleting || deleteConfirmation.trim().toLowerCase() !== congregationToDelete?.slug.toLowerCase()} onClick={(event) => { event.preventDefault(); void deleteCongregation() }}>
              {deleting && <Loader2 className="animate-spin" aria-hidden="true" />}
              Delete congregation
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
