"use client"

import { FormEvent, useEffect, useState } from "react"
import { Check, Clock3, Copy, Loader2, MailPlus, Pencil, RefreshCw, Save, Settings2, Trash2, UserRound, UsersRound } from "lucide-react"
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"

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

function MemberEditDialog({ slug, member, onClose, onSaved }: { slug: string; member: Member | null; onClose: () => void; onSaved: () => void }) {
  const [firstName, setFirstName] = useState("")
  const [lastName, setLastName] = useState("")
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!member) return
    const [first = "", ...rest] = (member.congregationDisplayName || member.displayName).trim().split(/\s+/)
    setFirstName(first)
    setLastName(rest.join(" "))
  }, [member])

  async function save(event: FormEvent) {
    event.preventDefault()
    if (!member) return
    setSaving(true)
    const response = await fetch(`/api/c/${slug}/members`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId: member.userId, displayName: `${firstName.trim()} ${lastName.trim()}`.trim() }),
    })
    setSaving(false)
    if (!response.ok) {
      const result = await response.json().catch(() => null)
      toast.error(result?.error || "Member profile could not be updated")
      return
    }
    toast.success("Member profile updated")
    onSaved()
  }

  return (
    <Dialog open={Boolean(member)} onOpenChange={(open) => { if (!open) onClose() }}>
      <DialogContent className="rounded-2xl sm:max-w-md">
        <form onSubmit={save} className="grid gap-4">
          <DialogHeader>
            <DialogTitle className="text-base font-semibold">Edit member profile</DialogTitle>
            <DialogDescription>Updates this person&apos;s name. Their sign-in email is not changed.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-2">
            <Label htmlFor="member-profile-first">First name</Label>
            <Input id="member-profile-first" value={firstName} onChange={(event) => setFirstName(event.target.value)} required className="min-h-11 rounded-xl" />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="member-profile-last">Last name</Label>
            <Input id="member-profile-last" value={lastName} onChange={(event) => setLastName(event.target.value)} className="min-h-11 rounded-xl" />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose} className="min-h-11 rounded-xl">Cancel</Button>
            <Button type="submit" disabled={saving} className="min-h-11 rounded-xl">
              {saving ? <Loader2 className="animate-spin" aria-hidden="true" /> : <Save aria-hidden="true" />}
              Save
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

type LegacyIdentity = {
  id: number
  displayName?: string
  display_name?: string
  normalizedName?: string
  normalized_name?: string
}

const tabClassName = "min-h-11 rounded-lg px-4 text-sm data-[state=active]:shadow-sm"

export function SettingsWorkspace({ slug, initialName }: SettingsWorkspaceProps) {
  const [name, setName] = useState(initialName)
  const [editableSlug, setEditableSlug] = useState(slug)
  const [saving, setSaving] = useState(false)
  const [inviteEmail, setInviteEmail] = useState("")
  const [inviteRole, setInviteRole] = useState<"member" | "admin">("member")
  const [inviteUrl, setInviteUrl] = useState("")
  const [inviting, setInviting] = useState(false)
  const [invitations, setInvitations] = useState<Invitation[]>([])
  const [invitationsLoading, setInvitationsLoading] = useState(true)
  const [revokingInvitationId, setRevokingInvitationId] = useState<number | null>(null)
  const [refreshingInvitationId, setRefreshingInvitationId] = useState<number | null>(null)
  const [refreshedInviteUrl, setRefreshedInviteUrl] = useState("")
  const [legacyIdentityId, setLegacyIdentityId] = useState("")
  const [members, setMembers] = useState<Member[]>([])
  const [legacyIdentities, setLegacyIdentities] = useState<LegacyIdentity[]>([])
  const [membersLoading, setMembersLoading] = useState(true)
  const [editingMember, setEditingMember] = useState<Member | null>(null)

  useEffect(() => {
    fetch(`/api/c/${slug}/settings`, { cache: "no-store" })
      .then((response) => (response.ok ? response.json() : null))
      .then((data) => {
        if (!data) return
        const congregation = data.congregation ?? data
        if (congregation.name) setName(congregation.name)
        if (congregation.slug) setEditableSlug(congregation.slug)
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
    try {
      const response = await fetch(`/api/c/${slug}/settings`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim(), slug: editableSlug.trim() }),
      })
      if (!response.ok) throw new Error("Settings could not be saved")
      toast.success("Congregation settings saved")
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Settings could not be saved")
    } finally {
      setSaving(false)
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
      const result = await response.json() as InvitationResult & { error?: string }
      if (!response.ok) throw new Error(result.error || "Invitation could not be created")
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
    try {
      await navigator.clipboard.writeText(inviteUrl)
      toast.success("Invitation link copied")
    } catch {
      toast.error("Could not copy the link. Select the URL above to copy it.")
    }
  }

  async function refreshInvitation(invitation: Invitation) {
    setRefreshingInvitationId(invitation.id)
    try {
      const response = await fetch(`/api/c/${slug}/invitations/${invitation.id}/refresh`, { method: "POST" })
      const result = await response.json() as InvitationResult & { error?: string }
      if (!response.ok) throw new Error(result.error || "Invitation could not be refreshed")
      const url = result.inviteUrl
      if (!url) throw new Error("The refreshed invitation link was not returned")
      setRefreshedInviteUrl(url)
      loadInvitations()
      try {
        await navigator.clipboard.writeText(url)
        toast.success("New invitation link copied")
      } catch {
        toast.error("Link refreshed, but clipboard copy failed. Copy it from the dialog.")
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Invitation could not be refreshed")
    } finally {
      setRefreshingInvitationId(null)
    }
  }

  async function copyRefreshedInvitation() {
    try {
      await navigator.clipboard.writeText(refreshedInviteUrl)
      toast.success("Invitation link copied")
    } catch {
      toast.error("Could not copy the link. Select the URL above to copy it.")
    }
  }

  function resetInvitationDialog() {
    setInviteUrl("")
    setInviteEmail("")
    setInviteRole("member")
    setLegacyIdentityId("")
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
                      <Button type="button" variant="outline" onClick={() => setEditingMember(member)} className="min-h-11 rounded-xl">
                        <Pencil aria-hidden="true" />
                        Edit
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
        <MemberEditDialog
          slug={slug}
          member={editingMember}
          onClose={() => setEditingMember(null)}
          onSaved={() => { setEditingMember(null); loadMembers() }}
        />
      </TabsContent>

      <TabsContent value="invitations">
        <Card className="admin-card rounded-2xl">
          <CardHeader>
            <CardTitle className="text-base font-semibold">Invitations</CardTitle>
            <CardDescription>Create a secure link to copy and share manually.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <Dialog open={Boolean(refreshedInviteUrl)} onOpenChange={(open) => { if (!open) setRefreshedInviteUrl("") }}>
              <DialogContent className="rounded-2xl sm:max-w-md">
                <DialogHeader>
                  <DialogTitle className="text-base font-semibold">Refreshed invitation</DialogTitle>
                  <DialogDescription>This new link expires in seven days and can be accepted once.</DialogDescription>
                </DialogHeader>
                <div className="rounded-xl bg-muted p-4">
                  <p className="break-all text-sm font-normal leading-relaxed">{refreshedInviteUrl}</p>
                </div>
                <Button type="button" onClick={copyRefreshedInvitation} className="admin-primary-button min-h-11 w-full rounded-xl">
                  <Copy aria-hidden="true" />
                  Copy invitation link
                </Button>
              </DialogContent>
            </Dialog>
            <Dialog onOpenChange={(open) => !open && resetInvitationDialog()}>
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
                        {status === "Expired" ? (
                          <Button type="button" variant="outline" disabled={refreshingInvitationId !== null} onClick={() => refreshInvitation(invitation)} className="min-h-11 rounded-xl">
                            {refreshingInvitationId === invitation.id ? <Loader2 className="animate-spin" aria-hidden="true" /> : <RefreshCw aria-hidden="true" />}
                            Refresh &amp; copy
                          </Button>
                        ) : null}
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

    </Tabs>
  )
}
