"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import Link from "next/link"
import {
  ArrowRight, CalendarDays, CheckCircle2, ChevronDown,
  Clock3, FileSpreadsheet, Flame, MapPin, PackageOpen, RefreshCw, Send, Sparkles, UsersRound,
} from "lucide-react"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"
import { PageFrame } from "@/components/workspace/page-frame"
import { cn } from "@/lib/utils"

type DailyActivity = { date: string; activeSeconds: number }
type Segment = {
  id: number; status: string; pageStart: number; pageEnd: number; stoppedAtPage: number | null;
  zipcode: string; city: string; territory: string; packageId: number | null; packageName: string | null
}
type AvailablePackage = {
  packageId: number; packageName: string; contactCount: number; zipcode: string; city: string;
  territory: string; pageStart: number; pageEnd: number
}
type OpenRange = {
  zipcodeId: number; zipcode: string; city: string; territory: string;
  pageStart: number; pageEnd: number; pageCount: number
}
type StatsPayload = {
  month: string
  timeZone: string
  personal: {
    dailyActivity: DailyActivity[]; yearlyActivity: DailyActivity[]; totalActiveSeconds: number; yearlyActiveSeconds: number;
    activeDays: number; currentStreak: number;
    submissions: number; contactsSubmitted: number; completedSegments: number
  }
  team: {
    activeSeconds: number; contactsSubmitted: number; completedSegments: number; contributors: number
    highlights: Array<{
      kind: "submission" | "completion"; happenedAt: string; displayName: string; contactCount: number | null;
      zipcode: string | null; pageStart: number | null; pageEnd: number | null
    }>
  }
  assignedSegments: Segment[]
  availablePackages: AvailablePackage[]
  openRanges: OpenRange[]
}

function localMonth() {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`
}

function shiftMonth(month: string, amount: number) {
  const [year, monthNumber] = month.split("-").map(Number)
  const next = new Date(Date.UTC(year, monthNumber - 1 + amount, 1))
  return `${next.getUTCFullYear()}-${String(next.getUTCMonth() + 1).padStart(2, "0")}`
}

function shortMonthLabel(month: string) {
  const [year, monthNumber] = month.split("-").map(Number)
  return new Intl.DateTimeFormat(undefined, { month: "short", timeZone: "UTC" }).format(new Date(Date.UTC(year, monthNumber - 1, 1)))
}

function formatDuration(seconds: number, compact = false) {
  if (seconds < 60) return seconds ? "< 1 min" : compact ? "0m" : "No activity"
  const totalMinutes = Math.round(seconds / 60)
  const hours = Math.floor(totalMinutes / 60)
  const minutes = totalMinutes % 60
  if (!hours) return `${minutes}m`
  return compact ? `${hours}h ${minutes ? `${minutes}m` : ""}`.trim() : `${hours} hr${hours === 1 ? "" : "s"}${minutes ? ` ${minutes} min` : ""}`
}

function activityLevel(seconds: number) {
  if (!seconds) return 0
  if (seconds < 15 * 60) return 1
  if (seconds < 30 * 60) return 2
  if (seconds < 60 * 60) return 3
  return 4
}

function activityCalendar(month: string, activity: DailyActivity[]) {
  const [year, monthNumber] = month.split("-").map(Number)
  const first = new Date(Date.UTC(year, monthNumber - 12, 1))
  first.setUTCDate(first.getUTCDate() - first.getUTCDay())
  const today = new Date()
  const lastDay = new Date(Date.UTC(today.getFullYear(), today.getMonth(), today.getDate()))
  const last = new Date(lastDay)
  last.setUTCDate(last.getUTCDate() + (6 - last.getUTCDay()))
  const values = new Map(activity.map((day) => [day.date, day.activeSeconds]))
  const weeks: Array<Array<{ date: string; activeSeconds: number } | null>> = []
  const cursor = new Date(first)
  while (cursor <= last) {
    const week: Array<{ date: string; activeSeconds: number } | null> = []
    for (let day = 0; day < 7; day += 1) {
      const date = cursor.toISOString().slice(0, 10)
      week.push(cursor <= lastDay ? { date, activeSeconds: values.get(date) ?? 0 } : null)
      cursor.setUTCDate(cursor.getUTCDate() + 1)
    }
    weeks.push(week)
  }
  return weeks
}

function calendarMonthLabels(month: string) {
  return Array.from({ length: 12 }, (_, index) => shortMonthLabel(shiftMonth(month, index - 11)))
}

function SummaryCard({ icon: Icon, label, value, detail }: { icon: typeof Clock3; label: string; value: string; detail: string }) {
  return (
    <Card className="admin-card rounded-2xl">
      <CardContent className="p-5">
        <div className="admin-icon-well mb-4 flex h-10 w-10 items-center justify-center rounded-xl text-primary">
          <Icon className="h-5 w-5" aria-hidden="true" />
        </div>
        <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{label}</p>
        <p className="mt-2 text-2xl font-bold leading-tight">{value}</p>
        <p className="mt-2 text-sm font-normal leading-relaxed text-muted-foreground">{detail}</p>
      </CardContent>
    </Card>
  )
}

function EmptySection({ icon: Icon, title, description }: { icon: typeof MapPin; title: string; description: string }) {
  return (
    <div className="rounded-2xl border border-dashed p-8 text-center">
      <Icon className="mx-auto h-5 w-5 text-muted-foreground" aria-hidden="true" />
      <p className="mt-3 text-base font-semibold">{title}</p>
      <p className="mx-auto mt-2 max-w-lg text-sm font-normal leading-relaxed text-muted-foreground">{description}</p>
    </div>
  )
}

export function PersonalStatsDashboard({ slug }: { slug: string }) {
  const month = localMonth()
  const [data, setData] = useState<StatsPayload | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")
  const [showAllRanges, setShowAllRanges] = useState(false)
  const timeZone = useMemo(() => Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC", [])

  const load = useCallback(async () => {
    setLoading(true)
    setError("")
    try {
      const response = await fetch(`/api/c/${encodeURIComponent(slug)}/stats?month=${month}&timeZone=${encodeURIComponent(timeZone)}`, { cache: "no-store" })
      const result = await response.json()
      if (!response.ok) throw new Error(result.error || "Personal stats could not be loaded.")
      setData(result)
      setShowAllRanges(false)
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Personal stats could not be loaded.")
    } finally {
      setLoading(false)
    }
  }, [month, slug, timeZone])

  useEffect(() => { void load() }, [load])

  const weeks = useMemo(() => activityCalendar(month, data?.personal.yearlyActivity ?? []), [data?.personal.yearlyActivity, month])
  const monthLabels = useMemo(() => calendarMonthLabels(month), [month])
  const visibleRanges = showAllRanges ? data?.openRanges ?? [] : data?.openRanges.slice(0, 6) ?? []

  return (
    <PageFrame eyebrow="Your workspace" title="Personal Stats" description="A calm view of your search rhythm, recent progress, and work ready to continue." className="max-w-6xl">
      {loading && !data ? (
        <div className="space-y-6" aria-busy="true" aria-label="Loading personal stats">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">{Array.from({ length: 4 }, (_, index) => <Skeleton key={index} className="h-44 rounded-2xl" />)}</div>
          <Skeleton className="h-56 rounded-2xl" />
          <Skeleton className="h-64 rounded-2xl" />
        </div>
      ) : error && !data ? (
        <Card className="admin-material rounded-2xl"><CardContent className="flex flex-col items-center p-10 text-center"><RefreshCw className="h-6 w-6 text-muted-foreground" aria-hidden="true" /><p className="mt-4 text-base font-semibold">Stats are temporarily unavailable</p><p className="mt-2 text-sm text-muted-foreground">{error}</p><Button className="mt-6 min-h-11 rounded-xl" onClick={() => void load()}>Try again</Button></CardContent></Card>
      ) : data ? (
        <TooltipProvider delayDuration={200}>
          <div className={cn("space-y-8 transition-opacity duration-150 ease-out", loading && "opacity-60")} aria-busy={loading}>
            <section aria-labelledby="personal-summary-title">
              <h2 id="personal-summary-title" className="sr-only">Personal summary</h2>
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                <SummaryCard icon={Clock3} label="Search time" value={formatDuration(data.personal.totalActiveSeconds, true)} detail={`${data.personal.activeDays} active day${data.personal.activeDays === 1 ? "" : "s"} this month`} />
                <SummaryCard icon={Flame} label="Current streak" value={`${data.personal.currentStreak} day${data.personal.currentStreak === 1 ? "" : "s"}`} detail="Focused and active search days" />
                <SummaryCard icon={Send} label="Contacts submitted" value={data.personal.contactsSubmitted.toLocaleString()} detail={`${data.personal.submissions} submission${data.personal.submissions === 1 ? "" : "s"} this month`} />
                <SummaryCard icon={CheckCircle2} label="Segments completed" value={data.personal.completedSegments.toLocaleString()} detail="Assigned ZIP ranges finished" />
              </div>
            </section>

            <Card className="admin-card rounded-2xl">
              <CardHeader className="pb-4">
                <CardTitle className="text-base font-semibold">{formatDuration(data.personal.yearlyActiveSeconds, true)} of focused search in the last 12 months</CardTitle>
                <CardDescription>Time counted while Search is focused and you are active.</CardDescription>
              </CardHeader>
              <CardContent className="pb-5">
                <div className="overflow-x-auto pb-2">
                  <div className="min-w-[42rem]">
                    <div className="mb-2 grid grid-cols-12 gap-1 pl-8" aria-hidden="true">
                      {monthLabels.map((label, index) => <span key={`${label}-${index}`} className="text-xs font-normal text-muted-foreground">{label}</span>)}
                    </div>
                    <div className="flex gap-2">
                      <div className="grid w-6 shrink-0 grid-rows-[repeat(7,0.5rem)] gap-1 text-xs font-normal leading-none text-muted-foreground" aria-hidden="true">
                        <span /><span>Mon</span><span /><span>Wed</span><span /><span>Fri</span><span />
                      </div>
                      <div className="flex gap-1" role="grid" aria-label="Search activity for the last 12 months">
                        {weeks.map((week, weekIndex) => (
                          <div key={weekIndex} className="grid grid-rows-7 gap-1" role="row">
                            {week.map((day, dayIndex) => day ? (
                              <Tooltip key={day.date}>
                                <TooltipTrigger asChild>
                                  <span tabIndex={0} role="gridcell" aria-label={`${day.date}: ${formatDuration(day.activeSeconds)}`} className={cn("h-2 w-2 rounded-sm border transition-all duration-150 ease-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1", `activity-level-${activityLevel(day.activeSeconds)}`)} />
                                </TooltipTrigger>
                                <TooltipContent>{new Date(`${day.date}T12:00:00`).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })} · {formatDuration(day.activeSeconds)}</TooltipContent>
                              </Tooltip>
                            ) : <span key={`blank-${weekIndex}-${dayIndex}`} className="h-2 w-2" aria-hidden="true" />)}
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
                <div className="mt-2 flex items-center justify-end gap-1 text-xs font-normal text-muted-foreground"><span className="mr-1">Less</span>{[0, 1, 2, 3, 4].map((level) => <span key={level} className={cn("h-3 w-3 rounded-sm border", `activity-level-${level}`)} aria-hidden="true" />)}<span className="ml-1">More</span></div>
              </CardContent>
            </Card>

            <Card className="admin-card rounded-2xl">
              <CardHeader><div className="admin-icon-well mb-2 flex h-10 w-10 items-center justify-center rounded-xl text-primary"><UsersRound className="h-5 w-5" aria-hidden="true" /></div><CardTitle className="text-base font-semibold">Team highlights</CardTitle><CardDescription>Shared progress without ranking individual members.</CardDescription></CardHeader>
              <CardContent className="space-y-6">
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                  {[{ label: "Team search time", value: formatDuration(data.team.activeSeconds, true) }, { label: "Contacts submitted", value: data.team.contactsSubmitted.toLocaleString() }, { label: "Segments completed", value: data.team.completedSegments.toLocaleString() }, { label: "Contributors", value: data.team.contributors.toLocaleString() }].map((item) => <div key={item.label} className="rounded-xl bg-muted/60 p-4"><p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{item.label}</p><p className="mt-2 text-base font-semibold">{item.value}</p></div>)}
                </div>
                {data.team.highlights.length ? <div className="divide-y">{data.team.highlights.map((highlight, index) => <div key={`${highlight.kind}-${highlight.happenedAt}-${index}`} className="flex items-start gap-3 py-4 first:pt-0 last:pb-0"><span className="admin-icon-well flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-primary"><Sparkles className="h-4 w-4" aria-hidden="true" /></span><div className="min-w-0 flex-1"><p className="text-sm font-normal leading-relaxed"><span className="font-semibold">{highlight.displayName}</span>{highlight.kind === "submission" ? ` submitted ${(highlight.contactCount ?? 0).toLocaleString()} contacts` : ` completed ZIP ${highlight.zipcode} · pages ${highlight.pageStart}–${highlight.pageEnd}`}</p><p className="mt-1 text-xs font-normal text-muted-foreground">{new Date(highlight.happenedAt).toLocaleDateString(undefined, { month: "short", day: "numeric" })}</p></div></div>)}</div> : <EmptySection icon={Sparkles} title="The month is just getting started" description="Team submissions and completed segments will appear here." />}
              </CardContent>
            </Card>

            <section className="space-y-4" aria-labelledby="assigned-work-title">
              <div><h2 id="assigned-work-title" className="text-base font-semibold">Your assigned work</h2><p className="mt-1 text-sm font-normal leading-relaxed text-muted-foreground">Start or continue the ZIP segments assigned to you.</p></div>
              {data.assignedSegments.length ? <div className="grid gap-4 sm:grid-cols-2">{data.assignedSegments.map((segment) => <Card key={segment.id} className="admin-card rounded-2xl"><CardContent className="flex h-full flex-col p-5"><div className="flex items-start gap-3"><span className="admin-icon-well flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-primary"><FileSpreadsheet className="h-5 w-5" aria-hidden="true" /></span><div className="min-w-0"><p className="text-base font-semibold">{segment.packageName || `ZIP ${segment.zipcode}`}</p><p className="mt-1 text-sm text-muted-foreground">{segment.city} · pages {segment.pageStart}–{segment.pageEnd}</p></div></div><div className="mt-5 flex items-center justify-between gap-3"><span className="rounded-full bg-muted px-3 py-1 text-xs font-semibold">{segment.status}</span><Button asChild variant={segment.packageId ? "default" : "outline"} className="min-h-11 rounded-xl"><Link href={segment.packageId ? `/c/${slug}?package=${segment.packageId}` : `/c/${slug}/team/${segment.zipcode}`}>{segment.packageId ? segment.status === "In progress" ? "Continue" : "Start" : "View"}<ArrowRight aria-hidden="true" /></Link></Button></div></CardContent></Card>)}</div> : <EmptySection icon={CheckCircle2} title="You’re all caught up" description="New assignments will appear here as soon as they are ready." />}
            </section>

            <section className="space-y-4" aria-labelledby="available-work-title">
              <div><h2 id="available-work-title" className="text-base font-semibold">Available Excels</h2><p className="mt-1 text-sm font-normal leading-relaxed text-muted-foreground">Shared segments you can start now.</p></div>
              {data.availablePackages.length ? <div className="grid gap-4 sm:grid-cols-2">{data.availablePackages.map((item) => <Card key={item.packageId} className="admin-card rounded-2xl"><CardContent className="flex h-full flex-col p-5"><div className="flex items-start gap-3"><span className="admin-icon-well flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-primary"><PackageOpen className="h-5 w-5" aria-hidden="true" /></span><div className="min-w-0"><p className="text-base font-semibold">{item.packageName}</p><p className="mt-1 text-sm text-muted-foreground">ZIP {item.zipcode} · pages {item.pageStart}–{item.pageEnd}</p><p className="mt-1 text-xs text-muted-foreground">{item.contactCount.toLocaleString()} contacts</p></div></div><Button asChild className="mt-5 min-h-11 self-end rounded-xl"><Link href={`/c/${slug}?package=${item.packageId}`}>Start<ArrowRight aria-hidden="true" /></Link></Button></CardContent></Card>)}</div> : <EmptySection icon={PackageOpen} title="No shared Excels are waiting" description="When an unassigned shared Excel becomes available, you can start it from here." />}
            </section>

            <Card className="admin-card rounded-2xl">
              <CardHeader><div className="admin-icon-well mb-2 flex h-10 w-10 items-center justify-center rounded-xl text-primary"><MapPin className="h-5 w-5" aria-hidden="true" /></div><CardTitle className="text-base font-semibold">Open ZIP ranges</CardTitle><CardDescription>Uncovered pages available for future Excel uploads or admin assignment.</CardDescription></CardHeader>
              <CardContent>
                {visibleRanges.length ? <div className="space-y-2">{visibleRanges.map((range) => <Link key={`${range.zipcode}-${range.pageStart}`} href={`/c/${slug}/team/${range.zipcode}`} className="group flex min-h-16 items-center gap-4 rounded-xl border px-4 py-3 transition-all duration-150 ease-out hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"><span className="admin-icon-well flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-primary"><MapPin className="h-4 w-4" aria-hidden="true" /></span><div className="min-w-0 flex-1"><p className="text-sm font-semibold">ZIP {range.zipcode} · pages {range.pageStart}–{range.pageEnd}</p><p className="mt-1 truncate text-xs font-normal text-muted-foreground">{range.city} · {range.territory} · {range.pageCount} pages</p></div><ArrowRight className="h-4 w-4 text-muted-foreground transition-transform duration-150 ease-out group-hover:translate-x-1" aria-hidden="true" /></Link>)}{data.openRanges.length > 6 ? <Button variant="ghost" className="mt-3 min-h-11 w-full rounded-xl" onClick={() => setShowAllRanges((current) => !current)}>{showAllRanges ? "Show less" : `Show all ${data.openRanges.length} ranges`}<ChevronDown className={cn("transition-transform duration-150 ease-out", showAllRanges && "rotate-180")} aria-hidden="true" /></Button> : null}</div> : <EmptySection icon={CalendarDays} title="Every page is covered" description="There are no uncovered ZIP ranges in Team Progress." />}
              </CardContent>
            </Card>
          </div>
        </TooltipProvider>
      ) : null}
    </PageFrame>
  )
}
