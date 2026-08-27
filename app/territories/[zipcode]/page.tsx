"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { ThemeSwitcher } from "@/components/theme-switcher"
import { useWorkspaceRuntime } from "@/components/workspace/workspace-context"
import { AlertTriangle, ArrowLeft } from "lucide-react"

type Segment = {
  id: number
  page_start: number
  page_end: number | null
  owner: string
  owner_user_id: number | null
  stopped_at_page: number | null
  status: "Completed" | "In progress" | "Not started"
  notes: string
  updated_at: string
  conflict_segment_ids?: number[]
  package_id?: number | null
  package_visibility?: "shared" | "private" | null
  package_uploader_name?: string | null
  is_mine?: boolean
}

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return "just now"
  if (mins < 60) return `${mins}m ago`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  if (days < 7) return `${days}d ago`
  return new Date(dateStr).toLocaleDateString("en-US", { month: "short", day: "numeric" })
}

type ZipcodeInfo = {
  id: number
  city: string
  zipcode: string
  total_pages: number
  territory: string
}

const STATUS_STYLES: Record<string, string> = {
  "Completed":    "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300",
  "In progress":  "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300",
  "Not started":  "bg-gray-100  text-gray-500  dark:bg-gray-800     dark:text-gray-400",
}

function pct(a: number, total: number) {
  return total > 0 ? Math.round((a / total) * 100) : 0
}

export default function ZipcodePage({ params }: { params: { zipcode: string } }) {
  const { zipcode } = params
  const workspace = useWorkspaceRuntime()
  const workspaceSlug = workspace?.slug
  const embedded = Boolean(workspace)

  const [zipcodeInfo, setZipcodeInfo] = useState<ZipcodeInfo | null>(null)
  const [segments, setSegments]       = useState<Segment[]>([])
  const [loading, setLoading]         = useState(true)
  const [userName, setUserName]       = useState("")
  const [canManage, setCanManage]     = useState(false)

  const apiBase = workspaceSlug ? `/api/c/${encodeURIComponent(workspaceSlug)}/team` : "/api/territories"
  const teamHref = workspaceSlug ? `/c/${workspaceSlug}/team` : "/territories"
  const userStorageKey = workspaceSlug ? `team-progress:${workspaceSlug}:user` : "userId"

  // Inline edit state: segmentId → { stopped_at_page, status, page_start, page_end }
  const [editing, setEditing]   = useState<Record<number, { stopped_at_page: string; status: string; page_start: string; page_end: string }>>({})
  const [saving, setSaving]     = useState<Set<number>>(new Set())
  const [confirming, setConfirming] = useState<Set<number>>(new Set())
  const [editErrors, setEditErrors] = useState<Record<number, string>>({})

  useEffect(() => {
    const saved = localStorage.getItem(userStorageKey)
    if (saved && !workspaceSlug) setUserName(saved)
    if (workspaceSlug) {
      fetch("/api/auth/session", { cache: "no-store" })
        .then(response => response.ok ? response.json() : null)
        .then(data => {
          const membership = (data?.memberships ?? []).find((item: { slug?: string }) => item.slug === workspaceSlug)
          setUserName(membership?.displayName ?? membership?.display_name ?? data?.user?.displayName ?? data?.user?.display_name ?? "Member")
          setCanManage(membership?.role === "admin" || data?.user?.isPlatformAdmin === true || data?.user?.is_platform_admin === true)
        })
        .catch(() => {})
    }
    loadData()
  }, [zipcode])

  const loadData = async () => {
    setLoading(true)
    try {
      const res = await fetch(`${apiBase}/segments?zipcode=${zipcode}`)
      const data = await res.json()
      if (!res.ok) { setLoading(false); return }
      setZipcodeInfo(data.zipcode)
      setSegments(data.segments)
    } catch { /* ignore */ }
    setLoading(false)
  }

  const startEdit = (seg: Segment) => {
    setEditing(prev => ({
      ...prev,
      [seg.id]: {
        stopped_at_page: seg.stopped_at_page?.toString() ?? "",
        status: seg.status,
        page_start: seg.page_start.toString(),
        page_end: seg.page_end?.toString() ?? "",
      },
    }))
  }

  const cancelEdit = (id: number) => {
    setEditing(prev => { const n = { ...prev }; delete n[id]; return n })
  }

  const saveEdit = async (id: number) => {
    const e = editing[id]
    if (!e) return
    setSaving(prev => new Set(prev).add(id))
    const res = await fetch(`${apiBase}/segments`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id,
        page_start: parseInt(e.page_start),
        page_end: e.page_end ? parseInt(e.page_end) : null,
        stopped_at_page: e.stopped_at_page ? parseInt(e.stopped_at_page) : null,
        status: e.status,
        update_range: true,
      }),
    })
    setSaving(prev => { const s = new Set(prev); s.delete(id); return s })
    if (res.ok) {
      setEditErrors(prev => { const next = { ...prev }; delete next[id]; return next })
      cancelEdit(id)
      loadData()
    } else {
      const data = await res.json().catch(() => null)
      setEditErrors(prev => ({ ...prev, [id]: data?.error ?? "Could not update this segment." }))
    }
  }

  const deleteSeg = async (id: number) => {
    await fetch(`${apiBase}/segments?id=${id}`, { method: "DELETE" })
    setConfirming(prev => { const s = new Set(prev); s.delete(id); return s })
    loadData()
  }

  const completedCount  = segments.filter(s => s.status === "Completed").length
  const inProgressCount = segments.filter(s => s.status === "In progress").length
  const notStartedCount = segments.filter(s => s.status === "Not started").length
  const compPct = pct(completedCount,  segments.length)
  const ipPct   = pct(inProgressCount, segments.length)
  const nsPct   = pct(notStartedCount, segments.length)
  const conflictingSegments = segments.filter(segment => (segment.conflict_segment_ids?.length ?? 0) > 0)

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950">

      {/* ── Nav ── */}
      {!embedded && <nav className="sticky top-0 z-30 bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-800 shadow-sm">
        <div className="max-w-4xl mx-auto px-4 h-14 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <Link href={teamHref} className="text-gray-400 hover:text-gray-700 dark:hover:text-gray-300 transition-colors text-base">
              ← Back
            </Link>
            <span className="text-gray-200 dark:text-gray-700">|</span>
            <span className="text-lg font-bold text-gray-900 dark:text-white">
              {loading ? zipcode : `${zipcodeInfo?.city ?? ""} ${zipcode}`}
            </span>
          </div>
          <div className="flex items-center gap-2">
            {/* Name Search link */}
            <Link
              href="/"
              className="hidden sm:flex items-center gap-1.5 h-9 px-3 rounded-lg text-sm font-semibold text-emerald-700 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-900/30 hover:bg-emerald-100 dark:hover:bg-emerald-900/50 transition-colors"
              title="Open Name Search"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>
                <polyline points="15 3 21 3 21 9"/>
                <line x1="10" y1="14" x2="21" y2="3"/>
              </svg>
              Name Search
            </Link>
            {/* Dark mode toggle */}
            <ThemeSwitcher className="h-9 w-9 rounded-lg shadow-none hover:translate-y-0 hover:bg-gray-100 dark:hover:bg-gray-800" />
            {userName ? (
              <span className="px-3 py-1 rounded-full bg-indigo-50 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-300 text-sm font-semibold">
                {userName}
              </span>
            ) : (
              <Link href="/territories" className="text-sm text-indigo-500 hover:underline">
                Set your name →
              </Link>
            )}
          </div>
        </div>
      </nav>}

      <main className="max-w-4xl mx-auto px-4 py-8">
        {loading ? (
          <div className="flex items-center justify-center py-24">
            <div className="w-6 h-6 rounded-full border-2 border-indigo-500 border-t-transparent animate-spin" />
          </div>
        ) : !zipcodeInfo ? (
          <p className="text-center text-gray-400 py-24">Zipcode not found.</p>
        ) : (
          <>
            {embedded ? (
              <Link href={teamHref} className="mb-6 inline-flex min-h-11 items-center gap-2 rounded-xl px-3 text-sm font-semibold text-muted-foreground transition-all duration-150 ease-out hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                <ArrowLeft className="h-4 w-4" aria-hidden="true" />
                Back to Team Progress
              </Link>
            ) : null}

            {/* ── Header ── */}
            <div className="mb-6">
              <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-0.5">
                {zipcodeInfo.city} — {zipcode}
              </h1>
              <p className={`text-base ${zipcodeInfo.total_pages === 0 ? "font-semibold text-amber-600 dark:text-amber-400" : "text-gray-400"}`}>
                {zipcodeInfo.total_pages === 0 ? "Page total needed before assignments can be created" : `${zipcodeInfo.total_pages.toLocaleString()} total pages in A-Z`}
              </p>
            </div>

            {zipcodeInfo.total_pages === 0 ? (
              <div role="status" className="mb-6 flex items-start gap-3 rounded-2xl border border-amber-200 bg-amber-50/80 p-4 text-amber-950 shadow-sm dark:border-amber-800/60 dark:bg-amber-950/30 dark:text-amber-100">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-amber-100 text-amber-700 dark:bg-amber-900/60 dark:text-amber-300">
                  <AlertTriangle className="h-5 w-5" aria-hidden="true" />
                </span>
                <div>
                  <p className="text-base font-semibold">Team Progress setup is incomplete</p>
                  <p className="mt-1 text-sm font-normal leading-relaxed text-amber-800 dark:text-amber-200/80">An admin must enter the total A–Z pages for this ZIP before assigning page ranges.</p>
                </div>
              </div>
            ) : null}

            {/* ── Progress bar ── */}
            {segments.length > 0 && (
              <div className="mb-6 bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-800 p-5 shadow-sm">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-base font-semibold text-gray-700 dark:text-gray-300">Segment Progress</span>
                  <span className="text-base font-bold text-indigo-600 dark:text-indigo-400">{compPct}% complete</span>
                </div>
                <div className="h-2.5 w-full rounded-full overflow-hidden flex gap-0.5 mb-2">
                  {compPct > 0 && <div className="bg-green-500" style={{ width: `${compPct}%` }} />}
                  {ipPct   > 0 && <div className="bg-amber-400" style={{ width: `${ipPct}%` }} />}
                  {nsPct   > 0 && <div className="bg-gray-200 dark:bg-gray-700" style={{ width: `${nsPct}%` }} />}
                </div>
                <div className="flex gap-4 text-sm text-gray-500 dark:text-gray-400">
                  <span><span className="font-semibold text-green-600">{completedCount}</span> completed</span>
                  <span><span className="font-semibold text-amber-500">{inProgressCount}</span> in progress</span>
                  <span><span className="font-semibold text-gray-400">{notStartedCount}</span> not started</span>
                </div>
              </div>
            )}

            {canManage && conflictingSegments.length > 0 && (
              <div role="alert" className="mb-6 flex items-start gap-3 rounded-2xl border border-amber-200 bg-amber-50/80 p-4 text-amber-950 shadow-sm dark:border-amber-800/60 dark:bg-amber-950/30 dark:text-amber-100">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-amber-100 text-amber-700 dark:bg-amber-900/60 dark:text-amber-300">
                  <AlertTriangle className="h-5 w-5" aria-hidden="true" />
                </span>
                <div>
                  <p className="font-semibold">Page range conflict</p>
                  <p className="mt-0.5 text-sm text-amber-800 dark:text-amber-200/80">
                    {conflictingSegments.length} segment{conflictingSegments.length === 1 ? "" : "s"} overlap. Update or release one of the highlighted ranges before assigning more work.
                  </p>
                </div>
              </div>
            )}

            {/* ── Segments table ── */}
            <div className="mb-6 bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-800 shadow-sm overflow-hidden">
              <div className="px-5 py-3 border-b border-gray-100 dark:border-gray-800 flex items-center justify-between">
                <span className="text-base font-semibold text-gray-700 dark:text-gray-300">
                  Segments {segments.length > 0 && <span className="text-gray-400 font-normal">({segments.length})</span>}
                </span>
              </div>

              {segments.length === 0 ? (
                <p className="px-5 py-10 text-center text-gray-400 text-base">
                  No segments have been created for this ZIP code yet.
                </p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-base">
                    <thead>
                      <tr className="border-b border-gray-100 dark:border-gray-800">
                        <th className="text-left px-5 py-3 text-sm font-semibold text-gray-400 uppercase tracking-wide">Pages</th>
                        <th className="text-left px-4 py-3 text-sm font-semibold text-gray-400 uppercase tracking-wide">Owner</th>
                        <th className="text-left px-4 py-3 text-sm font-semibold text-gray-400 uppercase tracking-wide">Status</th>
                        <th className="text-left px-4 py-3 text-sm font-semibold text-gray-400 uppercase tracking-wide">Updated</th>
                        <th className="px-4 py-3"></th>
                      </tr>
                    </thead>
                    <tbody>
                      {segments.map(seg => {
                        const isAvailablePackage = Boolean(seg.package_id && seg.package_visibility === "shared" && !seg.owner_user_id)
                        const isPrivatePackage = Boolean(seg.package_id && seg.package_visibility === "private" && !seg.owner_user_id)
                        const displayOwner = seg.owner || seg.package_uploader_name || ""
                        const displayOwnerIsUploader = !seg.owner && Boolean(seg.package_uploader_name)
                        const isOwner      = workspaceSlug
                          ? Boolean(seg.is_mine)
                          : Boolean(userName && displayOwner.toLowerCase().trim() === userName.toLowerCase().trim())
                        const canEdit      = canManage && !isAvailablePackage
                        const isEditing    = !!editing[seg.id]
                        const isSaving     = saving.has(seg.id)
                        const isConfirming = confirming.has(seg.id)
                        const e            = editing[seg.id]
                        const hasConflict  = canManage && (seg.conflict_segment_ids?.length ?? 0) > 0
                        const isAssignedPackage = Boolean(seg.package_id && seg.owner_user_id)

                        if (isEditing) {
                          return (
                            <tr key={seg.id} className="border-b border-border last:border-0">
                              <td colSpan={5} className="p-4 sm:p-5">
                                <div className="rounded-2xl border border-primary/20 bg-primary/[0.03] p-4 shadow-sm dark:bg-primary/[0.06]">
                                  <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
                                    <div>
                                      <p className="text-base font-semibold text-foreground">Update segment</p>
                                      <p className="mt-1 text-sm font-normal leading-relaxed text-muted-foreground">Adjust the page range, progress, or status.</p>
                                    </div>
                                    <span className="rounded-full bg-background px-3 py-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground shadow-sm">{displayOwner || "Unassigned"}</span>
                                  </div>

                                  <div className="space-y-4">
                                    <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_minmax(12rem,0.65fr)]">
                                      <fieldset className="min-w-0">
                                        <legend className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Page range</legend>
                                        <div className="flex items-center gap-2">
                                          <label htmlFor={`segment-${seg.id}-start`} className="sr-only">Start page</label>
                                          <input id={`segment-${seg.id}-start`} type="number" value={e.page_start}
                                            onChange={ev => setEditing(prev => ({ ...prev, [seg.id]: { ...prev[seg.id], page_start: ev.target.value } }))}
                                            className="admin-field h-11 min-w-0 flex-1 rounded-xl px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                                            placeholder="Start" />
                                          <span className="shrink-0 text-muted-foreground" aria-hidden="true">–</span>
                                          <label htmlFor={`segment-${seg.id}-end`} className="sr-only">End page</label>
                                          <input id={`segment-${seg.id}-end`} type="number" value={e.page_end}
                                            onChange={ev => setEditing(prev => ({ ...prev, [seg.id]: { ...prev[seg.id], page_end: ev.target.value } }))}
                                            className="admin-field h-11 min-w-0 flex-1 rounded-xl px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                                            placeholder="End" />
                                        </div>
                                      </fieldset>

                                      <div className="min-w-0">
                                        <label htmlFor={`segment-${seg.id}-status`} className="mb-2 block text-xs font-semibold uppercase tracking-wider text-muted-foreground">Status</label>
                                        <select id={`segment-${seg.id}-status`} value={e.status}
                                          onChange={ev => setEditing(prev => ({ ...prev, [seg.id]: { ...prev[seg.id], status: ev.target.value } }))}
                                          className="admin-field h-11 w-full rounded-xl px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring">
                                          <option>Not started</option>
                                          <option>In progress</option>
                                          <option>Completed</option>
                                        </select>
                                      </div>
                                    </div>

                                    <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                                      <button type="button" onClick={() => cancelEdit(seg.id)} className="min-h-11 w-full rounded-xl border bg-background px-4 text-sm font-semibold text-muted-foreground transition-all duration-150 ease-out hover:bg-muted sm:w-auto">Cancel</button>
                                      <button type="button" onClick={() => saveEdit(seg.id)} disabled={isSaving} className="admin-primary-button min-h-11 w-full rounded-xl px-5 text-sm font-semibold text-white transition-all duration-150 ease-out disabled:opacity-50 sm:w-auto">
                                        {isSaving ? "Saving…" : "Save changes"}
                                      </button>
                                    </div>
                                  </div>

                                  {e.page_end && zipcodeInfo && parseInt(e.page_end) > zipcodeInfo.total_pages ? (
                                    <p role="alert" className="mt-3 flex items-center gap-2 text-sm font-normal leading-relaxed text-amber-700 dark:text-amber-300">
                                      <AlertTriangle className="h-4 w-4 shrink-0" aria-hidden="true" /> Exceeds the configured maximum of {zipcodeInfo.total_pages.toLocaleString()} pages.
                                    </p>
                                  ) : null}
                                  {editErrors[seg.id] ? <p role="alert" className="mt-3 text-sm font-normal leading-relaxed text-destructive">{editErrors[seg.id]}</p> : null}
                                </div>
                              </td>
                            </tr>
                          )
                        }

                        return (
                          <tr key={seg.id} className={`border-b border-gray-100 dark:border-gray-800 last:border-0 ${hasConflict ? "bg-amber-50/70 dark:bg-amber-950/20 border-l-[3px] border-l-amber-500" : isOwner ? "bg-indigo-50 dark:bg-indigo-900/20 border-l-[3px] border-l-indigo-500 dark:border-l-indigo-400" : "hover:bg-gray-50 dark:hover:bg-gray-800/30"}`}>
                            {/* Pages */}
                            <td className="px-5 py-3 font-medium text-gray-900 dark:text-white whitespace-nowrap">
                              {isEditing ? (
                                <div className="flex flex-col gap-1">
                                  <div className="flex items-center gap-1">
                                    <input type="number" value={e.page_start}
                                      onChange={ev => setEditing(prev => ({ ...prev, [seg.id]: { ...prev[seg.id], page_start: ev.target.value } }))}
                                      className="w-20 h-8 px-2 text-sm rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-800 dark:text-gray-200 focus:outline-none focus:ring-1 focus:ring-indigo-400"
                                      placeholder="start" />
                                    <span className="text-gray-400 text-sm">–</span>
                                    <input type="number" value={e.page_end}
                                      onChange={ev => setEditing(prev => ({ ...prev, [seg.id]: { ...prev[seg.id], page_end: ev.target.value } }))}
                                      className="w-20 h-8 px-2 text-sm rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-800 dark:text-gray-200 focus:outline-none focus:ring-1 focus:ring-indigo-400"
                                      placeholder="end" />
                                  </div>
                                  {e.page_end && zipcodeInfo && parseInt(e.page_end) > zipcodeInfo.total_pages && (
                                    <p className="text-xs text-amber-500 whitespace-normal leading-tight">
                                      <AlertTriangle className="mr-1 inline h-3 w-3" aria-hidden="true" /> Exceeds max of {zipcodeInfo.total_pages.toLocaleString()} pages. Double-check the A-Z site.
                                    </p>
                                  )}
                                </div>
                              ) : (
                                <>
                                  {seg.page_start}{seg.page_end ? ` – ${seg.page_end}` : "+"}
                                  {hasConflict && (
                                    <span className="ml-2 inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-800 dark:bg-amber-900/50 dark:text-amber-200">
                                      <AlertTriangle className="h-3 w-3" aria-hidden="true" /> Conflict
                                    </span>
                                  )}
                                  {isOwner && (
                                    <span className="ml-1.5 text-xs font-semibold text-indigo-500 uppercase tracking-wide">you</span>
                                  )}
                                </>
                              )}
                            </td>

                            {/* Owner */}
                            <td className="px-4 py-3">
                              <div>
                                {isOwner ? (
                                  <span className="font-bold text-indigo-700 dark:text-indigo-300">{displayOwner}</span>
                                ) : (
                                  <span className="text-gray-600 dark:text-gray-400">{displayOwner || "—"}</span>
                                )}
                                {displayOwnerIsUploader ? <p className="mt-1 text-xs font-medium text-muted-foreground">Uploader</p> : null}
                              </div>
                              {editErrors[seg.id] && <p role="alert" className="mt-2 max-w-56 text-xs font-medium text-red-600 dark:text-red-400">{editErrors[seg.id]}</p>}
                            </td>

                            {/* Status */}
                            <td className="px-4 py-3">
                              {isEditing ? (
                                <select
                                  value={e.status}
                                  onChange={ev => setEditing(prev => ({ ...prev, [seg.id]: { ...prev[seg.id], status: ev.target.value } }))}
                                  className="h-8 px-2 text-sm rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-800 dark:text-gray-200 focus:outline-none focus:ring-1 focus:ring-indigo-400"
                                >
                                  <option>Not started</option>
                                  <option>In progress</option>
                                  <option>Completed</option>
                                </select>
                              ) : (
                                <span className={`text-sm font-medium px-2.5 py-0.5 rounded-full ${STATUS_STYLES[seg.status] ?? STATUS_STYLES["Not started"]}`}>
                                  {seg.status}
                                </span>
                              )}
                            </td>

                            {/* Updated */}
                            <td className="px-4 py-3 text-xs text-gray-400 whitespace-nowrap">
                              {timeAgo(seg.updated_at)}
                            </td>

                            {/* Actions */}
                            <td className="px-4 py-3">
                              {canEdit ? (
                                isEditing ? (
                                  <div className="flex items-center gap-1.5">
                                    <button onClick={() => saveEdit(seg.id)} disabled={isSaving}
                                      className="px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold disabled:opacity-50 transition-colors">
                                      {isSaving ? "…" : "Save"}
                                    </button>
                                    <button onClick={() => cancelEdit(seg.id)}
                                      className="px-3 py-1.5 rounded-lg bg-gray-100 hover:bg-gray-200 dark:bg-gray-800 dark:hover:bg-gray-700 text-gray-600 dark:text-gray-400 text-sm font-semibold transition-colors">
                                      Cancel
                                    </button>
                                  </div>
                                ) : isConfirming ? (
                                  <div className="flex items-center gap-1.5">
                                    <span className={`text-sm font-medium ${isAssignedPackage ? "text-amber-600 dark:text-amber-400" : "text-red-500"}`}>
                                      {isAssignedPackage ? "Make available?" : "Delete?"}
                                    </span>
                                    <button onClick={() => deleteSeg(seg.id)}
                                      className="px-2.5 py-1 rounded-lg bg-red-500 hover:bg-red-600 text-white text-xs font-semibold transition-colors">
                                      Yes
                                    </button>
                                    <button onClick={() => setConfirming(prev => { const s = new Set(prev); s.delete(seg.id); return s })}
                                      className="px-2.5 py-1 rounded-lg bg-gray-100 hover:bg-gray-200 dark:bg-gray-800 dark:hover:bg-gray-700 text-gray-600 dark:text-gray-400 text-xs font-semibold transition-colors">
                                      No
                                    </button>
                                  </div>
                                ) : (
                                  <div className="flex items-center gap-1.5">
                                    <button onClick={() => startEdit(seg)}
                                      className="px-3 py-1.5 rounded-lg bg-indigo-100 hover:bg-indigo-200 dark:bg-indigo-900/40 dark:hover:bg-indigo-900/60 text-indigo-700 dark:text-indigo-300 text-sm font-semibold transition-colors">
                                      Update
                                    </button>
                                    {(!seg.package_id || isAssignedPackage) ? <button onClick={() => setConfirming(prev => new Set(prev).add(seg.id))}
                                      title={isAssignedPackage ? "Remove the owner and return this Excel to Browse Excels" : undefined}
                                      className={`px-3 py-1.5 rounded-lg text-sm font-semibold transition-colors ${isAssignedPackage ? "bg-amber-100 text-amber-800 hover:bg-amber-200 dark:bg-amber-900/30 dark:text-amber-300 dark:hover:bg-amber-900/50" : "bg-red-100 hover:bg-red-200 dark:bg-red-900/30 dark:hover:bg-red-900/50 text-red-600 dark:text-red-400"}`}>
                                      {isAssignedPackage ? "Unassign" : "Delete"}
                                    </button> : null}
                                  </div>
                                )
                              ) : isAvailablePackage ? (
                                <span className="text-xs font-semibold text-muted-foreground">Available Excel</span>
                              ) : isPrivatePackage ? (
                                <span className="text-xs font-semibold text-muted-foreground">Private Excel</span>
                              ) : null}
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

          </>
        )}
      </main>
    </div>
  )
}
