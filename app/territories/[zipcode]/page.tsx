"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { ThemeSwitcher } from "@/components/theme-switcher"

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
  city: string
  zipcode: string
  total_pages: number
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

  const [zipcodeInfo, setZipcodeInfo] = useState<ZipcodeInfo | null>(null)
  const [segments, setSegments]       = useState<Segment[]>([])
  const [loading, setLoading]         = useState(true)
  const [userName, setUserName]       = useState("")

  // Claim form
  const [claimStart, setClaimStart]   = useState("")
  const [claimEnd, setClaimEnd]       = useState("")
  const [claiming, setClaiming]       = useState(false)
  const [claimError, setClaimError]   = useState("")

  // Inline edit state: segmentId → { stopped_at_page, status, page_start, page_end }
  const [editing, setEditing]   = useState<Record<number, { stopped_at_page: string; status: string; page_start: string; page_end: string }>>({})
  const [saving, setSaving]     = useState<Set<number>>(new Set())
  const [confirming, setConfirming] = useState<Set<number>>(new Set())

  useEffect(() => {
    const saved = localStorage.getItem("userId")
    if (saved) setUserName(saved)
    loadData()
  }, [zipcode])

  const loadData = async () => {
    setLoading(true)
    try {
      const res = await fetch(`/api/territories/segments?zipcode=${zipcode}`)
      const data = await res.json()
      if (!res.ok) { setLoading(false); return }
      setZipcodeInfo(data.zipcode)
      setSegments(data.segments)
    } catch { /* ignore */ }
    setLoading(false)
  }

  const claim = async () => {
    setClaimError("")
    if (!userName) { setClaimError("Set your name in the top bar first."); return }
    const start = parseInt(claimStart)
    const end   = claimEnd ? parseInt(claimEnd) : null
    if (!start || start < 1) { setClaimError("Enter a valid start page."); return }
    if (end && end <= start) { setClaimError("End page must be greater than start."); return }

    setClaiming(true)
    const res = await fetch("/api/territories/segments", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ zipcode, page_start: start, page_end: end, owner: userName }),
    })
    setClaiming(false)
    if (res.ok) {
      setClaimStart("")
      setClaimEnd("")
      loadData()
    } else {
      const d = await res.json()
      setClaimError(d.error ?? "Failed to claim segment.")
    }
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
    const res = await fetch("/api/territories/segments", {
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
      cancelEdit(id)
      loadData()
    }
  }

  const deleteSeg = async (id: number) => {
    await fetch(`/api/territories/segments?id=${id}`, { method: "DELETE" })
    setConfirming(prev => { const s = new Set(prev); s.delete(id); return s })
    loadData()
  }

  const completedCount  = segments.filter(s => s.status === "Completed").length
  const inProgressCount = segments.filter(s => s.status === "In progress").length
  const notStartedCount = segments.filter(s => s.status === "Not started").length
  const compPct = pct(completedCount,  segments.length)
  const ipPct   = pct(inProgressCount, segments.length)
  const nsPct   = pct(notStartedCount, segments.length)

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950">

      {/* ── Nav ── */}
      <nav className="sticky top-0 z-30 bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-800 shadow-sm">
        <div className="max-w-4xl mx-auto px-4 h-14 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <Link href="/territories" className="text-gray-400 hover:text-gray-700 dark:hover:text-gray-300 transition-colors text-base">
              ← Back
            </Link>
            <span className="text-gray-200 dark:text-gray-700">|</span>
            <span className="text-lg font-bold text-gray-900 dark:text-white">
              {loading ? zipcode : `${zipcodeInfo?.city ?? ""} ${zipcode}`}
            </span>
          </div>
          <div className="flex items-center gap-2">
            {/* OTMRT Helper link */}
            <Link
              href="/"
              className="hidden sm:flex items-center gap-1.5 h-9 px-3 rounded-lg text-sm font-semibold text-emerald-700 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-900/30 hover:bg-emerald-100 dark:hover:bg-emerald-900/50 transition-colors"
              title="Open OTMRT Helper site"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>
                <polyline points="15 3 21 3 21 9"/>
                <line x1="10" y1="14" x2="21" y2="3"/>
              </svg>
              OTMRT
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
      </nav>

      <main className="max-w-4xl mx-auto px-4 py-8">
        {loading ? (
          <div className="flex items-center justify-center py-24">
            <div className="w-6 h-6 rounded-full border-2 border-indigo-500 border-t-transparent animate-spin" />
          </div>
        ) : !zipcodeInfo ? (
          <p className="text-center text-gray-400 py-24">Zipcode not found.</p>
        ) : (
          <>
            {/* ── Header ── */}
            <div className="mb-6">
              <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-0.5">
                {zipcodeInfo.city} — {zipcode}
              </h1>
              <p className="text-base text-gray-400">{zipcodeInfo.total_pages.toLocaleString()} total pages in A-Z</p>
            </div>

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

            {/* ── Segments table ── */}
            <div className="mb-6 bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-800 shadow-sm overflow-hidden">
              <div className="px-5 py-3 border-b border-gray-100 dark:border-gray-800 flex items-center justify-between">
                <span className="text-base font-semibold text-gray-700 dark:text-gray-300">
                  Segments {segments.length > 0 && <span className="text-gray-400 font-normal">({segments.length})</span>}
                </span>
              </div>

              {segments.length === 0 ? (
                <p className="px-5 py-10 text-center text-gray-400 text-base">
                  No segments claimed yet. Be the first!
                </p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-base">
                    <thead>
                      <tr className="border-b border-gray-100 dark:border-gray-800">
                        <th className="text-left px-5 py-3 text-sm font-semibold text-gray-400 uppercase tracking-wide">Pages</th>
                        <th className="text-left px-4 py-3 text-sm font-semibold text-gray-400 uppercase tracking-wide">Owner</th>
                        <th className="text-left px-4 py-3 text-sm font-semibold text-gray-400 uppercase tracking-wide">Stopped at</th>
                        <th className="text-left px-4 py-3 text-sm font-semibold text-gray-400 uppercase tracking-wide">Status</th>
                        <th className="text-left px-4 py-3 text-sm font-semibold text-gray-400 uppercase tracking-wide">Updated</th>
                        <th className="px-4 py-3"></th>
                      </tr>
                    </thead>
                    <tbody>
                      {segments.map(seg => {
                        const isOwner      = userName && seg.owner.toLowerCase().trim() === userName.toLowerCase().trim()
                        const isEditing    = !!editing[seg.id]
                        const isSaving     = saving.has(seg.id)
                        const isConfirming = confirming.has(seg.id)
                        const e            = editing[seg.id]

                        return (
                          <tr key={seg.id} className={`border-b border-gray-100 dark:border-gray-800 last:border-0 ${isOwner ? "bg-indigo-50 dark:bg-indigo-900/20 border-l-[3px] border-l-indigo-500 dark:border-l-indigo-400" : "hover:bg-gray-50 dark:hover:bg-gray-800/30"}`}>
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
                                      ⚠ Exceeds max of {zipcodeInfo.total_pages.toLocaleString()} pages. Double-check the A-Z site.
                                    </p>
                                  )}
                                </div>
                              ) : (
                                <>
                                  {seg.page_start}{seg.page_end ? ` – ${seg.page_end}` : "+"}
                                  {isOwner && (
                                    <span className="ml-1.5 text-xs font-semibold text-indigo-500 uppercase tracking-wide">you</span>
                                  )}
                                </>
                              )}
                            </td>

                            {/* Owner */}
                            <td className="px-4 py-3">
                              {isOwner ? (
                                <span className="font-bold text-indigo-700 dark:text-indigo-300">{seg.owner}</span>
                              ) : (
                                <span className="text-gray-600 dark:text-gray-400">{seg.owner || "—"}</span>
                              )}
                            </td>

                            {/* Stopped at */}
                            <td className="px-4 py-3 text-gray-500 dark:text-gray-500">
                              {isEditing ? (
                                <input
                                  type="number"
                                  value={e.stopped_at_page}
                                  onChange={ev => setEditing(prev => ({ ...prev, [seg.id]: { ...prev[seg.id], stopped_at_page: ev.target.value } }))}
                                  className="w-24 h-8 px-2 text-sm rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-800 dark:text-gray-200 focus:outline-none focus:ring-1 focus:ring-indigo-400"
                                  placeholder="page #"
                                />
                              ) : (
                                seg.stopped_at_page ?? "—"
                              )}
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
                              {isOwner && (
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
                                    <span className="text-sm text-red-500 font-medium">Delete?</span>
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
                                    <button onClick={() => setConfirming(prev => new Set(prev).add(seg.id))}
                                      className="px-3 py-1.5 rounded-lg bg-red-100 hover:bg-red-200 dark:bg-red-900/30 dark:hover:bg-red-900/50 text-red-600 dark:text-red-400 text-sm font-semibold transition-colors">
                                      Delete
                                    </button>
                                  </div>
                                )
                              )}
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {/* ── Claim a segment ── */}
            <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-800 p-5 shadow-sm">
              <h2 className="text-base font-semibold text-gray-700 dark:text-gray-300 mb-4">
                Claim a page range
              </h2>

              {!userName && (
                <p className="text-sm text-amber-600 dark:text-amber-400 mb-3">
                  ⚠ <Link href="/territories" className="underline">Set your name</Link> on the dashboard first to claim a segment.
                </p>
              )}

              <div className="flex flex-wrap items-end gap-3">
                <div>
                  <label className="block text-sm text-gray-400 mb-1">Start page</label>
                  <input
                    type="number"
                    value={claimStart}
                    onChange={e => setClaimStart(e.target.value)}
                    placeholder="e.g. 501"
                    min={1}
                    max={zipcodeInfo.total_pages}
                    className="h-10 w-32 px-3 text-base rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-800 dark:text-gray-200 focus:outline-none focus:ring-1 focus:ring-indigo-400"
                  />
                </div>
                <div>
                  <label className="block text-sm text-gray-400 mb-1">End page</label>
                  <input
                    type="number"
                    value={claimEnd}
                    onChange={e => setClaimEnd(e.target.value)}
                    placeholder={`e.g. ${zipcodeInfo.total_pages}`}
                    min={1}
                    max={zipcodeInfo.total_pages}
                    className="h-10 w-32 px-3 text-base rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-800 dark:text-gray-200 focus:outline-none focus:ring-1 focus:ring-indigo-400"
                  />
                  {claimEnd && parseInt(claimEnd) > zipcodeInfo.total_pages && (
                    <p className="mt-1.5 text-xs text-amber-500 max-w-[8rem] leading-tight">
                      ⚠ Exceeds max of {zipcodeInfo.total_pages.toLocaleString()} pages. Double-check the A-Z site.
                    </p>
                  )}
                </div>
                <button
                  onClick={claim}
                  disabled={claiming || !userName}
                  className="h-10 px-5 rounded-lg bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white text-base font-semibold transition-colors"
                >
                  {claiming ? "Claiming…" : "Claim segment"}
                </button>
              </div>

              {claimError && (
                <p className="mt-2 text-sm text-red-500">{claimError}</p>
              )}

              <p className="mt-3 text-sm text-gray-400">
                Total pages in this zipcode: <span className="font-semibold text-gray-600 dark:text-gray-300">{zipcodeInfo.total_pages.toLocaleString()}</span>
              </p>
            </div>
          </>
        )}
      </main>
    </div>
  )
}
