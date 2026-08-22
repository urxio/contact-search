"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { ChevronLeft, ChevronRight, Clock3, RefreshCw } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"
import { PageFrame } from "@/components/workspace/page-frame"
import { cn } from "@/lib/utils"

type DailyActivity = { date: string; activeSeconds: number }
type StatsPayload = {
  month: string
  timeZone: string
  dailyActivity: DailyActivity[]
  totalActiveSeconds: number
  activeDays: number
}

const weekdays = ["S", "M", "T", "W", "T", "F", "S"]

function localMonth() {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`
}

function shiftMonth(month: string, amount: number) {
  const [year, monthNumber] = month.split("-").map(Number)
  const next = new Date(Date.UTC(year, monthNumber - 1 + amount, 1))
  return `${next.getUTCFullYear()}-${String(next.getUTCMonth() + 1).padStart(2, "0")}`
}

function monthLabel(month: string) {
  const [year, monthNumber] = month.split("-").map(Number)
  return new Intl.DateTimeFormat(undefined, { month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(Date.UTC(year, monthNumber - 1, 1)))
}

function formatDuration(seconds: number) {
  if (seconds < 60) return seconds ? "< 1 min" : "0 min"
  const totalMinutes = Math.round(seconds / 60)
  const hours = Math.floor(totalMinutes / 60)
  const minutes = totalMinutes % 60
  if (!hours) return `${minutes} min`
  return `${hours}h${minutes ? ` ${minutes}m` : ""}`
}

function activityLevel(seconds: number) {
  if (!seconds) return 0
  if (seconds < 15 * 60) return 1
  if (seconds < 30 * 60) return 2
  if (seconds < 60 * 60) return 3
  return 4
}

const activityLevelClasses = [
  "border-border bg-muted/40 text-foreground",
  "border-primary/20 bg-primary/20 text-primary",
  "border-primary/30 bg-primary/30 text-primary",
  "border-primary/40 bg-primary/60 text-primary-foreground",
  "border-primary bg-primary text-primary-foreground",
] as const

function monthDays(month: string, activity: DailyActivity[]) {
  const [year, monthNumber] = month.split("-").map(Number)
  const first = new Date(Date.UTC(year, monthNumber - 1, 1))
  const dayCount = new Date(Date.UTC(year, monthNumber, 0)).getUTCDate()
  const values = new Map(activity.map((day) => [day.date, day.activeSeconds]))
  const days: Array<{ date: string; day: number; activeSeconds: number } | null> = Array(first.getUTCDay()).fill(null)
  for (let day = 1; day <= dayCount; day += 1) {
    const date = `${month}-${String(day).padStart(2, "0")}`
    days.push({ date, day, activeSeconds: values.get(date) ?? 0 })
  }
  while (days.length % 7) days.push(null)
  return days
}

export function PersonalStatsDashboard({ slug }: { slug: string }) {
  const [month, setMonth] = useState(localMonth)
  const [data, setData] = useState<StatsPayload | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")
  const timeZone = useMemo(() => Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC", [])

  const load = useCallback(async () => {
    setLoading(true)
    setError("")
    try {
      const response = await fetch(`/api/c/${encodeURIComponent(slug)}/stats?month=${month}&timeZone=${encodeURIComponent(timeZone)}`, { cache: "no-store" })
      const result = await response.json()
      if (!response.ok) throw new Error(result.error || "Stats could not be loaded.")
      setData(result)
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Stats could not be loaded.")
    } finally {
      setLoading(false)
    }
  }, [month, slug, timeZone])

  useEffect(() => { void load() }, [load])

  const days = useMemo(() => monthDays(month, data?.dailyActivity ?? []), [data?.dailyActivity, month])
  const isCurrentMonth = month === localMonth()
  const changeMonth = (amount: number) => {
    setLoading(true)
    setData(null)
    setMonth((current) => shiftMonth(current, amount))
  }

  return (
    <PageFrame eyebrow="Your workspace" title="Stats" description="Your focused search time, simply tracked." className="max-w-3xl">
      {loading && !data ? (
        <Skeleton className="mx-auto h-96 max-w-2xl rounded-2xl" aria-label="Loading stats" />
      ) : error && !data ? (
        <Card className="admin-material mx-auto max-w-2xl rounded-2xl">
          <CardContent className="flex flex-col items-center p-10 text-center">
            <RefreshCw className="h-6 w-6 text-muted-foreground" aria-hidden="true" />
            <p className="mt-4 text-base font-semibold">Stats are temporarily unavailable</p>
            <p className="mt-2 text-sm font-normal leading-relaxed text-muted-foreground">{error}</p>
            <Button className="mt-6 min-h-11 rounded-xl" onClick={() => void load()}>Try again</Button>
          </CardContent>
        </Card>
      ) : data ? (
        <TooltipProvider delayDuration={200}>
          <Card className={cn("admin-card mx-auto max-w-2xl rounded-2xl transition-opacity duration-150 ease-out", loading && "opacity-60")} aria-busy={loading}>
            <CardContent className="p-6 sm:p-8">
              <div className="flex flex-col gap-6 border-b pb-6 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex items-center gap-4">
                  <span className="admin-icon-well flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-primary">
                    <Clock3 className="h-5 w-5" aria-hidden="true" />
                  </span>
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Search time</p>
                    <p className="mt-1 text-2xl font-bold leading-tight">{formatDuration(data.totalActiveSeconds)}</p>
                    <p className="mt-1 text-sm font-normal leading-relaxed text-muted-foreground">{data.activeDays} active day{data.activeDays === 1 ? "" : "s"}</p>
                  </div>
                </div>
                <div className="flex items-center gap-1 self-start rounded-xl bg-muted p-1 sm:self-auto">
                  <Button variant="ghost" size="icon" className="h-10 w-10 rounded-lg" onClick={() => changeMonth(-1)} aria-label="Previous month">
                    <ChevronLeft aria-hidden="true" />
                  </Button>
                  <span className="min-w-36 px-2 text-center text-sm font-medium">{monthLabel(month)}</span>
                  <Button variant="ghost" size="icon" className="h-10 w-10 rounded-lg" onClick={() => changeMonth(1)} disabled={isCurrentMonth} aria-label="Next month">
                    <ChevronRight aria-hidden="true" />
                  </Button>
                </div>
              </div>

              <div className="mx-auto mt-6 max-w-sm">
                <div className="grid grid-cols-7 gap-2" role="grid" aria-label={`Search activity for ${monthLabel(month)}`}>
                  {weekdays.map((weekday, index) => <span key={`${weekday}-${index}`} role="columnheader" className="pb-1 text-center text-xs font-semibold uppercase tracking-wider text-muted-foreground">{weekday}</span>)}
                  {days.map((day, index) => day ? (
                    <Tooltip key={day.date}>
                      <TooltipTrigger asChild>
                        <span tabIndex={0} role="gridcell" aria-label={`${day.date}: ${formatDuration(day.activeSeconds)}`} className={cn("flex h-10 items-center justify-center rounded-xl border text-xs font-semibold transition-all duration-150 ease-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2", activityLevelClasses[activityLevel(day.activeSeconds)])}>{day.day}</span>
                      </TooltipTrigger>
                      <TooltipContent>{new Date(`${day.date}T12:00:00`).toLocaleDateString(undefined, { month: "short", day: "numeric" })} · {formatDuration(day.activeSeconds)}</TooltipContent>
                    </Tooltip>
                  ) : <span key={`blank-${index}`} className="h-10" aria-hidden="true" />)}
                </div>
              </div>
            </CardContent>
          </Card>
        </TooltipProvider>
      ) : null}
    </PageFrame>
  )
}
