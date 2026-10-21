"use client"

import { useCallback, useEffect, useState } from "react"
import Link from "next/link"
import { ArrowRight, BookCheck, Inbox, MapPinned, RefreshCw, SearchCheck, Sparkles, UsersRound } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"
import { AdminActivity } from "@/components/admin/admin-activity"

type AdminStats = {
  submissions: number
  potentiallyFrench: number
  checkedContacts: number
  pendingReviews: number
  activeMembers: number
  pages: { total: number; completed: number; open: number }
  weeks: Array<{ week: string; checkedContacts: number; potentiallyFrench: number }>
  topMembers: Array<{ name: string; checkedContacts: number; potentiallyFrench: number }>
}

const number = new Intl.NumberFormat()
const weekLabel = new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric" })

function Metric({ icon: Icon, label, value, detail }: { icon: typeof Inbox; label: string; value: string; detail?: string }) {
  return (
    <Card>
      <CardContent className="p-4">
        <p className="flex items-center gap-2 text-xs font-medium text-muted-foreground"><Icon className="h-4 w-4" aria-hidden="true" />{label}</p>
        <p className="mt-2 text-2xl font-bold tabular-nums">{value}</p>
        {detail ? <p className="mt-1 text-xs text-muted-foreground">{detail}</p> : null}
      </CardContent>
    </Card>
  )
}

export function AdminStats({ slug }: { slug: string }) {
  const [data, setData] = useState<AdminStats | null>(null)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setError(null)
    try {
      const response = await fetch(`/api/c/${encodeURIComponent(slug)}/admin/stats`, { cache: "no-store" })
      const result = await response.json()
      if (!response.ok) throw new Error(result.error || "Unable to load statistics")
      setData(result)
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Unable to load statistics")
    }
  }, [slug])

  useEffect(() => { void load() }, [load])

  if (error) {
    return (
      <Card><CardContent className="flex flex-col items-start gap-3 p-6">
        <p className="text-sm text-destructive">{error}</p>
        <Button variant="outline" onClick={() => { setData(null); void load() }}><RefreshCw aria-hidden="true" />Try again</Button>
      </CardContent></Card>
    )
  }

  if (!data) {
    return (
      <div className="space-y-4" aria-busy="true" aria-label="Loading statistics">
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">{Array.from({ length: 5 }, (_, index) => <Skeleton key={index} className="h-28 rounded-xl" />)}</div>
        <Skeleton className="h-64 rounded-xl" />
      </div>
    )
  }

  const pagePercent = data.pages.total ? Math.round((data.pages.completed / data.pages.total) * 100) : 0
  const maxWeek = Math.max(1, ...data.weeks.map((week) => week.checkedContacts))

  return (
    <TooltipProvider delayDuration={150}>
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
          <Metric icon={SearchCheck} label="Contacts checked" value={number.format(data.checkedContacts)} detail={`${number.format(data.submissions)} submissions`} />
          <Metric icon={Sparkles} label="Potential French" value={number.format(data.potentiallyFrench)} detail="Found across all submissions" />
          <Metric icon={BookCheck} label="Pages completed" value={`${pagePercent}%`} detail={`${number.format(data.pages.completed)} of ${number.format(data.pages.total)} pages`} />
          <Metric icon={UsersRound} label="Active members" value={number.format(data.activeMembers)} detail="Searched in the last 30 days" />
          <Metric icon={Inbox} label="Pending reviews" value={number.format(data.pendingReviews)} detail="Not yet marked reviewed" />
        </div>

        {data.pages.open > 0 ? (
          <Link href={`/c/${slug}/admin/zip-codes/coverage`} className="flex items-center gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800 transition-colors hover:bg-amber-100 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-200 dark:hover:bg-amber-950/60">
            <MapPinned className="h-4 w-4 shrink-0" aria-hidden="true" />
            <span className="flex-1">{number.format(data.pages.open)} pages have no Excel yet, so members can&apos;t claim them.</span>
            <span className="inline-flex items-center gap-1 font-medium">See ZIP coverage<ArrowRight className="h-4 w-4" aria-hidden="true" /></span>
          </Link>
        ) : null}

        <div className="grid gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Contacts checked per week</CardTitle>
              <p className="text-xs text-muted-foreground">Last 12 weeks · darker part is potential French</p>
            </CardHeader>
            <CardContent>
              <div className="flex h-44 items-end gap-1.5 sm:gap-2" role="img" aria-label="Weekly contacts checked for the last 12 weeks">
                {data.weeks.map((week) => {
                  const height = (week.checkedContacts / maxWeek) * 100
                  const frenchShare = week.checkedContacts ? (week.potentiallyFrench / week.checkedContacts) * 100 : 0
                  return (
                    <Tooltip key={week.week}>
                      <TooltipTrigger asChild>
                        <div className="flex h-full flex-1 flex-col justify-end" tabIndex={0}>
                          <div className="flex flex-col justify-end overflow-hidden rounded-t bg-blue-200 dark:bg-blue-900/70" style={{ height: `${Math.max(height, week.checkedContacts ? 3 : 1)}%` }}>
                            <div className="bg-blue-600 dark:bg-blue-400" style={{ height: `${frenchShare}%` }} />
                          </div>
                        </div>
                      </TooltipTrigger>
                      <TooltipContent>
                        Week of {weekLabel.format(new Date(`${week.week}T12:00:00`))}: {number.format(week.checkedContacts)} checked, {number.format(week.potentiallyFrench)} potential French
                      </TooltipContent>
                    </Tooltip>
                  )
                })}
              </div>
              <div className="mt-2 flex justify-between text-xs text-muted-foreground">
                <span>{weekLabel.format(new Date(`${data.weeks[0]?.week}T12:00:00`))}</span>
                <span>This week</span>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Top members</CardTitle>
              <p className="text-xs text-muted-foreground">Contacts checked in the last 30 days</p>
            </CardHeader>
            <CardContent>
              {data.topMembers.length ? (
                <ol className="space-y-3">
                  {data.topMembers.map((member, index) => (
                    <li key={`${member.name}-${index}`} className="space-y-1">
                      <div className="flex items-baseline justify-between gap-3 text-sm">
                        <span className="truncate font-medium">{member.name}</span>
                        <span className="shrink-0 tabular-nums text-muted-foreground">{number.format(member.checkedContacts)}</span>
                      </div>
                      <div className="h-1.5 overflow-hidden rounded-full bg-muted">
                        <div className="h-full rounded-full bg-blue-500" style={{ width: `${(member.checkedContacts / Math.max(1, data.topMembers[0].checkedContacts)) * 100}%` }} />
                      </div>
                    </li>
                  ))}
                </ol>
              ) : <p className="text-sm text-muted-foreground">No submissions in the last 30 days.</p>}
            </CardContent>
          </Card>
        </div>

        <AdminActivity slug={slug} />
      </div>
    </TooltipProvider>
  )
}
