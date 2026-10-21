"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import {
  CheckCircle2, FileUp, Flag, FolderOpen, Hand, MapPinPlus, RefreshCw, Send, Undo2, UserPlus, UserRoundCheck, type LucideIcon,
} from "lucide-react"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Skeleton } from "@/components/ui/skeleton"
import type { ActivityFilter, ActivityKind } from "@/lib/admin-activity"
import { cn } from "@/lib/utils"

type ActivityEvent = {
  id: string
  at: string
  kind: ActivityKind
  actor: { id: number | null; name: string }
  targetName: string | null
  packageName: string | null
  zipcode: string | null
  city: string | null
  pageStart: number | null
  pageEnd: number | null
  pageRange: string | null
  contactCount: number | null
  status: string | null
  firstInZip: boolean
}

type Member = { userId: number; displayName: string; congregationDisplayName?: string | null; status: string }

const FILTERS: Array<[ActivityFilter, string]> = [
  ["all", "All"], ["claims", "Claims"], ["completed", "Completed"], ["uploads", "Uploads"], ["submissions", "Submissions"], ["members", "Members"],
]

const KIND_STYLE: Record<ActivityKind, { icon: LucideIcon; tone: string }> = {
  joined: { icon: UserPlus, tone: "bg-violet-100 text-violet-700 dark:bg-violet-950/60 dark:text-violet-300" },
  uploaded: { icon: FileUp, tone: "bg-sky-100 text-sky-700 dark:bg-sky-950/60 dark:text-sky-300" },
  uploaded_claimed: { icon: FileUp, tone: "bg-blue-100 text-blue-700 dark:bg-blue-950/60 dark:text-blue-300" },
  claimed: { icon: Hand, tone: "bg-blue-100 text-blue-700 dark:bg-blue-950/60 dark:text-blue-300" },
  claimed_pages: { icon: Hand, tone: "bg-blue-100 text-blue-700 dark:bg-blue-950/60 dark:text-blue-300" },
  opened: { icon: FolderOpen, tone: "bg-muted text-muted-foreground" },
  assigned: { icon: UserRoundCheck, tone: "bg-indigo-100 text-indigo-700 dark:bg-indigo-950/60 dark:text-indigo-300" },
  released: { icon: Undo2, tone: "bg-muted text-muted-foreground" },
  completed: { icon: CheckCircle2, tone: "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300" },
  status: { icon: Flag, tone: "bg-amber-100 text-amber-700 dark:bg-amber-950/60 dark:text-amber-300" },
  submitted: { icon: Send, tone: "bg-teal-100 text-teal-700 dark:bg-teal-950/60 dark:text-teal-300" },
  zip_added: { icon: MapPinPlus, tone: "bg-orange-100 text-orange-700 dark:bg-orange-950/60 dark:text-orange-300" },
}

const number = new Intl.NumberFormat()
const time = new Intl.DateTimeFormat(undefined, { hour: "numeric", minute: "2-digit" })
const day = new Intl.DateTimeFormat(undefined, { weekday: "long", month: "long", day: "numeric" })

function dayLabel(iso: string) {
  const date = new Date(iso)
  const today = new Date()
  const yesterday = new Date()
  yesterday.setDate(today.getDate() - 1)
  if (date.toDateString() === today.toDateString()) return "Today"
  if (date.toDateString() === yesterday.toDateString()) return "Yesterday"
  return day.format(date)
}

function Place({ event }: { event: ActivityEvent }) {
  if (!event.zipcode) return <span>an Excel</span>
  const pages = event.pageStart != null && event.pageEnd != null
    ? event.pageStart === event.pageEnd ? `page ${event.pageStart}` : `pages ${event.pageStart}–${event.pageEnd}`
    : null
  return (
    <span>
      <span className="font-medium text-foreground">ZIP {event.zipcode}</span>
      {event.city ? ` (${event.city})` : ""}
      {pages ? `, ${pages}` : ""}
    </span>
  )
}

function Sentence({ event }: { event: ActivityEvent }) {
  const actor = <span className="font-semibold text-foreground">{event.actor.name}</span>
  switch (event.kind) {
    case "joined": return <>{actor} joined the congregation</>
    case "uploaded": return <>{actor} uploaded an Excel for <Place event={event} /></>
    case "uploaded_claimed": return <>{actor} uploaded and started <Place event={event} /></>
    case "claimed": return <>{actor} claimed <Place event={event} /></>
    case "claimed_pages": return <>{actor} claimed <Place event={event} /> in Team Progress</>
    case "opened": return <>{actor} opened their Excel for <Place event={event} /></>
    case "assigned": return <>{actor} assigned <Place event={event} /> to <span className="font-semibold text-foreground">{event.targetName ?? "a member"}</span></>
    case "released": return <>{actor} released <Place event={event} /></>
    case "completed": return <>{actor} completed <Place event={event} /></>
    case "status": return <>{actor} marked <Place event={event} /> as {event.status?.toLocaleLowerCase()}</>
    case "submitted": return (
      <>{actor} submitted {event.contactCount != null ? `${number.format(event.contactCount)} contacts` : "contacts"} for review
        {event.zipcode ? <> · <span className="font-medium text-foreground">ZIP {event.zipcode}</span>{event.pageRange ? `, pages ${event.pageRange}` : ""}</> : null}</>
    )
    case "zip_added": return <>{actor} added <Place event={event} /></>
  }
}

export function AdminActivity({ slug }: { slug: string }) {
  const [filter, setFilter] = useState<ActivityFilter>("all")
  const [member, setMember] = useState("all")
  const [members, setMembers] = useState<Member[]>([])
  const [events, setEvents] = useState<ActivityEvent[] | null>(null)
  const [nextCursor, setNextCursor] = useState<string | null>(null)
  const [loadingMore, setLoadingMore] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const request = useRef(0)

  const fetchPage = useCallback(async (cursor: string | null) => {
    const params = new URLSearchParams({ filter })
    if (member !== "all") params.set("member", member)
    if (cursor) params.set("cursor", cursor)
    const response = await fetch(`/api/c/${encodeURIComponent(slug)}/admin/activity?${params}`, { cache: "no-store" })
    const result = await response.json()
    if (!response.ok) throw new Error(result.error || "Unable to load activity")
    return result as { events: ActivityEvent[]; nextCursor: string | null }
  }, [filter, member, slug])

  const reload = useCallback(async () => {
    const id = ++request.current
    setEvents(null)
    setError(null)
    try {
      const page = await fetchPage(null)
      if (id !== request.current) return
      setEvents(page.events)
      setNextCursor(page.nextCursor)
    } catch (loadError) {
      if (id === request.current) setError(loadError instanceof Error ? loadError.message : "Unable to load activity")
    }
  }, [fetchPage])

  useEffect(() => { void reload() }, [reload])

  useEffect(() => {
    fetch(`/api/c/${encodeURIComponent(slug)}/members`, { cache: "no-store" })
      .then((response) => response.ok ? response.json() : { members: [] })
      .then((result) => setMembers((result.members ?? []).filter((item: Member) => item.status === "active")))
      .catch(() => setMembers([]))
  }, [slug])

  async function loadMore() {
    if (!nextCursor) return
    const id = request.current
    setLoadingMore(true)
    try {
      const page = await fetchPage(nextCursor)
      if (id !== request.current) return
      setEvents((current) => [...(current ?? []), ...page.events])
      setNextCursor(page.nextCursor)
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Unable to load activity")
    } finally {
      setLoadingMore(false)
    }
  }

  const days = useMemo(() => {
    const groups: Array<{ label: string; events: ActivityEvent[] }> = []
    for (const event of events ?? []) {
      const label = dayLabel(event.at)
      if (groups[groups.length - 1]?.label === label) groups[groups.length - 1].events.push(event)
      else groups.push({ label, events: [event] })
    }
    return groups
  }, [events])

  return (
    <Card>
      <CardHeader className="gap-3 pb-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <CardTitle className="text-base">Activity</CardTitle>
            <p className="mt-1 text-xs text-muted-foreground">What members are doing across the congregation, newest first.</p>
          </div>
          <div className="flex items-center gap-2">
            <Select value={member} onValueChange={setMember}>
              <SelectTrigger className="h-9 w-48 rounded-lg" aria-label="Filter by member"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All members</SelectItem>
                {members.map((item) => (
                  <SelectItem key={item.userId} value={String(item.userId)}>{item.congregationDisplayName?.trim() || item.displayName}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button variant="ghost" size="icon" className="h-9 w-9" aria-label="Refresh activity" onClick={() => void reload()}><RefreshCw aria-hidden="true" /></Button>
          </div>
        </div>
        <div className="-mx-1 flex gap-1 overflow-x-auto px-1" role="group" aria-label="Activity type">
          {FILTERS.map(([value, label]) => (
            <button key={value} type="button" aria-pressed={filter === value} onClick={() => setFilter(value)}
              className={cn("min-h-8 whitespace-nowrap rounded-full border px-3 text-xs font-medium transition-colors",
                filter === value ? "border-blue-500 bg-blue-50 text-blue-700 dark:bg-blue-950/50 dark:text-blue-300" : "text-muted-foreground hover:text-foreground")}>
              {label}
            </button>
          ))}
        </div>
      </CardHeader>
      <CardContent>
        {error ? (
          <div className="flex flex-col items-start gap-3">
            <p className="text-sm text-destructive">{error}</p>
            <Button variant="outline" size="sm" onClick={() => void reload()}><RefreshCw aria-hidden="true" />Try again</Button>
          </div>
        ) : !events ? (
          <div className="space-y-3" aria-busy="true" aria-label="Loading activity">
            {Array.from({ length: 6 }, (_, index) => <Skeleton key={index} className="h-10 rounded-lg" />)}
          </div>
        ) : events.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">No activity matches these filters yet.</p>
        ) : (
          <div className="space-y-5">
            {days.map((group) => (
              <section key={group.label} aria-label={group.label}>
                <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">{group.label}</h3>
                <ol className="space-y-1">
                  {group.events.map((event) => {
                    const { icon: Icon, tone } = KIND_STYLE[event.kind]
                    return (
                      <li key={event.id} className="flex items-start gap-3 rounded-lg px-2 py-2 hover:bg-muted/50">
                        <span className={cn("mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full", tone)}>
                          <Icon className="h-3.5 w-3.5" aria-hidden="true" />
                        </span>
                        <p className="min-w-0 flex-1 text-sm leading-relaxed text-muted-foreground">
                          <Sentence event={event} />
                          {event.firstInZip ? (
                            <span className="ml-2 inline-flex rounded-full bg-orange-100 px-2 py-0.5 align-middle text-[11px] font-semibold text-orange-700 dark:bg-orange-950/60 dark:text-orange-300">New ZIP</span>
                          ) : null}
                        </p>
                        <time dateTime={event.at} className="shrink-0 pt-0.5 text-xs tabular-nums text-muted-foreground">{time.format(new Date(event.at))}</time>
                      </li>
                    )
                  })}
                </ol>
              </section>
            ))}
            {nextCursor ? (
              <Button variant="outline" className="w-full" disabled={loadingMore} onClick={() => void loadMore()}>
                {loadingMore ? "Loading…" : "Load more"}
              </Button>
            ) : null}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
