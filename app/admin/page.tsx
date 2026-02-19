"use client"

import { useEffect, useState, useCallback, useRef } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"

// ── Types ────────────────────────────────────────────────────────────────────

type ReviewStatus = "pending" | "in_review" | "reviewed"

interface Submission {
  id: number
  user_id: string
  submitted_at: string
  contact_count: number
  potentially_french: number
  not_french: number
  duplicate: number
  not_checked: number
  global_notes: string
  territory_zipcode: string
  territory_page_range: string
  review_status: ReviewStatus
  archived: boolean
  top_zipcode: string | null
}

interface UserGroup {
  userId: string
  submissions: Submission[]
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const STATUS_CLASSES: Record<ReviewStatus, string> = {
  pending:   "bg-amber-100 text-amber-700 border-amber-300 dark:bg-amber-900/30 dark:text-amber-300 dark:border-amber-700",
  in_review: "bg-blue-100 text-blue-700 border-blue-300 dark:bg-blue-900/30 dark:text-blue-300 dark:border-blue-700",
  reviewed:  "bg-green-100 text-green-700 border-green-300 dark:bg-green-900/30 dark:text-green-300 dark:border-green-700",
}

function pct(a: number, total: number) {
  return total > 0 ? Math.round((a / total) * 100) : 0
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function AdminDashboard() {
  const router = useRouter()
  const [activeTab, setActiveTab] = useState<"submissions" | "otm">("submissions")
  const [submissions, setSubmissions] = useState<Submission[]>([])
  const [loading, setLoading] = useState(true)
  const [fetchError, setFetchError] = useState<string | null>(null)
  const [showArchived, setShowArchived] = useState(false)
  const [busy, setBusy] = useState<Record<number, boolean>>({})

  // ── Fetch ─────────────────────────────────────────────────────────────────

  const fetchSubmissions = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/submissions")
      if (res.status === 401) {
        router.push("/admin/login")
        return
      }
      const data = await res.json()
      if (!res.ok || !Array.isArray(data)) {
        setFetchError(data?.error ?? "Failed to load submissions.")
        setLoading(false)
        return
      }
      setSubmissions(data as Submission[])
      setFetchError(null)
    } catch (err) {
      setFetchError("Network error — could not reach the server.")
    }
    setLoading(false)
  }, [router])

  useEffect(() => { fetchSubmissions() }, [fetchSubmissions])

  // ── Mutations ─────────────────────────────────────────────────────────────

  const setStatus = useCallback(async (id: number, review_status: ReviewStatus) => {
    setBusy(b => ({ ...b, [id]: true }))
    await fetch("/api/admin/submissions", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, review_status }),
    })
    setSubmissions(s =>
      s.map(sub => sub.id === id ? { ...sub, review_status } : sub)
    )
    setBusy(b => ({ ...b, [id]: false }))
  }, [])

  const toggleArchive = useCallback(async (id: number, archived: boolean) => {
    setBusy(b => ({ ...b, [id]: true }))
    await fetch("/api/admin/submissions", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, archived }),
    })
    setSubmissions(s =>
      s.map(sub => sub.id === id ? { ...sub, archived } : sub)
    )
    setBusy(b => ({ ...b, [id]: false }))
  }, [])

  const deleteSubmission = useCallback(async (id: number) => {
    if (!confirm("Permanently delete this submission? This cannot be undone.")) return
    setBusy(b => ({ ...b, [id]: true }))
    await fetch(`/api/admin/submissions?id=${id}`, { method: "DELETE" })
    setSubmissions(s => s.filter(sub => sub.id !== id))
    setBusy(b => ({ ...b, [id]: false }))
  }, [])

  // ── Derived data ──────────────────────────────────────────────────────────

  const visible = submissions.filter(s => showArchived ? s.archived : !s.archived)

  const grouped = visible.reduce<Record<string, Submission[]>>((acc, sub) => {
    if (!acc[sub.user_id]) acc[sub.user_id] = []
    acc[sub.user_id].push(sub)
    return acc
  }, {})
  const userGroups: UserGroup[] = Object.entries(grouped).map(([userId, subs]) => ({ userId, submissions: subs }))

  const totalContacts  = visible.reduce((s, r) => s + r.contact_count, 0)
  const totalFrench    = visible.reduce((s, r) => s + r.potentially_french, 0)
  const totalNotFrench = visible.reduce((s, r) => s + r.not_french, 0)
  const totalUnchecked = visible.reduce((s, r) => s + r.not_checked, 0)
  const totalPending   = visible.filter(s => s.review_status === "pending").length
  const totalReviewed  = visible.filter(s => s.review_status === "reviewed").length
  const archivedCount  = submissions.filter(s => s.archived).length

  // ── Render ────────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-950 flex items-center justify-center">
        <p className="text-gray-400 text-sm animate-pulse">Loading…</p>
      </div>
    )
  }

  if (fetchError) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-950 flex items-center justify-center">
        <div className="text-center">
          <p className="text-red-500 font-semibold mb-2">Error loading dashboard</p>
          <p className="text-gray-400 text-sm mb-4">{fetchError}</p>
          <button
            onClick={() => { setLoading(true); setFetchError(null); fetchSubmissions() }}
            className="text-sm text-blue-600 hover:underline"
          >
            Try again
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950 p-8">
      <div className="max-w-7xl mx-auto">

        {/* ── Header ── */}
        <div className="flex items-start justify-between mb-6">
          <div>
            <h1 className="text-3xl font-bold text-gray-900 dark:text-white">Admin Dashboard</h1>
            <p className="text-gray-500 dark:text-gray-400 mt-1">
              {userGroups.length} user{userGroups.length !== 1 ? "s" : ""} · {visible.length} submission{visible.length !== 1 ? "s" : ""}
              {archivedCount > 0 && (
                <button
                  onClick={() => setShowArchived(v => !v)}
                  className="ml-3 text-xs underline text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
                >
                  {showArchived ? "← Back to active" : `${archivedCount} archived`}
                </button>
              )}
            </p>
          </div>
          <button
            onClick={async () => {
              await fetch("/api/admin/logout", { method: "POST" })
              window.location.href = "/"
            }}
            className="text-sm text-gray-500 hover:text-red-500 transition-colors"
          >
            Sign out
          </button>
        </div>

        {/* ── Tab switcher ── */}
        <div className="flex gap-1 p-1 bg-gray-100 dark:bg-gray-800 rounded-xl mb-8 w-fit">
          {(["submissions", "otm"] as const).map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                activeTab === tab
                  ? "bg-white dark:bg-gray-900 text-gray-900 dark:text-white shadow-sm"
                  : "text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300"
              }`}
            >
              {tab === "submissions" ? "Submissions" : "OTM Dups Check"}
            </button>
          ))}
        </div>

        {/* ── OTM Dups Check panel ── */}
        {activeTab === "otm" && <OtmPanel />}

        {/* ── Submissions tab ── */}
        {activeTab === "submissions" && <>

        {/* ── Summary cards ── */}
        {visible.length > 0 && (
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3 mb-8">
            <SummaryCard label="Total Contacts"     value={totalContacts}  color="text-gray-900 dark:text-white" />
            <SummaryCard label="Potentially French" value={totalFrench}    color="text-green-600" />
            <SummaryCard label="Not French"         value={totalNotFrench} color="text-red-500" />
            <SummaryCard label="Not Checked"        value={totalUnchecked} color="text-blue-500" />
            <SummaryCard label="Pending Review"     value={totalPending}   color="text-amber-500" />
            <SummaryCard label="Reviewed"           value={totalReviewed}  color="text-green-600" />
          </div>
        )}

        {/* ── No submissions ── */}
        {userGroups.length === 0 && (
          <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-800 p-12 text-center">
            <p className="text-gray-400 text-lg">
              {showArchived ? "No archived submissions." : "No submissions yet."}
            </p>
            {!showArchived && (
              <p className="text-gray-400 text-sm mt-1">
                Users submit their work via the "Send for Review" button on the main app.
              </p>
            )}
          </div>
        )}

        {/* ── User groups ── */}
        <div className="flex flex-col gap-6">
          {userGroups.map(({ userId, submissions: userSubs }) => {
            const totalC        = userSubs.reduce((s, r) => s + r.contact_count, 0)
            const totalF        = userSubs.reduce((s, r) => s + r.potentially_french, 0)
            const totalNF       = userSubs.reduce((s, r) => s + r.not_french, 0)
            const totalD        = userSubs.reduce((s, r) => s + r.duplicate, 0)
            const totalNC       = userSubs.reduce((s, r) => s + r.not_checked, 0)
            const totalChecked  = totalF + totalNF + totalD
            const checkedPctAll = pct(totalChecked, totalC)
            const frenchPctAll  = pct(totalF, totalC)
            const pendingCount  = userSubs.filter(s => s.review_status === "pending").length
            const reviewedCount = userSubs.filter(s => s.review_status === "reviewed").length
            const latest        = userSubs[0]

            return (
              <div
                key={userId}
                className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-800 overflow-hidden"
              >
                {/* User header */}
                <div className="px-6 py-4 bg-gray-50 dark:bg-gray-800/50 border-b border-gray-100 dark:border-gray-800">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-base font-bold text-gray-900 dark:text-white">{userId}</span>
                      <span className="text-xs bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300 rounded-full px-2 py-0.5 font-medium">
                        {userSubs.length} submission{userSubs.length !== 1 ? "s" : ""}
                      </span>
                      {pendingCount > 0 && (
                        <span className="text-xs bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300 rounded-full px-2 py-0.5 font-medium">
                          {pendingCount} pending
                        </span>
                      )}
                      {reviewedCount > 0 && (
                        <span className="text-xs bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300 rounded-full px-2 py-0.5 font-medium">
                          {reviewedCount} reviewed
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-gray-400">Last: {new Date(latest.submitted_at).toLocaleString()}</p>
                  </div>

                  {/* Per-user incremental stats */}
                  <div className="mt-3 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-x-6 gap-y-1 text-xs">
                    <StatRow label="Total contacts"     value={totalC} />
                    <StatRow label="Potentially French" value={`${totalF} (${frenchPctAll}%)`}     color="text-green-600" />
                    <StatRow label="Not French"         value={totalNF}                             color="text-red-500" />
                    <StatRow label="Duplicate"          value={totalD}                              color="text-amber-500" />
                    <StatRow label="Not checked"        value={totalNC}                             color="text-blue-500" />
                    <StatRow label="Checked %"          value={`${checkedPctAll}%`}                 color={checkedPctAll === 100 ? "text-green-600" : "text-gray-600 dark:text-gray-400"} />
                  </div>

                  {/* Color progress bar */}
                  {totalC > 0 && (
                    <div className="mt-3 flex gap-0.5 h-1.5 rounded-full overflow-hidden bg-gray-200 dark:bg-gray-700">
                      <div className="bg-green-500 h-full transition-all" style={{ width: `${pct(totalF, totalC)}%` }} title="Potentially French" />
                      <div className="bg-red-400 h-full transition-all"   style={{ width: `${pct(totalNF, totalC)}%` }} title="Not French" />
                      <div className="bg-amber-400 h-full transition-all" style={{ width: `${pct(totalD, totalC)}%` }} title="Duplicate" />
                    </div>
                  )}
                </div>

                {/* Submissions table */}
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-gray-100 dark:border-gray-800">
                        <th className="text-left px-5 py-2 text-xs font-semibold text-gray-400 uppercase tracking-wide">Submitted</th>
                        <th className="text-left px-5 py-2 text-xs font-semibold text-gray-400 uppercase tracking-wide">Territory</th>
                        <th className="text-right px-4 py-2 text-xs font-semibold text-gray-400 uppercase tracking-wide">Total</th>
                        <th className="text-right px-4 py-2 text-xs font-semibold text-green-600 uppercase tracking-wide">French</th>
                        <th className="text-right px-4 py-2 text-xs font-semibold text-red-500 uppercase tracking-wide">Not Fr.</th>
                        <th className="text-right px-4 py-2 text-xs font-semibold text-amber-500 uppercase tracking-wide">Dup.</th>
                        <th className="text-right px-4 py-2 text-xs font-semibold text-blue-500 uppercase tracking-wide">Unchk.</th>
                        <th className="text-left px-4 py-2 text-xs font-semibold text-gray-400 uppercase tracking-wide">Status</th>
                        <th className="px-4 py-2"></th>
                      </tr>
                    </thead>
                    <tbody>
                      {userSubs.map((sub, idx) => {
                        const checkedPct = pct(sub.potentially_french + sub.not_french + sub.duplicate, sub.contact_count)
                        const isBusy     = !!busy[sub.id]

                        return (
                          <tr
                            key={sub.id}
                            className={`border-b border-gray-100 dark:border-gray-800 last:border-0 transition-colors ${
                              sub.archived ? "opacity-50" : "hover:bg-gray-50 dark:hover:bg-gray-800/30"
                            }`}
                          >
                            <td className="px-5 py-3 text-gray-500">
                              <span className="flex items-center gap-2 flex-wrap">
                                {new Date(sub.submitted_at).toLocaleString()}
                                {idx === 0 && (
                                  <span className="text-[10px] bg-green-100 dark:bg-green-900/40 text-green-700 dark:text-green-300 rounded-full px-1.5 py-0.5 font-semibold">
                                    latest
                                  </span>
                                )}
                              </span>
                            </td>

                            <td className="px-5 py-3 text-gray-500 text-xs">
                              {(() => {
                                const zip = sub.top_zipcode || sub.territory_zipcode
                                if (!zip) return "—"
                                const pages = sub.territory_page_range ? ` · Pages: ${sub.territory_page_range}` : ""
                                const label = sub.top_zipcode ? "Most used: " : "ZIP: "
                                return `${label}${zip}${pages}`
                              })()}
                            </td>

                            <td className="px-4 py-3 text-right font-medium">{sub.contact_count}</td>
                            <td className="px-4 py-3 text-right text-green-600 font-medium">{sub.potentially_french}</td>
                            <td className="px-4 py-3 text-right text-red-500 font-medium">{sub.not_french}</td>
                            <td className="px-4 py-3 text-right text-amber-500 font-medium">{sub.duplicate}</td>
                            <td className="px-4 py-3 text-right text-blue-500 font-medium">{sub.not_checked}</td>

                            {/* Review status dropdown */}
                            <td className="px-4 py-3">
                              <select
                                value={sub.review_status ?? "pending"}
                                disabled={isBusy}
                                onChange={(e) => setStatus(sub.id, e.target.value as ReviewStatus)}
                                className={`text-xs font-semibold border rounded-full px-2.5 py-1 cursor-pointer focus:outline-none transition-colors ${STATUS_CLASSES[sub.review_status ?? "pending"]} disabled:opacity-50`}
                              >
                                <option value="pending">Pending Review</option>
                                <option value="in_review">In Review</option>
                                <option value="reviewed">Reviewed</option>
                              </select>
                            </td>

                            {/* Actions */}
                            <td className="px-4 py-3">
                              <span className="inline-flex items-center gap-1.5">
                                <span className="text-xs text-gray-400">{checkedPct}%</span>

                                <Link
                                  href={`/admin/user/${encodeURIComponent(userId)}?submissionId=${sub.id}`}
                                  className="inline-block bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold rounded-lg px-2.5 py-1 transition-colors"
                                >
                                  View
                                </Link>

                                <button
                                  disabled={isBusy}
                                  onClick={() => toggleArchive(sub.id, !sub.archived)}
                                  title={sub.archived ? "Unarchive" : "Archive"}
                                  className="text-xs text-gray-400 hover:text-amber-500 border border-gray-200 dark:border-gray-700 rounded-lg px-2 py-1 transition-colors disabled:opacity-40"
                                >
                                  {sub.archived ? "↩" : "⊟"}
                                </button>

                                <button
                                  disabled={isBusy}
                                  onClick={() => deleteSubmission(sub.id)}
                                  title="Permanently delete"
                                  className="text-xs text-gray-400 hover:text-red-500 border border-gray-200 dark:border-gray-700 rounded-lg px-2 py-1 transition-colors disabled:opacity-40"
                                >
                                  🗑
                                </button>
                              </span>
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )
          })}
        </div>
        </>}
      </div>
    </div>
  )
}

// ── Sub-components ────────────────────────────────────────────────────────────

function SummaryCard({ label, value, color }: { label: string; value: number | string; color: string }) {
  return (
    <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-4">
      <div className={`text-2xl font-bold ${color}`}>{value}</div>
      <div className="text-xs text-gray-500 mt-1">{label}</div>
    </div>
  )
}

function StatRow({ label, value, color = "text-gray-600 dark:text-gray-400" }: { label: string; value: string | number; color?: string }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <span className="text-gray-500">{label}</span>
      <span className={`font-semibold ${color}`}>{value}</span>
    </div>
  )
}

// ── OTM Dups Check panel ──────────────────────────────────────────────────────

type OtmMatch = {
  submissionId: number
  userId: string
  submittedAt: string
  contactName: string
  contactAddress: string
  contactCity: string
  contactZipcode: string
  contactStatus: string
  matchType: "exact" | "loose"
  otmAddress: string
  otmCity: string
  otmZipcode: string
}

type OtmResult = {
  otmRowCount: number
  otmRawRowCount?: number
  submissionCount: number
  matchCount: number
  matches: OtmMatch[]
}

const OTM_LS_KEY  = "otm_last_result"
const OTM_LS_NAME = "otm_last_filename"

function OtmPanel() {
  const fileRef = useRef<HTMLInputElement>(null)
  const [fileName, setFileName]   = useState<string | null>(null)
  const [running, setRunning]     = useState(false)
  const [result, setResult]       = useState<OtmResult | null>(null)
  const [error, setError]         = useState<string | null>(null)
  const [filter, setFilter]       = useState<"all" | "exact" | "loose">("all")
  const [search, setSearch]       = useState("")
  const [restored, setRestored]   = useState(false)

  // ── Restore last result from localStorage on mount ────────────────────────
  useEffect(() => {
    try {
      const savedName   = localStorage.getItem(OTM_LS_NAME)
      const savedResult = localStorage.getItem(OTM_LS_KEY)
      if (savedResult) {
        setResult(JSON.parse(savedResult) as OtmResult)
        setFileName(savedName ?? "previous file")
        setRestored(true)
      }
    } catch {
      // ignore parse errors
    }
  }, [])

  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0]
    if (f) setFileName(f.name)
    setResult(null)
    setError(null)
    setRestored(false)
  }

  const runCheck = async () => {
    const file = fileRef.current?.files?.[0]
    if (!file) { setError("Please select an Excel file first."); return }

    setRunning(true)
    setError(null)
    setResult(null)
    setRestored(false)

    try {
      const form = new FormData()
      form.append("file", file)
      const res = await fetch("/api/admin/otm-check", { method: "POST", body: form })
      const data = await res.json()
      if (!res.ok) { setError(data.error ?? "Check failed"); return }
      const otmResult = data as OtmResult
      setResult(otmResult)
      // Persist to localStorage for next visit
      try {
        localStorage.setItem(OTM_LS_KEY,  JSON.stringify(otmResult))
        localStorage.setItem(OTM_LS_NAME, file.name)
      } catch {
        // ignore storage quota errors
      }
    } catch {
      setError("Network error — could not reach the server.")
    } finally {
      setRunning(false)
    }
  }

  const clearSaved = () => {
    localStorage.removeItem(OTM_LS_KEY)
    localStorage.removeItem(OTM_LS_NAME)
    setResult(null)
    setFileName(null)
    setRestored(false)
    if (fileRef.current) fileRef.current.value = ""
  }

  const filtered = result?.matches.filter(m => {
    if (filter !== "all" && m.matchType !== filter) return false
    if (search) {
      const q = search.toLowerCase()
      return (
        m.contactName.toLowerCase().includes(q) ||
        m.contactAddress.toLowerCase().includes(q) ||
        m.contactCity.toLowerCase().includes(q) ||
        m.contactZipcode.toLowerCase().includes(q) ||
        m.userId.toLowerCase().includes(q)
      )
    }
    return true
  }) ?? []

  return (
    <div className="flex flex-col gap-6">

      {/* Upload card */}
      <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-800 p-6">
        <h2 className="text-lg font-bold text-gray-900 dark:text-white mb-1">OTM Address Comparison</h2>
        <p className="text-sm text-gray-500 dark:text-gray-400 mb-5">
          Upload an Excel file containing OTM addresses. The tool will scan all active user submissions
          and flag any contact whose address matches an address in the OTM file.
        </p>

        <div className="flex flex-wrap items-center gap-3">
          {/* Hidden file input */}
          <input
            ref={fileRef}
            type="file"
            id="otm-upload"
            accept=".xlsx,.xls"
            onChange={handleFile}
            className="hidden"
          />

          {/* Upload trigger */}
          <label
            htmlFor="otm-upload"
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold cursor-pointer transition-colors"
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a2 2 0 002 2h12a2 2 0 002-2v-1M12 12V4m0 0L8 8m4-4l4 4" />
            </svg>
            {fileName ? "Change file" : "Upload OTM Excel"}
          </label>

          {/* File name pill */}
          {fileName && (
            <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-gray-100 dark:bg-gray-800 text-xs text-gray-600 dark:text-gray-300 font-medium border border-gray-200 dark:border-gray-700">
              📄 {fileName}
              {restored && (
                <span className="ml-1 text-[10px] text-indigo-500 font-semibold">(restored)</span>
              )}
            </span>
          )}

          {/* Clear saved button — only show when restored results are displayed */}
          {restored && (
            <button
              onClick={clearSaved}
              className="text-xs text-gray-400 hover:text-red-500 underline transition-colors"
              title="Clear saved results"
            >
              Clear saved
            </button>
          )}

          {/* Run / Re-run button */}
          {restored ? (
            /* Restored from localStorage — no file in input yet.
               "Re-run Check" clears restored state and opens the file picker
               so the admin can select the file and run immediately. */
            <button
              onClick={() => {
                setRestored(false)
                setResult(null)
                setFileName(null)
                if (fileRef.current) {
                  fileRef.current.value = ""
                  fileRef.current.click()
                }
              }}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-green-600 hover:bg-green-700 text-white text-sm font-semibold transition-colors"
            >
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
              Re-run Check
            </button>
          ) : (
            <button
              onClick={runCheck}
              disabled={!fileName || running}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-green-600 hover:bg-green-700 disabled:opacity-50 text-white text-sm font-semibold transition-colors"
            >
              {running ? (
                <>
                  <svg className="h-4 w-4 animate-spin" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                  </svg>
                  Running…
                </>
              ) : (
                <>
                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                  </svg>
                  Run Comparison
                </>
              )}
            </button>
          )}
        </div>

        {/* Column hint */}
        <p className="mt-3 text-xs text-gray-400">
          Supports OTM split-column format: <span className="font-medium">HouseNum</span> · <span className="font-medium">StreetDir</span> · <span className="font-medium">StreetName</span> · <span className="font-medium">AptBoxNum</span> · <span className="font-medium">City</span> · <span className="font-medium">Zip</span> — or a single <span className="font-medium">Address</span> column
        </p>

        {/* Error */}
        {error && (
          <div className="mt-4 flex items-start gap-2 p-3 rounded-lg bg-red-50 dark:bg-red-900/10 border border-red-200 dark:border-red-800">
            <svg className="h-4 w-4 text-red-500 mt-0.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01M12 3a9 9 0 100 18A9 9 0 0012 3z" />
            </svg>
            <p className="text-sm text-red-700 dark:text-red-400">{error}</p>
          </div>
        )}
      </div>

      {/* Results */}
      {result && (
        <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-800 overflow-hidden">

          {/* Result summary bar */}
          <div className="flex flex-wrap items-center justify-between gap-4 px-6 py-4 border-b border-gray-100 dark:border-gray-800 bg-gray-50 dark:bg-gray-800/50">
            <div className="flex flex-wrap gap-4 text-sm">
              <span className="text-gray-500">
                OTM addresses loaded:{" "}
                <strong className="text-gray-900 dark:text-white">{result.otmRowCount}</strong>
                {result.otmRawRowCount !== undefined && result.otmRawRowCount !== result.otmRowCount && (
                  <span className="ml-1 text-xs text-amber-500" title="Rows with a blank address cell were skipped">
                    ({result.otmRawRowCount} rows in sheet)
                  </span>
                )}
              </span>
              <span className="text-gray-500">Submissions checked: <strong className="text-gray-900 dark:text-white">{result.submissionCount}</strong></span>
              <span className={result.matchCount > 0 ? "text-red-600 font-semibold" : "text-green-600 font-semibold"}>
                {result.matchCount > 0 ? `⚠ ${result.matchCount} duplicate${result.matchCount !== 1 ? "s" : ""} found` : "✓ No duplicates found"}
              </span>
            </div>

            {/* Filter + search */}
            {result.matchCount > 0 && (
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  placeholder="Search results…"
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  className="h-8 px-3 text-xs rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-700 dark:text-gray-300 focus:outline-none focus:ring-1 focus:ring-indigo-400 w-44"
                />
                <select
                  value={filter}
                  onChange={e => setFilter(e.target.value as any)}
                  className="h-8 px-2 text-xs rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-700 dark:text-gray-300 focus:outline-none"
                >
                  <option value="all">All matches</option>
                  <option value="exact">Exact only</option>
                  <option value="loose">Loose only</option>
                </select>
              </div>
            )}
          </div>

          {/* Match table */}
          {filtered.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-100 dark:border-gray-800">
                    <th className="text-left px-5 py-2 text-xs font-semibold text-gray-400 uppercase tracking-wide">User</th>
                    <th className="text-left px-4 py-2 text-xs font-semibold text-gray-400 uppercase tracking-wide">Contact name</th>
                    <th className="text-left px-4 py-2 text-xs font-semibold text-gray-400 uppercase tracking-wide">Submitted address</th>
                    <th className="text-left px-4 py-2 text-xs font-semibold text-gray-400 uppercase tracking-wide">OTM address</th>
                    <th className="text-left px-4 py-2 text-xs font-semibold text-gray-400 uppercase tracking-wide">Status</th>
                    <th className="text-left px-4 py-2 text-xs font-semibold text-gray-400 uppercase tracking-wide">Match</th>
                    <th className="px-4 py-2"></th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((m, i) => (
                    <tr key={i} className="border-b border-gray-100 dark:border-gray-800 last:border-0 hover:bg-gray-50 dark:hover:bg-gray-800/30">
                      <td className="px-5 py-3">
                        <p className="font-semibold text-gray-900 dark:text-white text-xs">{m.userId}</p>
                        <p className="text-[10px] text-gray-400">{new Date(m.submittedAt).toLocaleDateString()}</p>
                      </td>
                      <td className="px-4 py-3 text-gray-700 dark:text-gray-300 font-medium">{m.contactName || "—"}</td>
                      <td className="px-4 py-3 text-gray-500 text-xs">
                        <p>{m.contactAddress}</p>
                        {(m.contactCity || m.contactZipcode) && (
                          <p className="text-gray-400">{[m.contactCity, m.contactZipcode].filter(Boolean).join(", ")}</p>
                        )}
                      </td>
                      <td className="px-4 py-3 text-gray-500 text-xs">
                        <p>{m.otmAddress}</p>
                        {(m.otmCity || m.otmZipcode) && (
                          <p className="text-gray-400">{[m.otmCity, m.otmZipcode].filter(Boolean).join(", ")}</p>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${
                          m.contactStatus === "Potentially French"
                            ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300"
                            : m.contactStatus === "Not French"
                            ? "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300"
                            : m.contactStatus === "Duplicate"
                            ? "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300"
                            : "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400"
                        }`}>
                          {m.contactStatus || "—"}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <span className={`text-xs font-semibold px-2 py-0.5 rounded-full border ${
                          m.matchType === "exact"
                            ? "bg-red-50 text-red-600 border-red-200 dark:bg-red-900/20 dark:text-red-400 dark:border-red-800"
                            : "bg-amber-50 text-amber-600 border-amber-200 dark:bg-amber-900/20 dark:text-amber-400 dark:border-amber-800"
                        }`}>
                          {m.matchType === "exact" ? "Exact" : "Loose"}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <Link
                          href={`/admin/user/${encodeURIComponent(m.userId)}?submissionId=${m.submissionId}`}
                          className="text-xs text-blue-600 hover:underline font-semibold"
                        >
                          View →
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : result.matchCount > 0 ? (
            <p className="px-6 py-8 text-center text-gray-400 text-sm">No matches for current filter / search.</p>
          ) : (
            <div className="px-6 py-12 text-center">
              <p className="text-green-600 font-semibold text-lg mb-1">✓ No duplicates found</p>
              <p className="text-gray-400 text-sm">None of the submitted contact addresses matched any address in the uploaded OTM file.</p>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
