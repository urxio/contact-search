"use client"

import { FormEvent, useEffect, useState } from "react"
import { Check, Copy, Loader2, MailPlus, MapPinned, Save, Settings2, UserRound, UsersRound } from "lucide-react"
import { toast } from "sonner"

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
import { Textarea } from "@/components/ui/textarea"

type SettingsWorkspaceProps = {
  slug: string
  initialName: string
}

type InvitationResult = {
  url?: string
  inviteUrl?: string
  token?: string
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

const tabClassName = "min-h-11 rounded-lg px-4 text-sm data-[state=active]:shadow-sm"

export function SettingsWorkspace({ slug, initialName }: SettingsWorkspaceProps) {
  const [name, setName] = useState(initialName)
  const [editableSlug, setEditableSlug] = useState(slug)
  const [searchZipcodes, setSearchZipcodes] = useState("")
  const [saving, setSaving] = useState(false)
  const [inviteEmail, setInviteEmail] = useState("")
  const [inviteRole, setInviteRole] = useState<"member" | "admin">("member")
  const [inviteUrl, setInviteUrl] = useState("")
  const [inviting, setInviting] = useState(false)
  const [legacyIdentityId, setLegacyIdentityId] = useState("")
  const [members, setMembers] = useState<Member[]>([])
  const [legacyIdentities, setLegacyIdentities] = useState<LegacyIdentity[]>([])
  const [membersLoading, setMembersLoading] = useState(true)

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

  async function saveSettings(event: FormEvent) {
    event.preventDefault()
    setSaving(true)
    try {
      const response = await fetch(`/api/c/${slug}/settings`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          slug: editableSlug.trim(),
          searchZipcodes: searchZipcodes
            .split(/[\s,]+/)
            .map((zipcode) => zipcode.trim())
            .filter(Boolean),
        }),
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
      if (!response.ok) throw new Error("Invitation could not be created")
      const result = (await response.json()) as InvitationResult
      const path = result.url ?? result.inviteUrl ?? (result.token ? `/join/${result.token}` : "")
      const absoluteUrl = path.startsWith("http") ? path : `${window.location.origin}${path}`
      setInviteUrl(absoluteUrl)
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
          <TabsTrigger value="search" className={tabClassName}>Search territory ZIPs</TabsTrigger>
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
              <CardDescription>Update the congregation name and its address in Search Helper.</CardDescription>
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
              <CardDescription className="mt-2">Memberships and roles are managed only inside this congregation.</CardDescription>
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
          <CardContent>
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
          </CardContent>
        </Card>
      </TabsContent>

      <TabsContent value="search">
        <form onSubmit={saveSettings}>
          <Card className="admin-card rounded-2xl">
            <CardHeader>
              <CardTitle className="text-base font-semibold">Search territory ZIPs</CardTitle>
              <CardDescription>Contacts outside these ZIP codes are excluded from congregation search results.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="search-zipcodes">ZIP codes</Label>
                <Textarea id="search-zipcodes" value={searchZipcodes} onChange={(event) => setSearchZipcodes(event.target.value)} className="min-h-40 rounded-xl font-mono text-sm" placeholder="22301&#10;22302&#10;22304" />
                <p className="text-xs font-normal text-muted-foreground">Enter one ZIP code per line, or separate them with commas.</p>
              </div>
              <Button type="submit" disabled={saving} className="admin-primary-button min-h-11 rounded-xl">
                {saving ? <Loader2 className="animate-spin" aria-hidden="true" /> : <Save aria-hidden="true" />}
                Save ZIP coverage
              </Button>
            </CardContent>
          </Card>
        </form>
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
