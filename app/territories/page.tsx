"use client"

import { useEffect, useState, useMemo } from "react"
import Link from "next/link"
import { ThemeSwitcher } from "@/components/theme-switcher"

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

type MySegment = {
  id: number
  page_start: number
  page_end: number | null
  owner: string
  stopped_at_page: number | null
  status: string
  notes: string
  updated_at: string
  city: string
  zipcode: string
  total_pages: number
}

function pct(a: number, total: number) {
  return total > 0 ? Math.round((a / total) * 100) : 0
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

const STATUS_STYLES: Record<string, string> = {
  "Completed":   "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300",
  "In progress": "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300",
  "Not started": "bg-gray-100  text-gray-500  dark:bg-gray-800     dark:text-gray-400",
}

const FEATURES = [
  { icon: "📍", title: "Territory dashboard", desc: "All zipcodes grouped by city with live segmented progress bars." },
  { icon: "📋", title: "Your segments at a glance", desc: "Active and not-started segments shown front and centre after sign-in." },
  { icon: "✋", title: "Claim a page range", desc: "Open any zipcode and claim a start–end page range in one tap." },
  { icon: "✏️", title: "Update your progress", desc: "Set the page you stopped at and flip the status right from the dashboard." },
  { icon: "📊", title: "Live progress tracking", desc: "Bars update in real time across all territories as work is logged." },
]

// ── Welcome card (shown to unsigned-in users) ─────────────────────────────────
function WelcomeCard({ knownUsers, onSelect }: { knownUsers: string[]; onSelect: (name: string) => void }) {
  const [showSignIn, setShowSignIn] = useState(false)
  const [tab, setTab]       = useState<"pick" | "new">("pick")
  const [newName, setNewName] = useState("")

  // Once users load, always default to "pick"; only fall back to "new" if truly empty
  useEffect(() => {
    if (knownUsers.length > 0) setTab("pick")
    else setTab("new")
  }, [knownUsers])

  const submit = () => { const n = newName.trim(); if (n) onSelect(n) }

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center px-4 bg-black/40 backdrop-blur-sm">
      <div className="bg-white dark:bg-gray-900 rounded-3xl shadow-2xl border border-gray-200 dark:border-gray-700 w-full max-w-lg overflow-hidden">

        {/* Header */}
        <div className="px-8 pt-8 pb-5 text-center border-b border-gray-100 dark:border-gray-800">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-indigo-100 dark:bg-indigo-900/40 text-3xl mb-3">📍</div>
          <h2 className="text-2xl font-bold text-gray-900 dark:text-white">Welcome to Zipcode Tracker</h2>
        </div>

        {/* Feature list */}
        {!showSignIn && (
          <div className="px-8 py-6 flex flex-col gap-4">
            {FEATURES.map((f, i) => (
              <div key={i} className="flex items-start gap-3">
                <span className="shrink-0 w-9 h-9 rounded-lg bg-indigo-50 dark:bg-indigo-900/30 flex items-center justify-center text-lg">{f.icon}</span>
                <div>
                  <p className="text-sm font-bold text-gray-800 dark:text-gray-200">{f.title}</p>
                  <p className="text-sm text-gray-400 leading-relaxed">{f.desc}</p>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Sign-in form (revealed on button click) */}
        {showSignIn && (
          <div className="px-8 py-6">
            {knownUsers.length > 0 && (
              <div className="flex gap-1 p-1 bg-gray-100 dark:bg-gray-800 rounded-xl mb-4">
                {(["pick", "new"] as const).map(t => (
                  <button key={t} onClick={() => setTab(t)}
                    className={`flex-1 py-2 rounded-lg text-sm font-semibold transition-all duration-200 ${tab === t ? "bg-indigo-600 text-white shadow-[0_0_14px_rgba(99,102,241,0.65)]" : "text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300"}`}>
                    {t === "pick" ? "Select existing" : "New user"}
                  </button>
                ))}
              </div>
            )}
            {tab === "pick" ? (
              <div className="flex flex-col gap-2 max-h-52 overflow-y-auto pr-1">
                {knownUsers.map(name => (
                  <button key={name} onClick={() => onSelect(name)}
                    className="w-full text-left px-4 py-3 rounded-xl border border-gray-200 dark:border-gray-700 hover:border-indigo-400 dark:hover:border-indigo-600 hover:bg-indigo-50 dark:hover:bg-indigo-900/20 text-base font-medium text-gray-800 dark:text-gray-200 transition-all">
                    {name}
                  </button>
                ))}
              </div>
            ) : (
              <div className="flex flex-col gap-3">
                <input autoFocus value={newName} onChange={e => setNewName(e.target.value)} onKeyDown={e => e.key === "Enter" && submit()}
                  placeholder="Enter your name…"
                  className="h-11 px-3 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-800 dark:text-gray-200 text-base focus:outline-none focus:ring-2 focus:ring-indigo-400" />
                <button onClick={submit} disabled={!newName.trim()}
                  className="h-11 rounded-xl bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white text-base font-semibold transition-colors">
                  Continue
                </button>
              </div>
            )}
          </div>
        )}

        {/* Footer CTA */}
        <div className="px-8 pb-8 pt-2">
          {!showSignIn ? (
            <button onClick={() => setShowSignIn(true)}
              className="w-full h-12 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-semibold text-base transition-colors shadow-sm">
              Sign in to get started →
            </button>
          ) : (
            <button onClick={() => setShowSignIn(false)}
              className="w-full text-center text-sm text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors pt-1">
              ← Back to overview
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

// ── Name Picker Modal (for "Change" from nav when already signed in) ───────────
function NamePickerModal({ knownUsers, onSelect }: { knownUsers: string[]; onSelect: (name: string) => void }) {
  const [newName, setNewName] = useState("")
  const [tab, setTab] = useState<"pick" | "new">(knownUsers.length > 0 ? "pick" : "new")

  useEffect(() => {
    if (knownUsers.length > 0) setTab("pick")
  }, [knownUsers])

  const submit = () => { const n = newName.trim(); if (n) onSelect(n) }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm px-4">
      <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-2xl border border-gray-200 dark:border-gray-700 w-full max-w-sm overflow-hidden">
        <div className="px-6 py-5 border-b border-gray-100 dark:border-gray-800">
          <h2 className="text-lg font-bold text-gray-900 dark:text-white">Who are you?</h2>
          <p className="text-sm text-gray-400 mt-0.5">Pick your name to track your segments.</p>
        </div>
        {knownUsers.length > 0 && (
          <div className="flex gap-1 p-1.5 bg-gray-100 dark:bg-gray-800 mx-6 mt-4 rounded-xl">
            {(["pick", "new"] as const).map(t => (
              <button key={t} onClick={() => setTab(t)}
                className={`flex-1 py-1.5 rounded-lg text-xs font-semibold transition-all duration-200 ${tab === t ? "bg-indigo-600 text-white shadow-[0_0_14px_rgba(99,102,241,0.65)]" : "text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300"}`}>
                {t === "pick" ? "Select existing" : "New user"}
              </button>
            ))}
          </div>
        )}
        <div className="px-6 py-5">
          {tab === "pick" ? (
            <div className="flex flex-col gap-2 max-h-64 overflow-y-auto pr-1">
              {knownUsers.map(name => (
                <button key={name} onClick={() => onSelect(name)}
                  className="w-full text-left px-4 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 hover:border-indigo-400 dark:hover:border-indigo-600 hover:bg-indigo-50 dark:hover:bg-indigo-900/20 text-sm font-medium text-gray-800 dark:text-gray-200 transition-all">
                  {name}
                </button>
              ))}
            </div>
          ) : (
            <div className="flex flex-col gap-3">
              <input autoFocus value={newName} onChange={e => setNewName(e.target.value)} onKeyDown={e => e.key === "Enter" && submit()}
                placeholder="Enter your name…"
                className="h-10 px-3 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-800 dark:text-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400" />
              <button onClick={submit} disabled={!newName.trim()}
                className="h-10 rounded-xl bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white text-sm font-semibold transition-colors">
                Continue
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// ── Add Zipcode Modal ─────────────────────────────────────────────────────────
function AddZipcodeModal({ onClose, onAdded, territory }: { onClose: () => void; onAdded: () => void; territory: string }) {
  const [city, setCity] = useState("")
  const [zipcode, setZipcode] = useState("")
  const [totalPages, setTotalPages] = useState("")
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState("")

  const submit = async () => {
    setError("")
    const pages = parseInt(totalPages)
    if (!city.trim() || !zipcode.trim() || !pages || pages < 1) { setError("All fields are required."); return }
    setSaving(true)
    const res = await fetch("/api/territories/zipcodes", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ city: city.trim(), zipcode: zipcode.trim(), total_pages: pages, territory: territory || "Lacy Boulevard" }) })
    setSaving(false)
    if (res.ok) { onAdded(); onClose() } else { const d = await res.json(); setError(d.error ?? "Failed to add zipcode.") }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm px-4">
      <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-2xl border border-gray-200 dark:border-gray-700 w-full max-w-sm overflow-hidden">
        <div className="px-6 py-5 border-b border-gray-100 dark:border-gray-800 flex items-center justify-between">
          <h2 className="text-lg font-bold text-gray-900 dark:text-white">Add Zipcode</h2>
          <button type="button" onClick={onClose} aria-label="Close add zipcode dialog" className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 text-xl leading-none">×</button>
        </div>
        <div className="px-6 py-5 flex flex-col gap-4">
          {[["City", city, setCity, "e.g. Alexandria"], ["Zipcode", zipcode, setZipcode, "e.g. 22314"]].map(([label, val, setter, ph]) => (
            <div key={label as string}>
              <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1.5">{label as string}</label>
              <input value={val as string} onChange={e => (setter as (v: string) => void)(e.target.value)} placeholder={ph as string}
                className="w-full h-10 px-3 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm text-gray-800 dark:text-gray-200 focus:outline-none focus:ring-2 focus:ring-indigo-400" />
            </div>
          ))}
          <div>
            <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1.5">Total pages in A-Z</label>
            <input type="number" value={totalPages} onChange={e => setTotalPages(e.target.value)} onKeyDown={e => e.key === "Enter" && submit()} placeholder="e.g. 800" min={1}
              className="w-full h-10 px-3 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm text-gray-800 dark:text-gray-200 focus:outline-none focus:ring-2 focus:ring-indigo-400" />
          </div>
          {error && <p className="text-xs text-red-500">{error}</p>}
          <div className="flex gap-2 pt-1">
            <button onClick={onClose} className="flex-1 h-10 rounded-xl border border-gray-200 dark:border-gray-700 text-sm font-semibold text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors">Cancel</button>
            <button onClick={submit} disabled={saving} className="flex-1 h-10 rounded-xl bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white text-sm font-semibold transition-colors">{saving ? "Adding…" : "Add Zipcode"}</button>
          </div>
        </div>
      </div>
    </div>
  )
}

// ── My Segments Panel ─────────────────────────────────────────────────────────
function MySegmentsPanel({ userName }: { userName: string }) {
  const [segments, setSegments]           = useState<MySegment[]>([])
  const [loading, setLoading]             = useState(true)
  const [editing, setEditing]             = useState<Record<number, { stopped_at_page: string; status: string; page_start: string; page_end: string }>>({})
  const [saving, setSaving]               = useState<Set<number>>(new Set())
  const [confirming, setConfirming]       = useState<Set<number>>(new Set())
  const [completedOpen, setCompletedOpen] = useState(false)

  const load = () => {
    setLoading(true)
    fetch(`/api/territories/segments/mine?owner=${encodeURIComponent(userName)}`)
      .then(r => r.json())
      .then(data => { setSegments(Array.isArray(data) ? data : []); setLoading(false) })
      .catch(() => setLoading(false))
  }

  useEffect(() => { if (userName) load() }, [userName])

  const startEdit  = (seg: MySegment) =>
    setEditing(prev => ({ ...prev, [seg.id]: {
      stopped_at_page: seg.stopped_at_page?.toString() ?? "",
      status: seg.status,
      page_start: seg.page_start.toString(),
      page_end: seg.page_end?.toString() ?? "",
    }}))
  const cancelEdit = (id: number) =>
    setEditing(prev => { const n = { ...prev }; delete n[id]; return n })

  const saveEdit = async (id: number) => {
    const e = editing[id]; if (!e) return
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
    if (res.ok) { cancelEdit(id); load() }
  }

  const deleteSeg = async (id: number) => {
    await fetch(`/api/territories/segments?id=${id}`, { method: "DELETE" })
    setConfirming(prev => { const s = new Set(prev); s.delete(id); return s })
    load()
  }

  if (loading) return (
    <div className="mb-8 bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-800 p-5 shadow-sm">
      <div className="h-4 w-40 bg-gray-100 dark:bg-gray-800 rounded animate-pulse" />
    </div>
  )

  if (segments.length === 0) return (
    <div className="mb-8 bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-800 p-5 shadow-sm">
      <p className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1">Your segments</p>
      <p className="text-sm text-gray-400">You don&apos;t have any segments yet. Open a zipcode and claim a page range!</p>
    </div>
  )

  const inProgress = segments.filter(s => s.status === "In progress")
  const notStarted = segments.filter(s => s.status === "Not started")
  const completed  = segments.filter(s => s.status === "Completed")
  const active     = [...inProgress, ...notStarted]

  const renderSegRow = (seg: MySegment) => {
    const isEditing    = !!editing[seg.id]
    const isSaving     = saving.has(seg.id)
    const isConfirming = confirming.has(seg.id)
    const e            = editing[seg.id]
    return (
      <tr key={seg.id} className="border-b border-gray-100 dark:border-gray-800 last:border-0 hover:bg-gray-50 dark:hover:bg-gray-800/30">
        <td className="px-5 py-3">
          <Link href={`/territories/${seg.zipcode}`} className="font-semibold text-indigo-600 dark:text-indigo-400 hover:underline text-sm">
            {seg.city} {seg.zipcode}
          </Link>
        </td>
        <td className="px-4 py-3 font-medium text-gray-900 dark:text-white whitespace-nowrap text-base">
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
              {e.page_end && parseInt(e.page_end) > seg.total_pages && (
                <p className="text-xs text-amber-500 whitespace-normal leading-tight">
                  ⚠ Exceeds max of {seg.total_pages.toLocaleString()} pages. Double-check the A-Z site.
                </p>
              )}
            </div>
          ) : (
            `${seg.page_start}${seg.page_end ? ` – ${seg.page_end}` : "+"}`
          )}
        </td>
        <td className="px-4 py-3 text-gray-500 text-base">
          {isEditing ? (
            <input type="number" value={e.stopped_at_page}
              onChange={ev => setEditing(prev => ({ ...prev, [seg.id]: { ...prev[seg.id], stopped_at_page: ev.target.value } }))}
              className="w-24 h-8 px-2 text-sm rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-800 dark:text-gray-200 focus:outline-none focus:ring-1 focus:ring-indigo-400"
              placeholder="page #" />
          ) : (seg.stopped_at_page ?? "—")}
        </td>
        <td className="px-4 py-3">
          {isEditing ? (
            <select value={e.status} onChange={ev => setEditing(prev => ({ ...prev, [seg.id]: { ...prev[seg.id], status: ev.target.value } }))}
              className="h-8 px-2 text-sm rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-800 dark:text-gray-200 focus:outline-none focus:ring-1 focus:ring-indigo-400">
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
        <td className="px-4 py-3 text-xs text-gray-400 whitespace-nowrap">
          {timeAgo(seg.updated_at)}
        </td>
        <td className="px-4 py-3">
          {isEditing ? (
            <div className="flex gap-1.5">
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
            <div className="flex gap-1.5">
              <button onClick={() => startEdit(seg)}
                className="px-3 py-1.5 rounded-lg bg-indigo-100 hover:bg-indigo-200 dark:bg-indigo-900/40 dark:hover:bg-indigo-900/60 text-indigo-700 dark:text-indigo-300 text-sm font-semibold transition-colors">
                Update
              </button>
              <button onClick={() => setConfirming(prev => new Set(prev).add(seg.id))}
                className="px-3 py-1.5 rounded-lg bg-red-100 hover:bg-red-200 dark:bg-red-900/30 dark:hover:bg-red-900/50 text-red-600 dark:text-red-400 text-sm font-semibold transition-colors">
                Delete
              </button>
            </div>
          )}
        </td>
      </tr>
    )
  }

  return (
    <div className="mb-8 bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-800 shadow-sm overflow-hidden">
      {/* Panel header */}
      <div className="px-5 py-3 border-b border-gray-100 dark:border-gray-800 flex items-center justify-between">
        <span className="text-base font-semibold text-gray-700 dark:text-gray-300">
          Your segments
          <span className="ml-2 text-sm font-normal text-gray-400">({segments.length})</span>
        </span>
        <div className="flex gap-3 text-sm text-gray-400">
          {inProgress.length > 0 && <span className="text-amber-500 font-medium">{inProgress.length} in progress</span>}
          {notStarted.length > 0 && <span>{notStarted.length} not started</span>}
          {completed.length  > 0 && <span className="text-green-600 font-medium">{completed.length} done</span>}
        </div>
      </div>

      {/* Active segments table (In progress + Not started) */}
      {active.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 dark:border-gray-800">
                <th className="text-left px-5 py-2.5 text-sm font-semibold text-gray-400 uppercase tracking-wide">Zipcode</th>
                <th className="text-left px-4 py-2.5 text-sm font-semibold text-gray-400 uppercase tracking-wide">Pages</th>
                <th className="text-left px-4 py-2.5 text-sm font-semibold text-gray-400 uppercase tracking-wide">Stopped at</th>
                <th className="text-left px-4 py-2.5 text-sm font-semibold text-gray-400 uppercase tracking-wide">Status</th>
                <th className="text-left px-4 py-2.5 text-sm font-semibold text-gray-400 uppercase tracking-wide">Updated</th>
                <th className="px-4 py-2"></th>
              </tr>
            </thead>
            <tbody>
              {active.map(seg => renderSegRow(seg))}
            </tbody>
          </table>
        </div>
      )}

      {active.length === 0 && completed.length > 0 && (
        <p className="px-5 py-4 text-sm text-gray-400">All your segments are completed 🎉</p>
      )}

      {/* Completed dropdown */}
      {completed.length > 0 && (
        <div className="border-t border-gray-100 dark:border-gray-800">
          <button
            onClick={() => setCompletedOpen(o => !o)}
            className="w-full flex items-center justify-between px-5 py-3 text-sm font-semibold text-gray-500 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800/40 transition-colors"
          >
            <span className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-green-500 inline-block" />
              Completed ({completed.length})
            </span>
            <span className={`transition-transform duration-200 ${completedOpen ? "rotate-180" : ""}`}>▾</span>
          </button>
          {completedOpen && (
            <div className="overflow-x-auto border-t border-gray-100 dark:border-gray-800">
              <table className="w-full text-sm">
                <tbody>
                  {completed.map(seg => renderSegRow(seg))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ── Main Page ─────────────────────────────────────────────────────────────────
export default function Home() {
  const [zipcodes, setZipcodes]     = useState<ZipcodeRow[]>([])
  const [loading, setLoading]       = useState(true)
  const [userName, setUserName]     = useState("")
  const [knownUsers, setKnownUsers] = useState<string[]>([])
  const [showPicker, setShowPicker]           = useState(false)
  const [showAddZip, setShowAddZip]           = useState(false)
  const [hydrated, setHydrated]               = useState(false)
  const [activeTerritory, setActiveTerritory] = useState("")

  useEffect(() => {
    const saved = localStorage.getItem("userId")
    if (saved) setUserName(saved)
    // Restore territory from session so back-button works
    const savedTerritory = sessionStorage.getItem("zt_territory")
    if (savedTerritory) setActiveTerritory(savedTerritory)
    setHydrated(true)
    loadZipcodes(savedTerritory ?? "")
    fetch("/api/territories/users")
      .then(r => r.json())
      .then((data: string[]) => setKnownUsers(data))
      .catch(() => {})
  }, [])

  const loadZipcodes = (currentTerritory = activeTerritory) => {
    fetch("/api/territories/zipcodes")
      .then(r => r.json())
      .then(data => {
        setZipcodes(data)
        setLoading(false)
        // Auto-select first territory only if none is already set
        if (!currentTerritory && data.length > 0) {
          const first = data[0].territory
          setActiveTerritory(first)
          sessionStorage.setItem("zt_territory", first)
        }
      })
      .catch(() => setLoading(false))
  }

  const selectName = (name: string) => {
    localStorage.setItem("userId", name)
    localStorage.setItem("zt_seen_overview", "1")
    setUserName(name)
    setShowPicker(false)
    // Persist the name to DB so it's available on any device
    fetch("/api/territories/users", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name }),
    }).catch(() => {})
  }

  // Group: territory → city → rows
  const grouped = useMemo(() => {
    const map: Record<string, Record<string, ZipcodeRow[]>> = {}
    for (const z of zipcodes) {
      if (!map[z.territory]) map[z.territory] = {}
      if (!map[z.territory][z.city]) map[z.territory][z.city] = []
      map[z.territory][z.city].push(z)
    }
    return map
  }, [zipcodes])

  // Show welcome card for unsigned-in users (after hydration)
  const showWelcome = hydrated && !userName

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950">

      {/* Welcome card overlay for new / unsigned-in users */}
      {showWelcome && <WelcomeCard knownUsers={knownUsers} onSelect={selectName} />}

      {/* Change-name modal (for already signed-in users) */}
      {showPicker && hydrated && userName && <NamePickerModal knownUsers={knownUsers} onSelect={selectName} />}

      {showAddZip && <AddZipcodeModal territory={activeTerritory} onClose={() => setShowAddZip(false)} onAdded={() => { setLoading(true); loadZipcodes() }} />}

      {/* Nav */}
      <nav className="sticky top-0 z-30 bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-800 shadow-sm">
        <div className="max-w-5xl mx-auto px-4 h-14 flex items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <span className="text-lg">📍</span>
            <span className="text-lg font-bold text-gray-900 dark:text-white">Zipcode Tracker</span>
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
            {hydrated && <ThemeSwitcher className="h-9 w-9 rounded-lg shadow-none hover:translate-y-0 hover:bg-gray-100 dark:hover:bg-gray-800" />}
            {hydrated && userName ? (
              <>
                <span className="px-3 py-1 rounded-full bg-indigo-50 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-300 text-sm font-semibold">
                  {userName}
                </span>
                <button onClick={() => setShowPicker(true)} className="text-sm text-gray-400 hover:text-indigo-500 transition-colors">
                  Change
                </button>
              </>
            ) : hydrated && (
              <button onClick={() => setShowPicker(true)} className="h-9 px-4 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold transition-colors">
                Sign in
              </button>
            )}
          </div>
        </div>
      </nav>

      <main className="max-w-5xl mx-auto px-4 py-8">

        {/* Territory tab switcher + Add Zipcode */}
        <div className="flex items-center justify-between mb-8 gap-4">
          {/* Pill tabs */}
          {!loading && Object.keys(grouped).length > 0 && (
            <div className="flex gap-1 p-1 bg-gray-100 dark:bg-gray-800 rounded-xl">
              {Object.keys(grouped).map(t => (
                <button key={t} onClick={() => { setActiveTerritory(t); sessionStorage.setItem("zt_territory", t) }}
                  className={`px-4 py-1.5 rounded-lg text-sm font-semibold transition-all duration-200 whitespace-nowrap ${
                    activeTerritory === t
                      ? "bg-indigo-600 text-white shadow-[0_0_14px_rgba(99,102,241,0.65)]"
                      : "text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300"
                  }`}>
                  {t}
                </button>
              ))}
            </div>
          )}
          <button onClick={() => setShowAddZip(true)}
            className="shrink-0 inline-flex items-center gap-1.5 h-9 px-4 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold transition-colors shadow-sm">
            <span className="text-base leading-none">+</span> Add Zipcode
          </button>
        </div>

        {/* My segments — only shown when signed in */}
        {hydrated && userName && <MySegmentsPanel userName={userName} />}

        {/* Loading spinner */}
        {loading && (
          <div className="flex items-center justify-center py-24">
            <div className="w-6 h-6 rounded-full border-2 border-indigo-500 border-t-transparent animate-spin" />
          </div>
        )}

        {/* Active territory content */}
        {!loading && activeTerritory && grouped[activeTerritory] && (() => {
          const cityMap     = grouped[activeTerritory]
          const tRows       = Object.values(cityMap).flat()
          const tSegs       = tRows.reduce((a, z) => a + z.segment_count, 0)
          const tCompleted  = tRows.reduce((a, z) => a + z.completed,     0)
          const tInProgress = tRows.reduce((a, z) => a + z.in_progress,   0)
          const tNotStarted = tRows.reduce((a, z) => a + z.not_started,   0)
          const tPct        = pct(tCompleted, tSegs)

          return (
            <div>
              {/* Territory progress bar */}
              <div className="mb-8 bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-800 p-5 shadow-sm">
                <div className="flex items-center justify-between mb-3">
                  <span className="text-base font-semibold text-gray-700 dark:text-gray-300">Overall Progress</span>
                  <span className="text-base font-bold text-indigo-600 dark:text-indigo-400">{tPct}%</span>
                </div>
                <div className="h-2 w-full bg-gray-100 dark:bg-gray-800 rounded-full overflow-hidden">
                  <div className="h-full bg-gradient-to-r from-indigo-500 to-purple-500 rounded-full transition-all duration-500" style={{ width: `${tPct}%` }} />
                </div>
                <div className="flex gap-4 mt-3 text-sm text-gray-500 dark:text-gray-400">
                  <span><span className="font-semibold text-green-600">{tCompleted}</span> completed</span>
                  <span><span className="font-semibold text-amber-500">{tInProgress}</span> in progress</span>
                  <span><span className="font-semibold text-gray-400">{tNotStarted}</span> not started</span>
                </div>
              </div>

              {/* Cities + zipcodes */}
              <div className="flex flex-col gap-8">
                {Object.entries(cityMap).map(([city, rows]) => (
                  <div key={city}>
                    <h3 className="text-base font-extrabold uppercase tracking-widest text-gray-700 dark:text-gray-300 mb-3">
                      {city}
                    </h3>
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                      {rows.map(z => {
                        const compPct = pct(z.completed,   z.segment_count)
                        const ipPct   = pct(z.in_progress, z.segment_count)
                        const nsPct   = pct(z.not_started, z.segment_count)
                        const allDone = z.segment_count > 0 && z.not_started === 0 && z.in_progress === 0
                        return (
                          <Link key={z.zipcode} href={`/territories/${z.zipcode}`}
                            className="group block bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-800 p-5 shadow-sm hover:shadow-md hover:border-indigo-300 dark:hover:border-indigo-700 transition-all">
                            <div className="flex items-start justify-between mb-3">
                              <div>
                                <p className="text-xl font-bold text-gray-900 dark:text-white group-hover:text-indigo-600 dark:group-hover:text-indigo-400 transition-colors">{z.zipcode}</p>
                                <p className="text-sm text-gray-400">{z.total_pages.toLocaleString()} pages</p>
                              </div>
                              {allDone ? (
                                <span className="text-sm font-semibold px-2.5 py-0.5 rounded-full bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300">✓ Done</span>
                              ) : z.segment_count === 0 ? (
                                <span className="text-sm font-semibold px-2.5 py-0.5 rounded-full bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400">Open</span>
                              ) : (
                                <span className="text-sm font-semibold px-2.5 py-0.5 rounded-full bg-indigo-50 text-indigo-600 dark:bg-indigo-900/30 dark:text-indigo-300">{compPct}%</span>
                              )}
                            </div>
                            <div className="h-2 w-full rounded-full overflow-hidden flex gap-0.5 mb-3">
                              {z.segment_count === 0 ? (
                                <div className="flex-1 bg-gray-100 dark:bg-gray-800 rounded-full" />
                              ) : (
                                <>
                                  {compPct > 0 && <div className="bg-green-500 rounded-l-full" style={{ width: `${compPct}%` }} />}
                                  {ipPct   > 0 && <div className="bg-amber-400"               style={{ width: `${ipPct}%`  }} />}
                                  {nsPct   > 0 && <div className="bg-gray-200 dark:bg-gray-700 rounded-r-full" style={{ width: `${nsPct}%` }} />}
                                </>
                              )}
                            </div>
                            <div className="flex gap-3 text-sm text-gray-500 dark:text-gray-400">
                              <span>{z.segment_count} segment{z.segment_count !== 1 ? "s" : ""}</span>
                              {z.completed   > 0 && <span className="text-green-600">{z.completed} done</span>}
                              {z.in_progress > 0 && <span className="text-amber-500">{z.in_progress} active</span>}
                              {z.not_started > 0 && <span className="text-gray-400">{z.not_started} open</span>}
                            </div>
                          </Link>
                        )
                      })}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )
        })()}
      </main>
    </div>
  )
}
