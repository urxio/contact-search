"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { BarChart3, ChevronLeft, ChevronRight, Clock3, RefreshCw, SearchCheck, UsersRound } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"
import { PageFrame } from "@/components/workspace/page-frame"
import { cn } from "@/lib/utils"

type StatsPeriod = "day" | "week" | "month"
type DailyActivity = { date: string; activeSeconds: number }
type StatsPayload = {
  period: StatsPeriod
  anchor: string
  startDate: string
  endDate: string
  timeZone: string
  dailyActivity: DailyActivity[]
  totalActiveSeconds: number
  activeDays: number
  impact: { potentiallyFrench: number; checkedContacts: number; congregationFrenchNames: number; congregationCheckedContacts: number; congregationShare: number }
  comparison: null | { contributorCount: number; time: { average: number; percentile: number | null }; frenchNames: { average: number; percentile: number | null } }
}

const weekdays = ["S", "M", "T", "W", "T", "F", "S"]

function localDate() {
  const now = new Date()
  const offset = now.getTimezoneOffset() * 60_000
  return new Date(now.getTime() - offset).toISOString().slice(0, 10)
}

function shiftDate(date: string, period: StatsPeriod, amount: number) {
  const next = new Date(`${date}T12:00:00Z`)
  if (period === "day") next.setUTCDate(next.getUTCDate() + amount)
  if (period === "week") next.setUTCDate(next.getUTCDate() + amount * 7)
  if (period === "month") {
    next.setUTCDate(1)
    next.setUTCMonth(next.getUTCMonth() + amount)
  }
  return next.toISOString().slice(0, 10)
}

function periodLabel(data: Pick<StatsPayload, "period" | "startDate" | "endDate">) {
  const start = new Date(`${data.startDate}T12:00:00`)
  const end = new Date(`${data.endDate}T12:00:00`)
  end.setDate(end.getDate() - 1)
  if (data.period === "month") return new Intl.DateTimeFormat(undefined, { month: "long", year: "numeric" }).format(start)
  if (data.period === "day") return new Intl.DateTimeFormat(undefined, { month: "long", day: "numeric", year: "numeric" }).format(start)
  const formatter = new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric" })
  return `${formatter.format(start)} – ${formatter.format(end)}`
}

function formatDuration(seconds: number) {
  if (seconds < 60) return seconds ? "< 1 min" : "0 min"
  const totalMinutes = Math.round(seconds / 60)
  const hours = Math.floor(totalMinutes / 60)
  const minutes = totalMinutes % 60
  return hours ? `${hours}h${minutes ? ` ${minutes}m` : ""}` : `${minutes} min`
}

function activityLevel(seconds: number) {
  if (!seconds) return 0
  if (seconds < 15 * 60) return 1
  if (seconds < 30 * 60) return 2
  if (seconds < 60 * 60) return 3
  return 4
}

const activityLevelClasses = ["activity-level-0", "activity-level-1", "activity-level-2", "activity-level-3", "activity-level-4"] as const

function rangeDays(startDate: string, endDate: string, activity: DailyActivity[]) {
  const values = new Map(activity.map((day) => [day.date, day.activeSeconds]))
  const days: Array<{ date: string; activeSeconds: number }> = []
  const cursor = new Date(`${startDate}T12:00:00Z`)
  const end = new Date(`${endDate}T12:00:00Z`)
  while (cursor < end) {
    const date = cursor.toISOString().slice(0, 10)
    days.push({ date, activeSeconds: values.get(date) ?? 0 })
    cursor.setUTCDate(cursor.getUTCDate() + 1)
  }
  return days
}

function StatCard({ icon: Icon, label, value, detail }: { icon: typeof Clock3; label: string; value: string; detail: string }) {
  return <Card className="admin-card rounded-2xl"><CardContent className="flex gap-4 p-5"><span className="admin-icon-well flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-primary"><Icon className="h-5 w-5" aria-hidden="true" /></span><div className="min-w-0"><p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{label}</p><p className="mt-1 text-2xl font-bold leading-tight">{value}</p><p className="mt-1 text-sm font-normal leading-relaxed text-muted-foreground">{detail}</p></div></CardContent></Card>
}

function ActivityView({ data }: { data: StatsPayload }) {
  const days = useMemo(() => rangeDays(data.startDate, data.endDate, data.dailyActivity), [data.dailyActivity, data.endDate, data.startDate])
  const maximum = Math.max(...days.map((day) => day.activeSeconds), 1)
  if (data.period === "day") return <div className="rounded-xl border bg-muted/30 p-6 text-center"><p className="text-2xl font-bold leading-tight">{formatDuration(data.totalActiveSeconds)}</p><p className="mt-2 text-sm font-normal leading-relaxed text-muted-foreground">Focused time recorded for this day</p></div>
  if (data.period === "month") {
    const blanks = Array(new Date(`${data.startDate}T12:00:00Z`).getUTCDay()).fill(null)
    return <TooltipProvider delayDuration={200}><div className="grid grid-cols-7 gap-2" role="grid" aria-label={`Search activity for ${periodLabel(data)}`}>
      {weekdays.map((weekday, index) => <span key={`${weekday}-${index}`} role="columnheader" className="pb-1 text-center text-xs font-semibold uppercase tracking-wider text-muted-foreground">{weekday}</span>)}
      {blanks.map((_, index) => <span key={`blank-${index}`} className="h-10" aria-hidden="true" />)}
      {days.map((day) => <Tooltip key={day.date}><TooltipTrigger asChild><span tabIndex={0} role="gridcell" aria-label={`${day.date}: ${formatDuration(day.activeSeconds)}`} className={cn("flex h-10 items-center justify-center rounded-xl border text-xs font-semibold transition-all duration-150 ease-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2", activityLevelClasses[activityLevel(day.activeSeconds)])}>{Number(day.date.slice(-2))}</span></TooltipTrigger><TooltipContent>{new Date(`${day.date}T12:00:00`).toLocaleDateString(undefined, { month: "short", day: "numeric" })} · {formatDuration(day.activeSeconds)}</TooltipContent></Tooltip>)}
    </div></TooltipProvider>
  }
  return <TooltipProvider delayDuration={200}><div className="grid grid-cols-7 gap-2" aria-label={`Daily search activity for ${periodLabel(data)}`}>
    {days.map((day) => <Tooltip key={day.date}><TooltipTrigger asChild><div className="flex min-w-0 flex-col gap-2"><div className="flex h-32 items-end rounded-xl bg-muted/40 p-1"><span className="w-full rounded-lg bg-primary transition-all duration-150 ease-out" style={{ height: `${Math.max(4, Math.round((day.activeSeconds / maximum) * 100))}%` }} aria-label={`${day.date}: ${formatDuration(day.activeSeconds)}`} /></div><span className="text-center text-xs font-semibold text-muted-foreground">{new Date(`${day.date}T12:00:00`).toLocaleDateString(undefined, { weekday: "narrow" })}</span></div></TooltipTrigger><TooltipContent>{new Date(`${day.date}T12:00:00`).toLocaleDateString(undefined, { month: "short", day: "numeric" })} · {formatDuration(day.activeSeconds)}</TooltipContent></Tooltip>)}
  </div></TooltipProvider>
}

export function PersonalStatsDashboard({ slug }: { slug: string }) {
  const [period, setPeriod] = useState<StatsPeriod>("month")
  const [anchor, setAnchor] = useState(localDate)
  const [data, setData] = useState<StatsPayload | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")
  const timeZone = useMemo(() => Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC", [])

  const load = useCallback(async () => {
    setLoading(true); setError("")
    try {
      const response = await fetch(`/api/c/${encodeURIComponent(slug)}/stats?period=${period}&date=${anchor}&timeZone=${encodeURIComponent(timeZone)}`, { cache: "no-store" })
      const result = await response.json()
      if (!response.ok) throw new Error(result.error || "My stats could not be loaded.")
      setData(result)
    } catch (loadError) { setError(loadError instanceof Error ? loadError.message : "My stats could not be loaded.") }
    finally { setLoading(false) }
  }, [anchor, period, slug, timeZone])

  useEffect(() => { void load() }, [load])
  const nextAnchor = shiftDate(anchor, period, 1)
  const canAdvance = nextAnchor <= localDate()
  const hasActivity = Boolean(data && (data.totalActiveSeconds || data.impact.checkedContacts))

  return <PageFrame eyebrow="Your workspace" title="My stats" description="The time and care you put into each search, made visible." className="max-w-5xl">
    {loading && !data ? <Skeleton className="h-[36rem] rounded-2xl" aria-label="Loading stats" /> : error && !data ? <Card className="admin-material rounded-2xl"><CardContent className="flex flex-col items-center p-10 text-center"><RefreshCw className="h-6 w-6 text-muted-foreground" aria-hidden="true" /><p className="mt-4 text-base font-semibold">My stats are temporarily unavailable</p><p className="mt-2 text-sm font-normal leading-relaxed text-muted-foreground">{error}</p><Button className="mt-6 min-h-11 rounded-xl" onClick={() => void load()}>Try again</Button></CardContent></Card> : data ? <div className={cn("space-y-6 transition-opacity duration-150 ease-out", loading && "opacity-60")} aria-busy={loading}>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between"><Tabs value={period} onValueChange={(value) => setPeriod(value as StatsPeriod)}><TabsList className="rounded-xl"><TabsTrigger value="day" className="min-h-9 rounded-lg">Day</TabsTrigger><TabsTrigger value="week" className="min-h-9 rounded-lg">Week</TabsTrigger><TabsTrigger value="month" className="min-h-9 rounded-lg">Month</TabsTrigger></TabsList></Tabs><div className="flex items-center self-start rounded-xl bg-muted p-1 sm:self-auto"><Button variant="ghost" size="icon" className="h-10 w-10 rounded-lg" onClick={() => setAnchor(shiftDate(anchor, period, -1))} aria-label={`Previous ${period}`}><ChevronLeft aria-hidden="true" /></Button><span className="min-w-44 px-2 text-center text-sm font-medium">{periodLabel(data)}</span><Button variant="ghost" size="icon" className="h-10 w-10 rounded-lg" onClick={() => setAnchor(nextAnchor)} disabled={!canAdvance} aria-label={`Next ${period}`}><ChevronRight aria-hidden="true" /></Button></div></div>
      {!hasActivity ? <Card className="admin-material rounded-2xl"><CardContent className="p-8 sm:p-10"><SearchCheck className="h-6 w-6 text-primary" aria-hidden="true" /><p className="mt-4 text-base font-semibold">Your next search will start your story</p><p className="mt-2 max-w-xl text-sm font-normal leading-relaxed text-muted-foreground">Time begins tracking when you open Search. It includes up to five minutes of inactive time before the session pauses, and your submitted Potentially French names will appear here.</p></CardContent></Card> : <><div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4"><StatCard icon={Clock3} label="Search time" value={formatDuration(data.totalActiveSeconds)} detail={`${data.activeDays} active day${data.activeDays === 1 ? "" : "s"}`} /><StatCard icon={SearchCheck} label="Potentially French" value={String(data.impact.potentiallyFrench)} detail="Names submitted this period" /><StatCard icon={BarChart3} label="Contacts checked" value={String(data.impact.checkedContacts)} detail="Completed contact reviews" /><StatCard icon={UsersRound} label="Your impact" value={`${data.impact.congregationShare}%`} detail={`Of ${data.impact.congregationFrenchNames} congregation findings`} /></div><Card className="admin-card rounded-2xl"><CardContent className="p-6"><div className="mb-6"><p className="text-base font-semibold">Search activity</p><p className="mt-1 text-sm font-normal leading-relaxed text-muted-foreground">Your focused time across {periodLabel(data)}</p></div><ActivityView data={data} /></CardContent></Card><Card className="admin-card rounded-2xl"><CardContent className="p-6"><div className="flex items-start gap-4"><span className="admin-icon-well flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-primary"><UsersRound className="h-5 w-5" aria-hidden="true" /></span><div className="min-w-0"><p className="text-base font-semibold">Compared with your congregation</p>{data.comparison ? <div className="mt-4 grid gap-4 sm:grid-cols-2"><div className="rounded-xl border bg-muted/30 p-4"><p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Search time</p><p className="mt-1 text-base font-semibold">Top {Math.max(1, 101 - (data.comparison.time.percentile ?? 0))}%</p><p className="mt-1 text-sm font-normal leading-relaxed text-muted-foreground">Your congregation’s active contributors average {formatDuration(data.comparison.time.average)}.</p></div><div className="rounded-xl border bg-muted/30 p-4"><p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">French-name impact</p><p className="mt-1 text-base font-semibold">Top {Math.max(1, 101 - (data.comparison.frenchNames.percentile ?? 0))}%</p><p className="mt-1 text-sm font-normal leading-relaxed text-muted-foreground">Contributors average {data.comparison.frenchNames.average} Potentially French name{data.comparison.frenchNames.average === 1 ? "" : "s"}.</p></div></div> : <p className="mt-2 text-sm font-normal leading-relaxed text-muted-foreground">Your personal progress is here. Anonymous benchmarks will appear once at least three contributors have activity in this period.</p>}</div></div></CardContent></Card></>}</div> : null}
  </PageFrame>
}
