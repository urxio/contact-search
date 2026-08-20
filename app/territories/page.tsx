"use client"

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { ArrowLeft, CheckCircle2, Circle, Clock3, MapPin, Plus, UserCircle } from "lucide-react"
import { ThemeSwitcher } from "@/components/theme-switcher"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { ProgressBar } from "@/components/ui/progress"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { toast } from "sonner"

type ZipcodeRow = {
  id: number
  city: string
  zipcode: string
  total_pages: number
  territory: string
  segment_count: number
  completed: number
  in_progress: number
  not_started: number
}

type Segment = {
  id: number
  zipcode: string
  city: string
  page_start: number
  page_end: number | null
  status: string
  updated_at: string
}

function percent(done: number, total: number) {
  return total ? Math.round((done / total) * 100) : 0
}

export default function TerritoriesPage() {
  const [zipcodes, setZipcodes] = useState<ZipcodeRow[]>([])
  const [mySegments, setMySegments] = useState<Segment[]>([])
  const [knownUsers, setKnownUsers] = useState<string[]>([])
  const [userName, setUserName] = useState("")
  const [activeTerritory, setActiveTerritory] = useState("")
  const [loading, setLoading] = useState(true)
  const [showUser, setShowUser] = useState(false)
  const [showAdd, setShowAdd] = useState(false)
  const [newUser, setNewUser] = useState("")
  const [form, setForm] = useState({ city: "", zipcode: "", total_pages: "", territory: "" })

  const loadDashboard = useCallback(async () => {
    try {
      const [zipResponse, userResponse] = await Promise.all([
        fetch("/api/territories/zipcodes"),
        fetch("/api/territories/users"),
      ])
      const zipData = await zipResponse.json()
      const userData = await userResponse.json()
      if (!zipResponse.ok) throw new Error(zipData.error ?? "Could not load territories.")
      setZipcodes(zipData)
      setKnownUsers(Array.isArray(userData) ? userData : [])
      setActiveTerritory(current => current || zipData[0]?.territory || "")
    } catch (error: any) {
      toast.error(error.message)
    } finally {
      setLoading(false)
    }
  }, [])

  const loadMySegments = useCallback(async (owner: string) => {
    if (!owner) return setMySegments([])
    const response = await fetch(`/api/territories/segments/mine?owner=${encodeURIComponent(owner)}`)
    if (response.ok) setMySegments(await response.json())
  }, [])

  useEffect(() => {
    const savedUser = localStorage.getItem("userId") ?? ""
    setUserName(savedUser)
    if (!savedUser) setShowUser(true)
    loadDashboard()
    loadMySegments(savedUser)
  }, [loadDashboard, loadMySegments])

  const chooseUser = async (name: string) => {
    const normalized = name.trim()
    if (!normalized) return
    localStorage.setItem("userId", normalized)
    setUserName(normalized)
    setShowUser(false)
    setNewUser("")
    await fetch("/api/territories/users", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: normalized }),
    })
    if (!knownUsers.includes(normalized)) setKnownUsers(users => [...users, normalized].sort())
    loadMySegments(normalized)
  }

  const addZipcode = async (event: FormEvent) => {
    event.preventDefault()
    const response = await fetch("/api/territories/zipcodes", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...form, territory: form.territory || activeTerritory || "Lacy Boulevard" }),
    })
    const data = await response.json()
    if (!response.ok) return toast.error(data.error ?? "Could not add zipcode.")
    toast.success(`${data.zipcode} added`)
    setForm({ city: "", zipcode: "", total_pages: "", territory: "" })
    setShowAdd(false)
    await loadDashboard()
    setActiveTerritory(data.territory)
  }

  const grouped = useMemo(() => {
    return zipcodes.reduce<Record<string, Record<string, ZipcodeRow[]>>>((territories, zipcode) => {
      territories[zipcode.territory] ??= {}
      territories[zipcode.territory][zipcode.city] ??= []
      territories[zipcode.territory][zipcode.city].push(zipcode)
      return territories
    }, {})
  }, [zipcodes])

  const territoryRows = activeTerritory ? Object.values(grouped[activeTerritory] ?? {}).flat() : []
  const totalSegments = territoryRows.reduce((sum, row) => sum + row.segment_count, 0)
  const completed = territoryRows.reduce((sum, row) => sum + row.completed, 0)
  const inProgress = territoryRows.reduce((sum, row) => sum + row.in_progress, 0)

  return (
    <div className="min-h-screen bg-muted/30">
      <header className="sticky top-0 z-30 border-b bg-background/90 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-4">
          <div className="flex items-center gap-3">
            <Button asChild variant="ghost" size="sm"><Link href="/"><ArrowLeft className="mr-1 h-4 w-4" /> OTM Helper</Link></Button>
            <div className="hidden h-5 w-px bg-border sm:block" />
            <div className="flex items-center gap-2 font-semibold"><MapPin className="h-5 w-5 text-indigo-600" /> Territory Tracker</div>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => setShowUser(true)}>
              <UserCircle className="mr-1 h-4 w-4" /> {userName || "Choose user"}
            </Button>
            <ThemeSwitcher />
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl space-y-7 px-4 py-8">
        <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
          <div>
            <p className="text-sm font-medium text-indigo-600">Shared territory workspace</p>
            <h1 className="text-3xl font-bold tracking-tight">Zipcode progress</h1>
            <p className="mt-1 text-muted-foreground">Claim page ranges and keep the congregation’s work coordinated.</p>
          </div>
          <Button onClick={() => setShowAdd(true)}><Plus className="mr-2 h-4 w-4" /> Add zipcode</Button>
        </div>

        {mySegments.length > 0 && (
          <Card>
            <CardHeader className="pb-3"><CardTitle className="text-base">Your segments</CardTitle></CardHeader>
            <CardContent className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {mySegments.slice(0, 6).map(segment => (
                <Link key={segment.id} href={`/territories/${segment.zipcode}`} className="rounded-xl border p-3 transition-colors hover:bg-muted/60">
                  <div className="flex items-center justify-between">
                    <span className="font-semibold">{segment.zipcode} · {segment.page_start}{segment.page_end ? `–${segment.page_end}` : "+"}</span>
                    <span className="text-xs text-muted-foreground">{segment.status}</span>
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">{segment.city}</p>
                </Link>
              ))}
            </CardContent>
          </Card>
        )}

        {Object.keys(grouped).length > 0 && (
          <div className="flex flex-wrap gap-2">
            {Object.keys(grouped).map(territory => (
              <Button key={territory} size="sm" variant={territory === activeTerritory ? "default" : "outline"} onClick={() => setActiveTerritory(territory)}>
                {territory}
              </Button>
            ))}
          </div>
        )}

        {!loading && territoryRows.length > 0 && (
          <Card>
            <CardContent className="pt-6">
              <div className="mb-3 flex items-center justify-between"><span className="font-semibold">Overall progress</span><span className="font-bold text-indigo-600">{percent(completed, totalSegments)}%</span></div>
              <ProgressBar value={percent(completed, totalSegments)} max={100} />
              <div className="mt-4 flex flex-wrap gap-5 text-sm text-muted-foreground">
                <span className="flex items-center gap-1"><CheckCircle2 className="h-4 w-4 text-green-600" /> {completed} completed</span>
                <span className="flex items-center gap-1"><Clock3 className="h-4 w-4 text-amber-500" /> {inProgress} in progress</span>
                <span className="flex items-center gap-1"><Circle className="h-4 w-4" /> {Math.max(totalSegments - completed - inProgress, 0)} not started</span>
              </div>
            </CardContent>
          </Card>
        )}

        {loading ? (
          <p className="py-16 text-center text-muted-foreground">Loading territories…</p>
        ) : territoryRows.length === 0 ? (
          <Card><CardContent className="py-16 text-center"><MapPin className="mx-auto mb-3 h-9 w-9 text-muted-foreground" /><p className="font-semibold">No zipcodes yet</p><p className="mt-1 text-sm text-muted-foreground">Add the first zipcode to begin tracking page ranges.</p></CardContent></Card>
        ) : (
          <div className="space-y-7">
            {Object.entries(grouped[activeTerritory] ?? {}).map(([city, rows]) => (
              <section key={city}>
                <h2 className="mb-3 text-sm font-bold uppercase tracking-widest text-muted-foreground">{city}</h2>
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  {rows.map(row => {
                    const value = percent(row.completed, row.segment_count)
                    return (
                      <Link key={row.id} href={`/territories/${row.zipcode}`}>
                        <Card className="h-full transition-all hover:-translate-y-0.5 hover:border-indigo-300 hover:shadow-md">
                          <CardContent className="pt-6">
                            <div className="mb-4 flex items-start justify-between"><div><p className="text-xl font-bold">{row.zipcode}</p><p className="text-sm text-muted-foreground">{row.total_pages.toLocaleString()} pages</p></div><span className="rounded-full bg-indigo-50 px-2 py-1 text-xs font-semibold text-indigo-700 dark:bg-indigo-950 dark:text-indigo-300">{row.segment_count ? `${value}%` : "Open"}</span></div>
                            <ProgressBar value={value} max={100} className="h-2" />
                            <p className="mt-3 text-xs text-muted-foreground">{row.segment_count} segment{row.segment_count === 1 ? "" : "s"} · {row.in_progress} active</p>
                          </CardContent>
                        </Card>
                      </Link>
                    )
                  })}
                </div>
              </section>
            ))}
          </div>
        )}
      </main>

      <Dialog open={showUser} onOpenChange={setShowUser}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader><DialogTitle>Who are you?</DialogTitle><DialogDescription>The same name is used in OTM Helper and Territory Tracker.</DialogDescription></DialogHeader>
          {knownUsers.length > 0 && <Select onValueChange={chooseUser}><SelectTrigger><SelectValue placeholder="Select an existing user" /></SelectTrigger><SelectContent>{knownUsers.map(name => <SelectItem key={name} value={name}>{name}</SelectItem>)}</SelectContent></Select>}
          <div className="flex gap-2"><Input value={newUser} onChange={event => setNewUser(event.target.value)} onKeyDown={event => event.key === "Enter" && chooseUser(newUser)} placeholder="Or enter a new name" /><Button onClick={() => chooseUser(newUser)} disabled={!newUser.trim()}>Continue</Button></div>
        </DialogContent>
      </Dialog>

      <Dialog open={showAdd} onOpenChange={setShowAdd}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader><DialogTitle>Add a zipcode</DialogTitle><DialogDescription>Create an area where users can claim page ranges.</DialogDescription></DialogHeader>
          <form onSubmit={addZipcode} className="space-y-4">
            <div className="space-y-2"><Label htmlFor="territory">Territory</Label><Input id="territory" value={form.territory} onChange={event => setForm({ ...form, territory: event.target.value })} placeholder={activeTerritory || "Lacy Boulevard"} /></div>
            <div className="space-y-2"><Label htmlFor="city">City</Label><Input id="city" required value={form.city} onChange={event => setForm({ ...form, city: event.target.value })} /></div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2"><Label htmlFor="zipcode">Zipcode</Label><Input id="zipcode" required inputMode="numeric" maxLength={5} value={form.zipcode} onChange={event => setForm({ ...form, zipcode: event.target.value })} /></div>
              <div className="space-y-2"><Label htmlFor="pages">Total A–Z pages</Label><Input id="pages" required type="number" min="1" value={form.total_pages} onChange={event => setForm({ ...form, total_pages: event.target.value })} /></div>
            </div>
            <Button type="submit" className="w-full">Add zipcode</Button>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  )
}
