"use client"

import { FormEvent, useEffect, useState } from "react"
import { Check, KeyRound, Loader2, Moon, Save, Search, Sun, UserRound, UsersRound } from "lucide-react"
import { useTheme } from "next-themes"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { cn } from "@/lib/utils"

type PersonalSettingsProps = {
  slug: string
  email: string
  displayName: string
  congregationDisplayName: string
  hasMembership: boolean
  initialTheme: "light" | "dark"
  initialDefaultWorkspaceView: "search" | "team"
}

const tabClassName = "min-h-11 rounded-lg px-4 text-sm data-[state=active]:shadow-sm"
const choiceClassName = "flex min-h-11 items-center gap-3 rounded-xl border px-4 text-left text-sm font-medium transition-all duration-150 ease-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"

export function PersonalSettings({
  slug,
  email,
  displayName: initialDisplayName,
  congregationDisplayName: initialCongregationDisplayName,
  hasMembership,
  initialTheme,
  initialDefaultWorkspaceView,
}: PersonalSettingsProps) {
  const { setTheme } = useTheme()
  const [displayName, setDisplayName] = useState(initialDisplayName)
  const [congregationDisplayName, setCongregationDisplayName] = useState(initialCongregationDisplayName)
  const [preferredTheme, setPreferredTheme] = useState<"light" | "dark">(initialTheme)
  const [defaultWorkspaceView, setDefaultWorkspaceView] = useState<"search" | "team">(initialDefaultWorkspaceView)
  const [savingProfile, setSavingProfile] = useState(false)
  const [savingPreferences, setSavingPreferences] = useState(false)
  const [changingPassword, setChangingPassword] = useState(false)
  const [currentPassword, setCurrentPassword] = useState("")
  const [newPassword, setNewPassword] = useState("")
  const [confirmPassword, setConfirmPassword] = useState("")

  useEffect(() => {
    setTheme(initialTheme)
  }, [initialTheme, setTheme])

  async function updateProfile(event: FormEvent) {
    event.preventDefault()
    setSavingProfile(true)
    try {
      const response = await fetch(`/api/c/${slug}/profile`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          displayName: displayName.trim(),
          ...(hasMembership ? { congregationDisplayName: congregationDisplayName.trim() } : {}),
        }),
      })
      const result = await response.json().catch(() => null)
      if (!response.ok) throw new Error(result?.error ?? "Profile could not be saved")
      toast.success("Profile saved")
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Profile could not be saved")
    } finally {
      setSavingProfile(false)
    }
  }

  async function updatePreferences(event: FormEvent) {
    event.preventDefault()
    setSavingPreferences(true)
    try {
      const response = await fetch(`/api/c/${slug}/profile`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ preferences: { theme: preferredTheme, defaultWorkspaceView } }),
      })
      const result = await response.json().catch(() => null)
      if (!response.ok) throw new Error(result?.error ?? "Preferences could not be saved")
      setTheme(preferredTheme)
      toast.success("Preferences saved")
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Preferences could not be saved")
    } finally {
      setSavingPreferences(false)
    }
  }

  async function updatePassword(event: FormEvent) {
    event.preventDefault()
    if (newPassword !== confirmPassword) {
      toast.error("New passwords do not match")
      return
    }
    setChangingPassword(true)
    try {
      const response = await fetch("/api/auth/password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ currentPassword, newPassword }),
      })
      const result = await response.json().catch(() => null)
      if (!response.ok) throw new Error(result?.error ?? "Password could not be changed")
      setCurrentPassword("")
      setNewPassword("")
      setConfirmPassword("")
      toast.success("Password changed")
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Password could not be changed")
    } finally {
      setChangingPassword(false)
    }
  }

  return (
    <Tabs defaultValue="profile" className="space-y-6">
      <div className="overflow-x-auto pb-1">
        <TabsList className="h-auto min-w-max rounded-xl p-1">
          <TabsTrigger value="profile" className={tabClassName}>Profile</TabsTrigger>
          <TabsTrigger value="preferences" className={tabClassName}>Preferences</TabsTrigger>
          <TabsTrigger value="password" className={tabClassName}>Password</TabsTrigger>
        </TabsList>
      </div>

      <TabsContent value="profile">
        <form onSubmit={updateProfile}>
          <Card className="admin-card rounded-2xl">
            <CardHeader>
              <div className="admin-icon-well mb-2 flex h-10 w-10 items-center justify-center rounded-xl text-primary">
                <UserRound className="h-5 w-5" aria-hidden="true" />
              </div>
              <CardTitle className="text-base font-semibold">Your profile</CardTitle>
              <CardDescription>Your account name is shared across workspaces. Your congregation name can be different.</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-6 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="account-display-name">Account name</Label>
                <Input id="account-display-name" value={displayName} onChange={(event) => setDisplayName(event.target.value)} className="h-11 rounded-xl" minLength={2} maxLength={80} required />
              </div>
              <div className="space-y-2">
                <Label htmlFor="congregation-display-name">Name in this congregation</Label>
                <Input id="congregation-display-name" value={congregationDisplayName} onChange={(event) => setCongregationDisplayName(event.target.value)} className="h-11 rounded-xl" minLength={2} maxLength={80} disabled={!hasMembership} required={hasMembership} />
              </div>
              <div className="space-y-2 sm:col-span-2">
                <Label htmlFor="account-email">Email</Label>
                <Input id="account-email" value={email} className="h-11 rounded-xl bg-muted" readOnly aria-describedby="account-email-help" />
                <p id="account-email-help" className="text-xs font-normal text-muted-foreground">Email changes require help from a platform owner.</p>
              </div>
              <div className="sm:col-span-2">
                <Button type="submit" disabled={savingProfile} className="admin-primary-button min-h-11 rounded-xl">
                  {savingProfile ? <Loader2 className="animate-spin" aria-hidden="true" /> : <Save aria-hidden="true" />}
                  Save profile
                </Button>
              </div>
            </CardContent>
          </Card>
        </form>
      </TabsContent>

      <TabsContent value="preferences">
        <form onSubmit={updatePreferences}>
          <Card className="admin-card rounded-2xl">
            <CardHeader>
              <CardTitle className="text-base font-semibold">Preferences</CardTitle>
              <CardDescription>Choose how Search Helper looks and where congregation links open.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-8">
              <fieldset className="space-y-3">
                <legend className="text-sm font-medium">Appearance</legend>
                <div className="grid gap-3 sm:grid-cols-2">
                  {(["light", "dark"] as const).map((theme) => (
                    <button key={theme} type="button" aria-pressed={preferredTheme === theme} onClick={() => setPreferredTheme(theme)} className={cn(choiceClassName, preferredTheme === theme ? "border-primary bg-primary/10 text-primary" : "hover:bg-muted")}>
                      {theme === "light" ? <Sun className="h-5 w-5" aria-hidden="true" /> : <Moon className="h-5 w-5" aria-hidden="true" />}
                      <span className="flex-1 capitalize">{theme}</span>
                      {preferredTheme === theme ? <Check className="h-4 w-4" aria-hidden="true" /> : null}
                    </button>
                  ))}
                </div>
              </fieldset>

              <fieldset className="space-y-3">
                <legend className="text-sm font-medium">Default workspace page</legend>
                <div className="grid gap-3 sm:grid-cols-2">
                  {(["search", "team"] as const).map((view) => (
                    <button key={view} type="button" aria-pressed={defaultWorkspaceView === view} onClick={() => setDefaultWorkspaceView(view)} className={cn(choiceClassName, defaultWorkspaceView === view ? "border-primary bg-primary/10 text-primary" : "hover:bg-muted")}>
                      {view === "search" ? <Search className="h-5 w-5" aria-hidden="true" /> : <UsersRound className="h-5 w-5" aria-hidden="true" />}
                      <span className="flex-1">{view === "search" ? "Search" : "Team Progress"}</span>
                      {defaultWorkspaceView === view ? <Check className="h-4 w-4" aria-hidden="true" /> : null}
                    </button>
                  ))}
                </div>
              </fieldset>

              <Button type="submit" disabled={savingPreferences} className="admin-primary-button min-h-11 rounded-xl">
                {savingPreferences ? <Loader2 className="animate-spin" aria-hidden="true" /> : <Save aria-hidden="true" />}
                Save preferences
              </Button>
            </CardContent>
          </Card>
        </form>
      </TabsContent>

      <TabsContent value="password">
        <form onSubmit={updatePassword}>
          <Card className="admin-card rounded-2xl">
            <CardHeader>
              <div className="admin-icon-well mb-2 flex h-10 w-10 items-center justify-center rounded-xl text-primary">
                <KeyRound className="h-5 w-5" aria-hidden="true" />
              </div>
              <CardTitle className="text-base font-semibold">Change password</CardTitle>
              <CardDescription>Use at least 10 characters. Changing your password does not sign out your current device.</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-6 sm:grid-cols-2">
              <div className="space-y-2 sm:col-span-2">
                <Label htmlFor="current-password">Current password</Label>
                <Input id="current-password" type="password" autoComplete="current-password" value={currentPassword} onChange={(event) => setCurrentPassword(event.target.value)} className="h-11 rounded-xl" required />
              </div>
              <div className="space-y-2">
                <Label htmlFor="new-password">New password</Label>
                <Input id="new-password" type="password" autoComplete="new-password" value={newPassword} onChange={(event) => setNewPassword(event.target.value)} className="h-11 rounded-xl" minLength={10} required />
              </div>
              <div className="space-y-2">
                <Label htmlFor="confirm-password">Confirm new password</Label>
                <Input id="confirm-password" type="password" autoComplete="new-password" value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} className="h-11 rounded-xl" minLength={10} required />
              </div>
              <div className="sm:col-span-2">
                <Button type="submit" disabled={changingPassword} className="admin-primary-button min-h-11 rounded-xl">
                  {changingPassword ? <Loader2 className="animate-spin" aria-hidden="true" /> : <KeyRound aria-hidden="true" />}
                  Change password
                </Button>
              </div>
            </CardContent>
          </Card>
        </form>
      </TabsContent>
    </Tabs>
  )
}
