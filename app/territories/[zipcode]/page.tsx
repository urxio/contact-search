"use client"

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { ArrowLeft, MapPin, Pencil, Plus, Trash2 } from "lucide-react"
import { ThemeSwitcher } from "@/components/theme-switcher"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { ProgressBar } from "@/components/ui/progress"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import { toast } from "sonner"

type ZipcodeInfo = { city: string; zipcode: string; total_pages: number; territory: string }
type Segment = {
  id: number
  page_start: number
  page_end: number | null
  owner: string
  stopped_at_page: number | null
  status: "Completed" | "In progress" | "Not started"
  notes: string
  updated_at: string
}
type Edit = { page_start: string; page_end: string; stopped_at_page: string; status: Segment["status"]; notes: string }

const STATUS_CLASSES: Record<Segment["status"], string> = {
  Completed: "bg-green-100 text-green-700 dark:bg-green-950 dark:text-green-300",
  "In progress": "bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300",
  "Not started": "bg-muted text-muted-foreground",
}

export default function ZipcodePage({ params }: { params: { zipcode: string } }) {
  const zipcode = decodeURIComponent(params.zipcode)
  const [info, setInfo] = useState<ZipcodeInfo | null>(null)
  const [segments, setSegments] = useState<Segment[]>([])
  const [userName, setUserName] = useState("")
  const [loading, setLoading] = useState(true)
  const [claim, setClaim] = useState({ page_start: "", page_end: "" })
  const [editing, setEditing] = useState<Record<number, Edit>>({})
  const [saving, setSaving] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    const response = await fetch(`/api/territories/segments?zipcode=${encodeURIComponent(zipcode)}`)
    const data = await response.json()
    if (response.ok) {
      setInfo(data.zipcode)
      setSegments(data.segments)
    } else toast.error(data.error ?? "Could not load zipcode.")
    setLoading(false)
  }, [zipcode])

  useEffect(() => {
    setUserName(localStorage.getItem("userId") ?? "")
    load()
  }, [load])

  const submitClaim = async (event: FormEvent) => {
    event.preventDefault()
    if (!userName) return toast.error("Choose your name on the territory dashboard first.")
    setSaving(true)
    const response = await fetch("/api/territories/segments", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ zipcode, owner: userName, ...claim }),
    })
    const data = await response.json()
    setSaving(false)
    if (!response.ok) return toast.error(data.error ?? "Could not claim pages.")
    setClaim({ page_start: "", page_end: "" })
    toast.success("Page range claimed")
    load()
  }

  const startEdit = (segment: Segment) => setEditing(current => ({
    ...current,
    [segment.id]: {
      page_start: String(segment.page_start),
      page_end: segment.page_end ? String(segment.page_end) : "",
      stopped_at_page: segment.stopped_at_page ? String(segment.stopped_at_page) : "",
      status: segment.status,
      notes: segment.notes,
    },
  }))

  const cancelEdit = (id: number) => setEditing(current => {
    const next = { ...current }
    delete next[id]
    return next
  })

  const saveEdit = async (id: number) => {
    const edit = editing[id]
    if (!edit) return
    setSaving(true)
    const response = await fetch("/api/territories/segments", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, ...edit }),
    })
    const data = await response.json()
    setSaving(false)
    if (!response.ok) return toast.error(data.error ?? "Could not update segment.")
    cancelEdit(id)
    toast.success("Progress updated")
    load()
  }

  const deleteSegment = async (id: number) => {
    if (!window.confirm("Delete this page range?")) return
    const response = await fetch(`/api/territories/segments?id=${id}`, { method: "DELETE" })
    if (!response.ok) return toast.error("Could not delete segment.")
    load()
  }

  const counts = useMemo(() => ({
    completed: segments.filter(segment => segment.status === "Completed").length,
    active: segments.filter(segment => segment.status === "In progress").length,
  }), [segments])
  const progress = segments.length ? Math.round((counts.completed / segments.length) * 100) : 0

  return (
    <div className="min-h-screen bg-muted/30">
      <header className="sticky top-0 z-30 border-b bg-background/90 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-5xl items-center justify-between px-4">
          <div className="flex items-center gap-3">
            <Button asChild variant="ghost" size="sm"><Link href="/territories"><ArrowLeft className="mr-1 h-4 w-4" /> Territories</Link></Button>
            <div className="hidden items-center gap-2 font-semibold sm:flex"><MapPin className="h-4 w-4 text-indigo-600" /> {info ? `${info.city} ${zipcode}` : zipcode}</div>
          </div>
          <div className="flex items-center gap-3"><span className="text-sm text-muted-foreground">{userName || "No user selected"}</span><ThemeSwitcher /></div>
        </div>
      </header>

      <main className="mx-auto max-w-5xl space-y-6 px-4 py-8">
        {loading ? <p className="py-20 text-center text-muted-foreground">Loading page ranges…</p> : !info ? <p className="py-20 text-center text-muted-foreground">Zipcode not found.</p> : <>
          <div>
            <p className="text-sm font-medium text-indigo-600">{info.territory}</p>
            <h1 className="text-3xl font-bold tracking-tight">{info.city} — {zipcode}</h1>
            <p className="mt-1 text-muted-foreground">{info.total_pages.toLocaleString()} total pages in A–Z</p>
          </div>

          <Card>
            <CardContent className="pt-6">
              <div className="mb-3 flex justify-between"><span className="font-semibold">Segment progress</span><span className="font-bold text-indigo-600">{progress}% complete</span></div>
              <ProgressBar value={progress} max={100} />
              <p className="mt-3 text-sm text-muted-foreground">{counts.completed} completed · {counts.active} in progress · {segments.length - counts.completed - counts.active} not started</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle className="text-base">Claim a page range</CardTitle></CardHeader>
            <CardContent>
              <form onSubmit={submitClaim} className="flex flex-col gap-3 sm:flex-row sm:items-end">
                <div className="flex-1 space-y-2"><Label htmlFor="start">Start page</Label><Input id="start" required type="number" min="1" value={claim.page_start} onChange={event => setClaim({ ...claim, page_start: event.target.value })} /></div>
                <div className="flex-1 space-y-2"><Label htmlFor="end">End page (optional)</Label><Input id="end" type="number" min="1" value={claim.page_end} onChange={event => setClaim({ ...claim, page_end: event.target.value })} /></div>
                <Button type="submit" disabled={saving || !userName}><Plus className="mr-2 h-4 w-4" /> Claim pages</Button>
              </form>
              {!userName && <p className="mt-3 text-sm text-amber-600">Return to the territory dashboard and choose your name before claiming pages.</p>}
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle className="text-base">Claimed segments ({segments.length})</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              {segments.length === 0 && <p className="py-8 text-center text-muted-foreground">No page ranges have been claimed yet.</p>}
              {segments.map(segment => {
                const owned = !!userName && segment.owner.trim().toLowerCase() === userName.trim().toLowerCase()
                const edit = editing[segment.id]
                return (
                  <div key={segment.id} className={`rounded-xl border p-4 ${owned ? "border-indigo-200 bg-indigo-50/50 dark:border-indigo-900 dark:bg-indigo-950/20" : "bg-background"}`}>
                    {edit ? (
                      <div className="space-y-3">
                        <div className="grid gap-3 sm:grid-cols-4">
                          <div className="space-y-1"><Label>Start</Label><Input type="number" value={edit.page_start} onChange={event => setEditing({ ...editing, [segment.id]: { ...edit, page_start: event.target.value } })} /></div>
                          <div className="space-y-1"><Label>End</Label><Input type="number" value={edit.page_end} onChange={event => setEditing({ ...editing, [segment.id]: { ...edit, page_end: event.target.value } })} /></div>
                          <div className="space-y-1"><Label>Stopped at</Label><Input type="number" value={edit.stopped_at_page} onChange={event => setEditing({ ...editing, [segment.id]: { ...edit, stopped_at_page: event.target.value } })} /></div>
                          <div className="space-y-1"><Label>Status</Label><Select value={edit.status} onValueChange={(status: Segment["status"]) => setEditing({ ...editing, [segment.id]: { ...edit, status } })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="Not started">Not started</SelectItem><SelectItem value="In progress">In progress</SelectItem><SelectItem value="Completed">Completed</SelectItem></SelectContent></Select></div>
                        </div>
                        <Textarea placeholder="Notes" value={edit.notes} onChange={event => setEditing({ ...editing, [segment.id]: { ...edit, notes: event.target.value } })} />
                        <div className="flex gap-2"><Button size="sm" onClick={() => saveEdit(segment.id)} disabled={saving}>Save</Button><Button size="sm" variant="outline" onClick={() => cancelEdit(segment.id)}>Cancel</Button></div>
                      </div>
                    ) : (
                      <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
                        <div><div className="flex flex-wrap items-center gap-2"><span className="font-semibold">Pages {segment.page_start}{segment.page_end ? `–${segment.page_end}` : "+"}</span><span className={`rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_CLASSES[segment.status]}`}>{segment.status}</span>{owned && <span className="text-xs font-semibold text-indigo-600">Yours</span>}</div><p className="mt-1 text-sm text-muted-foreground">{segment.owner}{segment.stopped_at_page ? ` · stopped at page ${segment.stopped_at_page}` : ""}</p>{segment.notes && <p className="mt-2 text-sm">{segment.notes}</p>}</div>
                        {owned && <div className="flex gap-2"><Button size="sm" variant="outline" onClick={() => startEdit(segment)}><Pencil className="mr-1 h-3.5 w-3.5" /> Update</Button><Button size="sm" variant="outline" className="text-destructive" onClick={() => deleteSegment(segment.id)}><Trash2 className="h-3.5 w-3.5" /></Button></div>}
                      </div>
                    )}
                  </div>
                )
              })}
            </CardContent>
          </Card>
        </>}
      </main>
    </div>
  )
}
