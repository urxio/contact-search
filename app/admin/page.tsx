"use client"

import { useEffect, useState, useCallback, useRef, Fragment } from "react"
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
  const [activeTab, setActiveTab] = useState<"submissions" | "otm" | "names" | "potentiallyFrench" | "dictionaryScan">("submissions")
  // Tabs mount lazily on first visit, then stay mounted (just hidden via
  // CSS) — switching back to an already-visited tab no longer re-runs its
  // initial fetch.
  const [visitedTabs, setVisitedTabs] = useState<Set<string>>(() => new Set(["submissions"]))
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
    // When restoring (unarchiving), switch back to active view so the
    // submission is visible and the page doesn't crash from an empty group.
    if (!archived) setShowArchived(false)
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
          {(["submissions", "dictionaryScan", "names", "potentiallyFrench", "otm"] as const).map((tab) => (
            <button
              key={tab}
              onClick={() => { setActiveTab(tab); setVisitedTabs((v) => new Set(v).add(tab)) }}
              className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-all duration-200 ${
                activeTab === tab
                  ? "bg-indigo-600 text-white shadow-[0_0_14px_rgba(99,102,241,0.65)]"
                  : "text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300"
              }`}
            >
              {tab === "submissions"
                ? "Submissions"
                : tab === "otm"
                  ? "OTM Dups Check"
                  : tab === "names"
                    ? "Name Feedback"
                    : tab === "potentiallyFrench"
                      ? "Potentially French"
                      : "Dictionary Scan"}
            </button>
          ))}
        </div>

        {/* ── OTM Dups Check panel ── */}
        {visitedTabs.has("otm") && (
          <div className={activeTab === "otm" ? "" : "hidden"}><OtmPanel /></div>
        )}

        {/* ── Name Feedback panel ── */}
        {visitedTabs.has("names") && (
          <div className={activeTab === "names" ? "" : "hidden"}><DictionaryFeedbackPanel /></div>
        )}

        {/* ── Potentially French list panel ── */}
        {visitedTabs.has("potentiallyFrench") && (
          <div className={activeTab === "potentiallyFrench" ? "" : "hidden"}><PotentiallyFrenchPanel onSubmissionsChanged={fetchSubmissions} /></div>
        )}

        {/* ── Dictionary Scan panel ── */}
        {visitedTabs.has("dictionaryScan") && (
          <div className={activeTab === "dictionaryScan" ? "" : "hidden"}>
            <DictionaryScanPanel onSubmissionsChanged={fetchSubmissions} />
          </div>
        )}

        {/* ── Submissions tab ── */}
        <div className={activeTab === "submissions" ? "" : "hidden"}>

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

                                {/* View button */}
                                <span className="relative group/tip">
                                  <Link
                                    href={`/admin/user/${encodeURIComponent(userId)}?submissionId=${sub.id}`}
                                    className="inline-block bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold rounded-lg px-2.5 py-1 transition-colors"
                                  >
                                    View
                                  </Link>
                                  <span className="pointer-events-none absolute -top-8 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-md bg-gray-900 px-2 py-1 text-[10px] text-white opacity-0 group-hover/tip:opacity-100 transition-opacity z-50">
                                    View full submission
                                  </span>
                                </span>

                                {/* Archive / Unarchive button */}
                                <span className="relative group/tip">
                                  <button
                                    disabled={isBusy}
                                    onClick={() => toggleArchive(sub.id, !sub.archived)}
                                    className="text-xs text-gray-400 hover:text-amber-500 border border-gray-200 dark:border-gray-700 rounded-lg px-2 py-1 transition-colors disabled:opacity-40"
                                  >
                                    {sub.archived ? "↩" : "⊟"}
                                  </button>
                                  <span className="pointer-events-none absolute -top-8 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-md bg-gray-900 px-2 py-1 text-[10px] text-white opacity-0 group-hover/tip:opacity-100 transition-opacity z-50">
                                    {sub.archived ? "Restore submission" : "Archive submission"}
                                  </span>
                                </span>

                                {/* Delete button */}
                                <span className="relative group/tip">
                                  <button
                                    disabled={isBusy}
                                    onClick={() => deleteSubmission(sub.id)}
                                    className="text-xs text-gray-400 hover:text-red-500 border border-gray-200 dark:border-gray-700 rounded-lg px-2 py-1 transition-colors disabled:opacity-40"
                                  >
                                    🗑
                                  </button>
                                  <span className="pointer-events-none absolute -top-8 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-md bg-gray-900 px-2 py-1 text-[10px] text-white opacity-0 group-hover/tip:opacity-100 transition-opacity z-50">
                                    Permanently delete
                                  </span>
                                </span>
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
        </div>
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
  contactId: string
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
  detectedColumns?: {
    houseNum: string | null
    streetDir: string | null
    street: string | null
    apt: string | null
    city: string | null
    zip: string | null
    address: string | null
  }
}

const OTM_LS_KEY  = "otm_last_result"
const OTM_LS_NAME = "otm_last_filename"

type SavedFileInfo = { exists: boolean; filename?: string; uploadedAt?: string }

function OtmPanel() {
  const fileRef = useRef<HTMLInputElement>(null)
  const [fileName, setFileName]     = useState<string | null>(null)
  const [running, setRunning]       = useState(false)
  const [result, setResult]         = useState<OtmResult | null>(null)
  const [error, setError]           = useState<string | null>(null)
  const [filter, setFilter]         = useState<"all" | "exact" | "loose">("all")
  const [search, setSearch]         = useState("")
  const [restored, setRestored]     = useState(false)
  const [savedFile, setSavedFile]   = useState<SavedFileInfo | null>(null)
  const [savingFile, setSavingFile] = useState(false)
  const [dismissed, setDismissed]   = useState<Set<string>>(new Set())
  const [removing, setRemoving]     = useState<Set<string>>(new Set())

  // ── On mount: restore localStorage result + fetch DB-saved file metadata ──
  useEffect(() => {
    // Restore last result from localStorage (fast, works offline)
    try {
      const savedName   = localStorage.getItem(OTM_LS_NAME)
      const savedResult = localStorage.getItem(OTM_LS_KEY)
      if (savedResult) {
        setResult(JSON.parse(savedResult) as OtmResult)
        setFileName(savedName ?? "previous file")
        setRestored(true)
      }
    } catch { /* ignore parse errors */ }

    // Fetch DB-saved file metadata (works across browsers/sessions)
    fetch("/api/admin/otm-file")
      .then(r => r.json())
      .then((data: SavedFileInfo) => setSavedFile(data))
      .catch(() => setSavedFile({ exists: false }))
  }, [])

  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0]
    if (f) setFileName(f.name)
    setResult(null)
    setError(null)
    setRestored(false)
  }

  // ── Run check using a newly uploaded file ─────────────────────────────────
  const runCheck = async () => {
    const file = fileRef.current?.files?.[0]
    if (!file) { setError("Please select an Excel file first."); return }

    setRunning(true)
    setError(null)
    setResult(null)
    setRestored(false)
    setDismissed(new Set())

    try {
      const form = new FormData()
      form.append("file", file)
      const res = await fetch("/api/admin/otm-check", { method: "POST", body: form })
      const data = await res.json()
      if (!res.ok) { setError(data.error ?? "Check failed"); return }
      const otmResult = data as OtmResult
      setResult(otmResult)

      // Persist result to localStorage for fast reload
      try {
        localStorage.setItem(OTM_LS_KEY,  JSON.stringify(otmResult))
        localStorage.setItem(OTM_LS_NAME, file.name)
      } catch { /* ignore quota errors */ }

      // Also save the file bytes to Neon DB for cross-browser persistence
      setSavingFile(true)
      try {
        const saveForm = new FormData()
        saveForm.append("file", file)
        const saveRes = await fetch("/api/admin/otm-file", { method: "POST", body: saveForm })
        if (saveRes.ok) setSavedFile(await saveRes.json())
      } catch { /* non-critical — don't block the result display */ }
      finally { setSavingFile(false) }

    } catch {
      setError("Network error — could not reach the server.")
    } finally {
      setRunning(false)
    }
  }

  // ── Run check using the DB-saved file (no upload needed) ─────────────────
  const runWithSaved = async () => {
    setRunning(true)
    setError(null)
    setResult(null)
    setRestored(false)
    setDismissed(new Set())
    try {
      const res = await fetch("/api/admin/otm-check?useSaved=true", { method: "POST" })
      const data = await res.json()
      if (!res.ok) { setError(data.error ?? "Check failed"); return }
      const otmResult = data as OtmResult
      setResult(otmResult)
      try {
        localStorage.setItem(OTM_LS_KEY,  JSON.stringify(otmResult))
        localStorage.setItem(OTM_LS_NAME, savedFile?.filename ?? "saved file")
      } catch { /* ignore quota errors */ }
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

  // ── Remove a single OTM dup contact from the DB ───────────────────────────
  const removeMatch = async (m: OtmMatch) => {
    const key = `${m.submissionId}:${m.contactId}`
    setRemoving(prev => new Set(prev).add(key))
    try {
      const res = await fetch(
        `/api/admin/otm-contact?submissionId=${m.submissionId}&contactId=${encodeURIComponent(m.contactId)}`,
        { method: "DELETE" }
      )
      if (res.ok) {
        setDismissed(prev => new Set(prev).add(key))
      } else {
        const data = await res.json()
        alert("Failed to remove contact: " + (data.error ?? "Unknown error"))
      }
    } catch {
      alert("Network error — could not remove contact.")
    } finally {
      setRemoving(prev => { const s = new Set(prev); s.delete(key); return s })
    }
  }

  // ── Remove ALL visible OTM dup contacts at once ───────────────────────────
  const removeAllMatches = async () => {
    if (!result) return
    const visible = result.matches.filter(m => !dismissed.has(`${m.submissionId}:${m.contactId}`))
    if (!window.confirm(`Remove all ${visible.length} duplicate contact${visible.length !== 1 ? "s" : ""} from their submissions? This cannot be undone.`)) return
    await Promise.all(visible.map(removeMatch))
  }

  // ── Clear a single OTM dup: dismiss from UI and remove from saved result ──
  const clearMatch = (m: OtmMatch) => {
    const key = `${m.submissionId}:${m.contactId}`
    setDismissed(prev => new Set(prev).add(key))
    // Also strip from localStorage so it's gone on reload
    setResult(prev => {
      if (!prev) return prev
      const updated = { ...prev, matches: prev.matches.filter(x => `${x.submissionId}:${x.contactId}` !== key), matchCount: prev.matchCount - 1 }
      try { localStorage.setItem(OTM_LS_KEY, JSON.stringify(updated)) } catch { /* ignore */ }
      return updated
    })
  }

  // ── Clear ALL visible OTM dup contacts from the results page ─────────────
  const clearAllMatches = () => {
    if (!result) return
    const visibleKeys = new Set(
      result.matches
        .filter(m => !dismissed.has(`${m.submissionId}:${m.contactId}`))
        .map(m => `${m.submissionId}:${m.contactId}`)
    )
    setDismissed(prev => new Set([...prev, ...visibleKeys]))
    // Strip all visible matches from localStorage too
    setResult(prev => {
      if (!prev) return prev
      const updated = { ...prev, matches: prev.matches.filter(m => !visibleKeys.has(`${m.submissionId}:${m.contactId}`)), matchCount: prev.matchCount - visibleKeys.size }
      try { localStorage.setItem(OTM_LS_KEY, JSON.stringify(updated)) } catch { /* ignore */ }
      return updated
    })
  }

  const filtered = result?.matches.filter(m => {
    if (dismissed.has(`${m.submissionId}:${m.contactId}`)) return false
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

        {/* DB-saved file — shown when a file has been stored in Neon */}
        {savedFile?.exists && (
          <div className="mt-4 flex flex-wrap items-center gap-3 p-3 rounded-xl bg-indigo-50 dark:bg-indigo-900/20 border border-indigo-100 dark:border-indigo-800">
            <span className="inline-flex items-center gap-1.5 text-xs text-indigo-700 dark:text-indigo-300 font-medium">
              <svg className="h-4 w-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M4 7v10a2 2 0 002 2h12a2 2 0 002-2V9a2 2 0 00-2-2h-5L11 4H6a2 2 0 00-2 2z" />
              </svg>
              <span className="font-semibold">{savedFile.filename}</span>
              {savedFile.uploadedAt && (
                <span className="text-indigo-400 font-normal">
                  · saved {new Date(savedFile.uploadedAt).toLocaleString()}
                </span>
              )}
              {savingFile && (
                <span className="animate-pulse text-indigo-400">· saving…</span>
              )}
            </span>

            <button
              onClick={runWithSaved}
              disabled={running}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white text-xs font-semibold transition-colors"
            >
              {running ? (
                <>
                  <svg className="h-3.5 w-3.5 animate-spin" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                  </svg>
                  Running…
                </>
              ) : (
                <>
                  <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                  </svg>
                  Run with saved file
                </>
              )}
            </button>
          </div>
        )}

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
              {/* Column detection debug — shows which headers were found */}
              {result.detectedColumns && (
                <span className="text-gray-400 text-xs" title="Columns detected in the OTM Excel file">
                  Cols: {[
                    result.detectedColumns.houseNum  && `HouseNum→${result.detectedColumns.houseNum}`,
                    result.detectedColumns.streetDir && `Dir→${result.detectedColumns.streetDir}`,
                    result.detectedColumns.street    && `Street→${result.detectedColumns.street}`,
                    result.detectedColumns.apt       && `Apt→${result.detectedColumns.apt}`,
                    result.detectedColumns.city      && `City→${result.detectedColumns.city}`,
                    result.detectedColumns.zip       && `Zip→${result.detectedColumns.zip}`,
                    result.detectedColumns.address   && `Addr→${result.detectedColumns.address}`,
                  ].filter(Boolean).join(" · ") || "none"}
                </span>
              )}
              <span className={filtered.length > 0 ? "text-red-600 font-semibold" : "text-green-600 font-semibold"}>
                {filtered.length > 0
                  ? `⚠ ${filtered.length} duplicate${filtered.length !== 1 ? "s" : ""} found`
                  : dismissed.size > 0
                    ? `✓ All ${dismissed.size} duplicate${dismissed.size !== 1 ? "s" : ""} removed`
                    : "✓ No duplicates found"}
              </span>
              {filtered.length > 0 && (
                <div className="flex items-center gap-2">
                  <button
                    onClick={clearAllMatches}
                    className="inline-flex items-center gap-1.5 px-3 py-1 rounded-lg bg-amber-50 hover:bg-amber-100 dark:bg-amber-900/20 dark:hover:bg-amber-900/40 text-amber-600 dark:text-amber-400 text-xs font-semibold border border-amber-200 dark:border-amber-800 transition-colors"
                  >
                    <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                    </svg>
                    Clear all names
                  </button>
                  <button
                    onClick={removeAllMatches}
                    className="inline-flex items-center gap-1.5 px-3 py-1 rounded-lg bg-red-50 hover:bg-red-100 dark:bg-red-900/20 dark:hover:bg-red-900/40 text-red-600 dark:text-red-400 text-xs font-semibold border border-red-200 dark:border-red-800 transition-colors"
                  >
                    <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                    </svg>
                    Remove all
                  </button>
                </div>
              )}
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
                        <div className="flex items-center gap-1.5">
                          <Link
                            href={`/admin/user/${encodeURIComponent(m.userId)}?submissionId=${m.submissionId}`}
                            className="text-xs text-blue-600 hover:underline font-semibold"
                          >
                            View →
                          </Link>
                          {/* Clear — dismiss from this list only (no DB write) */}
                          <button
                            onClick={() => clearMatch(m)}
                            disabled={removing.has(`${m.submissionId}:${m.contactId}`)}
                            title="Dismiss from this list"
                            className="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-amber-50 hover:bg-amber-100 dark:bg-amber-900/20 dark:hover:bg-amber-900/40 text-amber-600 dark:text-amber-400 text-xs font-medium border border-amber-200 dark:border-amber-800 transition-colors disabled:opacity-50"
                          >
                            <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                            </svg>
                            Clear
                          </button>
                          {/* Remove — delete contact entirely from submission */}
                          <button
                            onClick={() => removeMatch(m)}
                            disabled={removing.has(`${m.submissionId}:${m.contactId}`)}
                            title="Delete contact from submission entirely"
                            className="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-red-50 hover:bg-red-100 dark:bg-red-900/20 dark:hover:bg-red-900/40 text-red-500 dark:text-red-400 text-xs font-medium border border-red-200 dark:border-red-800 transition-colors disabled:opacity-50"
                          >
                            {removing.has(`${m.submissionId}:${m.contactId}`) ? (
                              <svg className="h-3 w-3 animate-spin" fill="none" viewBox="0 0 24 24">
                                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                              </svg>
                            ) : (
                              <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                              </svg>
                            )}
                            Remove
                          </button>
                        </div>
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

// ── Name Feedback panel ───────────────────────────────────────────────────────
// Aggregates the per-contact 👍/👎 "is this a French name" corrections users
// leave in the main app, cross-references the live dictionary on GitHub, and
// lets the admin apply add/remove changes as a direct commit.

type NameCandidate = { name: string; count: number }

function forebearsUrlFor(name: string) {
  return `https://forebears.io/surnames/${encodeURIComponent(name)}`
}

function DictionaryFeedbackPanel() {
  const [activeSubTab, setActiveSubTab] = useState<"add" | "remove">("add")
  const [addCandidates, setAddCandidates] = useState<NameCandidate[]>([])
  const [removeCandidates, setRemoveCandidates] = useState<NameCandidate[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [dictionaryError, setDictionaryError] = useState<string | null>(null)
  const [busy, setBusy] = useState<Record<string, boolean>>({})
  const [batchBusy, setBatchBusy] = useState(false)
  const [selected, setSelected] = useState<{ add: Set<string>; remove: Set<string> }>({
    add: new Set(),
    remove: new Set(),
  })

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch("/api/admin/dictionary-feedback")
      const data = await res.json()
      if (!res.ok) {
        setError(data?.error ?? "Failed to load name feedback.")
        setLoading(false)
        return
      }
      setAddCandidates(data.addCandidates ?? [])
      setRemoveCandidates(data.removeCandidates ?? [])
      setDictionaryError(data.dictionaryError ?? null)
    } catch {
      setError("Network error — could not reach the server.")
    }
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  const toggleSelected = (list: "add" | "remove", name: string) => {
    setSelected((prev) => {
      const next = new Set(prev[list])
      if (next.has(name)) next.delete(name)
      else next.add(name)
      return { ...prev, [list]: next }
    })
  }

  const toggleSelectAll = (list: "add" | "remove", candidates: NameCandidate[]) => {
    setSelected((prev) => {
      const allSelected = candidates.length > 0 && candidates.every((c) => prev[list].has(c.name))
      return { ...prev, [list]: allSelected ? new Set() : new Set(candidates.map((c) => c.name)) }
    })
  }

  const apply = async (name: string, action: "add" | "remove") => {
    setBusy((b) => ({ ...b, [name]: true }))
    try {
      const res = await fetch("/api/admin/dictionary-feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, action }),
      })
      const data = await res.json()
      if (!res.ok) {
        alert(`Failed to ${action} "${name}": ${data?.error ?? "Unknown error"}`)
      } else if (action === "add") {
        setAddCandidates((prev) => prev.filter((c) => c.name !== name))
      } else {
        setRemoveCandidates((prev) => prev.filter((c) => c.name !== name))
      }
    } catch {
      alert("Network error — could not reach the server.")
    } finally {
      setBusy((b) => ({ ...b, [name]: false }))
    }
  }

  // Apply every selected name in one shot — a single GitHub commit covers
  // the whole batch instead of one commit per name.
  const applySelected = async (list: "add" | "remove") => {
    const names = Array.from(selected[list])
    if (names.length === 0) return
    setBatchBusy(true)
    try {
      const res = await fetch("/api/admin/dictionary-feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ names, action: list }),
      })
      const data = await res.json()
      if (!res.ok) {
        alert(`Failed to apply selected names: ${data?.error ?? "Unknown error"}`)
        return
      }
      const applied = new Set(data.applied ?? names)
      if (list === "add") {
        setAddCandidates((prev) => prev.filter((c) => !applied.has(c.name)))
      } else {
        setRemoveCandidates((prev) => prev.filter((c) => !applied.has(c.name)))
      }
      setSelected((prev) => ({ ...prev, [list]: new Set() }))
    } catch {
      alert("Network error — could not reach the server.")
    } finally {
      setBatchBusy(false)
    }
  }

  // Permanently hide a name from a suggestion list without touching the
  // dictionary — for junk/false-positive entries. Doesn't need GitHub, so
  // it stays enabled even when dictionaryError is set.
  const dismiss = async (name: string, list: "add" | "remove") => {
    const key = `dismiss:${name}`
    setBusy((b) => ({ ...b, [key]: true }))
    try {
      const res = await fetch("/api/admin/dictionary-feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, action: "dismiss", list }),
      })
      const data = await res.json()
      if (!res.ok) {
        alert(`Failed to dismiss "${name}": ${data?.error ?? "Unknown error"}`)
      } else if (list === "add") {
        setAddCandidates((prev) => prev.filter((c) => c.name !== name))
      } else {
        setRemoveCandidates((prev) => prev.filter((c) => c.name !== name))
      }
    } catch {
      alert("Network error — could not reach the server.")
    } finally {
      setBusy((b) => ({ ...b, [key]: false }))
    }
  }

  // Dismiss every selected name in one shot. Doesn't need GitHub, so it
  // stays enabled even when dictionaryError is set.
  const dismissSelected = async (list: "add" | "remove") => {
    const names = Array.from(selected[list])
    if (names.length === 0) return
    setBatchBusy(true)
    try {
      const res = await fetch("/api/admin/dictionary-feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ names, action: "dismiss", list }),
      })
      const data = await res.json()
      if (!res.ok) {
        alert(`Failed to dismiss selected names: ${data?.error ?? "Unknown error"}`)
        return
      }
      const applied = new Set(data.applied ?? names)
      if (list === "add") {
        setAddCandidates((prev) => prev.filter((c) => !applied.has(c.name)))
      } else {
        setRemoveCandidates((prev) => prev.filter((c) => !applied.has(c.name)))
      }
      setSelected((prev) => ({ ...prev, [list]: new Set() }))
    } catch {
      alert("Network error — could not reach the server.")
    } finally {
      setBatchBusy(false)
    }
  }

  return (
    <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-800 overflow-hidden">
      <div className="px-6 py-4 border-b border-gray-100 dark:border-gray-800 bg-gray-50 dark:bg-gray-800/50">
        <h2 className="text-lg font-bold text-gray-900 dark:text-white">Name Feedback</h2>
        <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
          Last names from "Potentially French" contacts missing from the dictionary, and names marked "Not French" that are still in it.
        </p>
      </div>

      <div className="flex gap-1 p-3 border-b border-gray-100 dark:border-gray-800">
        <button
          onClick={() => setActiveSubTab("add")}
          className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
            activeSubTab === "add"
              ? "bg-green-600 text-white"
              : "text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300"
          }`}
        >
          Add to Dictionary{addCandidates.length > 0 ? ` (${addCandidates.length})` : ""}
        </button>
        <button
          onClick={() => setActiveSubTab("remove")}
          className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
            activeSubTab === "remove"
              ? "bg-red-600 text-white"
              : "text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300"
          }`}
        >
          Remove from Dictionary{removeCandidates.length > 0 ? ` (${removeCandidates.length})` : ""}
        </button>
      </div>

      {dictionaryError && (
        <div className="mx-6 mt-4 flex items-start gap-2 p-3 rounded-lg bg-amber-50 dark:bg-amber-900/10 border border-amber-200 dark:border-amber-800">
          <p className="text-sm text-amber-700 dark:text-amber-400">
            Couldn't reach the dictionary file on GitHub ({dictionaryError}). Apply actions are unavailable until GITHUB_TOKEN is configured.
          </p>
        </div>
      )}

      {loading ? (
        <p className="px-6 py-12 text-center text-gray-400 text-sm">Loading…</p>
      ) : error ? (
        <p className="px-6 py-12 text-center text-red-500 text-sm">{error}</p>
      ) : activeSubTab === "add" ? (
        <NameCandidateList
          candidates={addCandidates}
          action="add"
          buttonLabel="Add to dictionary"
          buttonClass="bg-green-50 hover:bg-green-100 dark:bg-green-900/20 dark:hover:bg-green-900/40 text-green-600 dark:text-green-400 border-green-200 dark:border-green-800"
          batchButtonClass="bg-green-600 hover:bg-green-700"
          busy={busy}
          batchBusy={batchBusy}
          onApply={apply}
          onDismiss={dismiss}
          disabled={!!dictionaryError}
          emptyText="No missing names flagged."
          selected={selected.add}
          onToggleSelected={(name) => toggleSelected("add", name)}
          onToggleSelectAll={() => toggleSelectAll("add", addCandidates)}
          onApplySelected={() => applySelected("add")}
          onDismissSelected={() => dismissSelected("add")}
        />
      ) : (
        <NameCandidateList
          candidates={removeCandidates}
          action="remove"
          buttonLabel="Remove from dictionary"
          buttonClass="bg-red-50 hover:bg-red-100 dark:bg-red-900/20 dark:hover:bg-red-900/40 text-red-600 dark:text-red-400 border-red-200 dark:border-red-800"
          batchButtonClass="bg-red-600 hover:bg-red-700"
          busy={busy}
          batchBusy={batchBusy}
          onApply={apply}
          onDismiss={dismiss}
          disabled={!!dictionaryError}
          emptyText="No names flagged for removal."
          selected={selected.remove}
          onToggleSelected={(name) => toggleSelected("remove", name)}
          onToggleSelectAll={() => toggleSelectAll("remove", removeCandidates)}
          onApplySelected={() => applySelected("remove")}
          onDismissSelected={() => dismissSelected("remove")}
        />
      )}
    </div>
  )
}

function NameCandidateList({
  candidates,
  action,
  buttonLabel,
  buttonClass,
  batchButtonClass,
  busy,
  batchBusy,
  onApply,
  onDismiss,
  disabled,
  emptyText,
  selected,
  onToggleSelected,
  onToggleSelectAll,
  onApplySelected,
  onDismissSelected,
}: {
  candidates: NameCandidate[]
  action: "add" | "remove"
  buttonLabel: string
  buttonClass: string
  batchButtonClass: string
  busy: Record<string, boolean>
  batchBusy: boolean
  onApply: (name: string, action: "add" | "remove") => void
  onDismiss: (name: string, list: "add" | "remove") => void
  disabled: boolean
  emptyText: string
  selected: Set<string>
  onToggleSelected: (name: string) => void
  onToggleSelectAll: () => void
  onApplySelected: () => void
  onDismissSelected: () => void
}) {
  if (candidates.length === 0) {
    return <p className="text-sm text-gray-400 px-6 py-12 text-center">{emptyText}</p>
  }

  const allSelected = candidates.every((c) => selected.has(c.name))

  return (
    <div>
      <div className="flex items-center justify-between px-6 py-2 bg-gray-50 dark:bg-gray-800/50 border-b border-gray-100 dark:border-gray-800">
        <label className="flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400 cursor-pointer">
          <input type="checkbox" checked={allSelected} onChange={onToggleSelectAll} />
          {selected.size > 0 ? `${selected.size} selected` : "Select all"}
        </label>
        {selected.size > 0 && (
          <div className="flex items-center gap-2">
            <button
              disabled={batchBusy}
              onClick={onDismissSelected}
              title="Dismiss — hide these names permanently without changing the dictionary"
              className="inline-flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-semibold border border-gray-200 dark:border-gray-700 bg-gray-50 hover:bg-gray-100 dark:bg-gray-800 dark:hover:bg-gray-700 text-gray-500 dark:text-gray-300 transition-colors disabled:opacity-50"
            >
              {batchBusy ? "Applying…" : `Dismiss (${selected.size})`}
            </button>
            <button
              disabled={disabled || batchBusy}
              onClick={onApplySelected}
              className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-semibold text-white transition-colors disabled:opacity-50 ${batchButtonClass}`}
            >
              {batchBusy ? "Applying…" : `${buttonLabel} (${selected.size})`}
            </button>
          </div>
        )}
      </div>

      <ul className="divide-y divide-gray-100 dark:divide-gray-800">
        {candidates.map((c) => (
          <li key={c.name} className="flex items-center justify-between px-6 py-3">
            <label className="flex items-center gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={selected.has(c.name)}
                onChange={() => onToggleSelected(c.name)}
              />
              <span className="text-sm font-medium text-gray-900 dark:text-white">
                {c.name}{" "}
                <span className="text-xs text-gray-400 font-normal">
                  ({c.count} contact{c.count !== 1 ? "s" : ""})
                </span>
              </span>
            </label>
            <div className="flex items-center gap-2">
              <a
                href={forebearsUrlFor(c.name)}
                target="_blank"
                rel="noopener noreferrer"
                title="Search on Forebears.io"
                className="inline-flex items-center justify-center h-7 w-7 rounded-lg border border-blue-200 dark:border-blue-800 bg-blue-50 hover:bg-blue-100 dark:bg-blue-900/20 dark:hover:bg-blue-900/40 text-blue-600 dark:text-blue-400 transition-colors"
              >
                <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <circle cx="12" cy="12" r="10" />
                  <path strokeLinecap="round" strokeLinejoin="round" d="M2 12h20M12 2a15.3 15.3 0 010 20M12 2a15.3 15.3 0 000 20" />
                </svg>
              </a>
              <button
                disabled={disabled || !!busy[c.name]}
                onClick={() => onApply(c.name, action)}
                className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-semibold border transition-colors disabled:opacity-50 ${buttonClass}`}
              >
                {busy[c.name] ? "Applying…" : buttonLabel}
              </button>
              <button
                disabled={!!busy[`dismiss:${c.name}`]}
                onClick={() => onDismiss(c.name, action)}
                title="Dismiss — hide this name permanently without changing the dictionary"
                className="inline-flex items-center justify-center h-7 w-7 rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 hover:bg-gray-100 dark:bg-gray-800 dark:hover:bg-gray-700 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors disabled:opacity-50"
              >
                <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          </li>
        ))}
      </ul>
    </div>
  )
}

// ── Potentially French list panel ─────────────────────────────────────────────
// Every contact currently marked "Potentially French" across all users, with
// duplicate detection by address and by name — catches the same contact
// appearing in more than one person's submission, which no single user's
// local "Duplicate" status check can see.

type PotentiallyFrenchContact = {
  submissionId: number
  contactId: string
  userId: string
  submittedAt: string
  fullName: string
  address: string
  city: string
  zipcode: string
  phone: string
  notes: string
  duplicateAddressCount: number
  duplicateNameCount: number
}

// Same address-splitting logic as the main app's exportPotentiallyFrenchToCSV
// (app/page.tsx) — kept in lockstep so admin- and user-exported CSVs match.
function parseAddress(address: string) {
  let houseNumber = ""
  let direction = ""
  let streetName = ""
  let aptNum = ""

  if (address) {
    const aptMatch = address.match(/(?:apt|unit|#|suite)\s*([a-z0-9-]+)/i)
    if (aptMatch) {
      aptNum = aptMatch[1]
      address = address.replace(aptMatch[0], "").trim()
    }

    const addressMatch = address.match(/^(\d+)\s+(?:(N|S|E|W|NE|NW|SE|SW)\s+)?(.+?)$/i)
    if (addressMatch) {
      houseNumber = addressMatch[1] || ""
      direction = addressMatch[2] || ""
      streetName = addressMatch[3] || ""
    } else {
      streetName = address
    }
  }

  return { houseNumber, direction, streetName, aptNum }
}

function escapeCSV(field: string) {
  if (field === null || field === undefined) return ""
  const stringField = String(field)
  if (stringField.includes(",") || stringField.includes('"') || stringField.includes("\n")) {
    return `"${stringField.replace(/"/g, '""')}"`
  }
  return stringField
}

// Same column set, escaping, and filename pattern as the main app's
// exportPotentiallyFrenchToCSV — this is the admin-wide equivalent (every
// user's Potentially French contacts, not just the current session's).
function exportPotentiallyFrenchToCSV(contacts: PotentiallyFrenchContact[], stateValue: string) {
  const headers = [
    "Contact Name", "House Number", "Direction", "Street Name",
    "Apt Num", "City", "ZIP Code", "Phone Number", "State",
  ]

  const rows = contacts.map((c) => {
    const { houseNumber, direction, streetName, aptNum } = parseAddress(c.address)
    return [c.fullName, houseNumber, direction, streetName, aptNum, c.city, c.zipcode, c.phone, stateValue]
      .map(escapeCSV)
      .join(",")
  })

  const csvContent = [headers.map(escapeCSV).join(","), ...rows].join("\n")
  const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" })
  const url = URL.createObjectURL(blob)
  const a = document.createElement("a")
  a.href = url
  a.download = `french-contacts-${new Date().toLocaleDateString().replace(/\//g, "-")}.csv`
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

function PotentiallyFrenchPanel({ onSubmissionsChanged }: { onSubmissionsChanged?: () => void }) {
  const [contacts, setContacts] = useState<PotentiallyFrenchContact[]>([])
  const [totalCount, setTotalCount] = useState(0)
  const [duplicateCount, setDuplicateCount] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [search, setSearch] = useState("")
  const [duplicatesOnly, setDuplicatesOnly] = useState(false)
  const [busy, setBusy] = useState<Record<string, boolean>>({})

  useEffect(() => {
    fetch("/api/admin/potentially-french")
      .then((r) => r.json())
      .then((data) => {
        if (data?.error) {
          setError(data.error)
        } else {
          setContacts(data.contacts ?? [])
          setTotalCount(data.totalCount ?? 0)
          setDuplicateCount(data.duplicateCount ?? 0)
        }
        setLoading(false)
      })
      .catch(() => {
        setError("Network error — could not reach the server.")
        setLoading(false)
      })
  }, [])

  const handleExport = () => {
    if (contacts.length === 0) {
      alert("No Potentially French contacts to export.")
      return
    }
    const stateValue = window.prompt("State abbreviation to stamp on every exported row (optional):", "")
    if (stateValue === null) return // cancelled
    exportPotentiallyFrenchToCSV(contacts, stateValue)
  }

  // Removes a contact from this list by flipping its status to "Not French".
  const markNotFrench = useCallback(async (c: PotentiallyFrenchContact) => {
    const key = `${c.submissionId}:${c.contactId}`
    setBusy((b) => ({ ...b, [key]: true }))
    try {
      const res = await fetch("/api/admin/potentially-french", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ submissionId: c.submissionId, contactId: c.contactId }),
      })
      const data = await res.json()
      if (!res.ok) {
        alert(`Failed to mark "${c.fullName}" as Not French: ${data?.error ?? "Unknown error"}`)
        return
      }
      setContacts((prev) => prev.filter((x) => !(x.submissionId === c.submissionId && x.contactId === c.contactId)))
      setTotalCount((n) => Math.max(0, n - 1))
      // Cached submission counts changed server-side — refresh so the rest
      // of the dashboard reflects it immediately.
      onSubmissionsChanged?.()
    } catch {
      alert("Network error — could not reach the server.")
    } finally {
      setBusy((b) => { const next = { ...b }; delete next[key]; return next })
    }
  }, [onSubmissionsChanged])

  // Removes a contact from this list by flipping its status to "Duplicate"
  // — for a row that's really the same household/person as another entry
  // already on the list, which is the most common reason to dismiss one.
  const markDuplicate = useCallback(async (c: PotentiallyFrenchContact) => {
    const key = `${c.submissionId}:${c.contactId}`
    setBusy((b) => ({ ...b, [key]: true }))
    try {
      const res = await fetch("/api/admin/potentially-french", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ submissionId: c.submissionId, contactId: c.contactId, action: "duplicate" }),
      })
      const data = await res.json()
      if (!res.ok) {
        alert(`Failed to mark "${c.fullName}" as Duplicate: ${data?.error ?? "Unknown error"}`)
        return
      }
      setContacts((prev) => prev.filter((x) => !(x.submissionId === c.submissionId && x.contactId === c.contactId)))
      setTotalCount((n) => Math.max(0, n - 1))
      // Cached submission counts changed server-side — refresh so the rest
      // of the dashboard reflects it immediately.
      onSubmissionsChanged?.()
    } catch {
      alert("Network error — could not reach the server.")
    } finally {
      setBusy((b) => { const next = { ...b }; delete next[key]; return next })
    }
  }, [onSubmissionsChanged])

  const filtered = contacts.filter((c) => {
    if (duplicatesOnly && c.duplicateAddressCount <= 1 && c.duplicateNameCount <= 1) return false
    if (search) {
      const q = search.toLowerCase()
      return (
        c.fullName.toLowerCase().includes(q) ||
        c.address.toLowerCase().includes(q) ||
        c.city.toLowerCase().includes(q) ||
        c.zipcode.toLowerCase().includes(q) ||
        c.userId.toLowerCase().includes(q)
      )
    }
    return true
  })

  return (
    <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-800 overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-3 px-6 py-4 border-b border-gray-100 dark:border-gray-800 bg-gray-50 dark:bg-gray-800/50">
        <div>
          <h2 className="text-lg font-bold text-gray-900 dark:text-white">Potentially French</h2>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
            {totalCount} contact{totalCount !== 1 ? "s" : ""} across all users
            {duplicateCount > 0 && (
              <span className="text-amber-600 dark:text-amber-400 font-medium"> · {duplicateCount} possible duplicate{duplicateCount !== 1 ? "s" : ""}</span>
            )}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <input
            type="text"
            placeholder="Search name, address, user…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="h-9 px-3 text-sm rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-700 dark:text-gray-300 focus:outline-none focus:ring-1 focus:ring-indigo-400 w-56"
          />
          <label className="flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400 cursor-pointer whitespace-nowrap">
            <input type="checkbox" checked={duplicatesOnly} onChange={(e) => setDuplicatesOnly(e.target.checked)} />
            Duplicates only
          </label>
          <button
            onClick={handleExport}
            disabled={contacts.length === 0}
            title="Export all Potentially French contacts to CSV — same format as the main app's Export CSV"
            className="inline-flex items-center gap-1.5 h-9 px-3 rounded-lg bg-green-600 hover:bg-green-700 disabled:opacity-50 text-white text-sm font-semibold transition-colors whitespace-nowrap"
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 10v6m0 0l-3-3m3 3l3-3m2-8H8a2 2 0 00-2 2v14a2 2 0 002 2h8a2 2 0 002-2V8l-6-6z" />
            </svg>
            Export CSV
          </button>
        </div>
      </div>

      {loading ? (
        <p className="px-6 py-12 text-center text-gray-400 text-sm">Loading…</p>
      ) : error ? (
        <p className="px-6 py-12 text-center text-red-500 text-sm">{error}</p>
      ) : filtered.length === 0 ? (
        <p className="px-6 py-12 text-center text-gray-400 text-sm">
          {duplicatesOnly ? "No duplicates found." : "No contacts marked Potentially French yet."}
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 dark:border-gray-800">
                <th className="text-left px-5 py-2 text-xs font-semibold text-gray-400 uppercase tracking-wide">Name</th>
                <th className="text-left px-4 py-2 text-xs font-semibold text-gray-400 uppercase tracking-wide">Address</th>
                <th className="text-left px-4 py-2 text-xs font-semibold text-gray-400 uppercase tracking-wide">City</th>
                <th className="text-left px-4 py-2 text-xs font-semibold text-gray-400 uppercase tracking-wide">Zip</th>
                <th className="text-left px-4 py-2 text-xs font-semibold text-gray-400 uppercase tracking-wide">Phone</th>
                <th className="text-left px-4 py-2 text-xs font-semibold text-gray-400 uppercase tracking-wide">User</th>
                <th className="text-left px-4 py-2 text-xs font-semibold text-gray-400 uppercase tracking-wide">Submitted</th>
                <th className="text-left px-4 py-2 text-xs font-semibold text-gray-400 uppercase tracking-wide">Duplicate</th>
                <th className="px-4 py-2"></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((c) => {
                const isDup = c.duplicateAddressCount > 1 || c.duplicateNameCount > 1
                return (
                  <tr
                    key={`${c.submissionId}:${c.contactId}`}
                    className={`border-b border-gray-100 dark:border-gray-800 last:border-0 hover:bg-gray-50 dark:hover:bg-gray-800/30 ${
                      isDup ? "bg-amber-50/50 dark:bg-amber-900/10" : ""
                    }`}
                  >
                    <td className="px-5 py-3 font-medium text-gray-900 dark:text-white">{c.fullName || "—"}</td>
                    <td className="px-4 py-3 text-gray-500 text-xs">{c.address || "—"}</td>
                    <td className="px-4 py-3 text-gray-500 text-xs">{c.city || "—"}</td>
                    <td className="px-4 py-3 text-gray-500 text-xs">{c.zipcode || "—"}</td>
                    <td className="px-4 py-3 text-gray-500 text-xs">{c.phone || "—"}</td>
                    <td className="px-4 py-3 text-gray-500 text-xs">{c.userId}</td>
                    <td className="px-4 py-3 text-gray-400 text-xs">{new Date(c.submittedAt).toLocaleDateString()}</td>
                    <td className="px-4 py-3">
                      {isDup ? (
                        <div className="flex flex-wrap gap-1">
                          {c.duplicateAddressCount > 1 && (
                            <span
                              title="Same address as another Potentially French contact"
                              className="text-xs font-semibold px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300"
                            >
                              {c.duplicateAddressCount}× address
                            </span>
                          )}
                          {c.duplicateNameCount > 1 && (
                            <span
                              title="Same name as another Potentially French contact"
                              className="text-xs font-semibold px-2 py-0.5 rounded-full bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300"
                            >
                              {c.duplicateNameCount}× name
                            </span>
                          )}
                        </div>
                      ) : (
                        <span className="text-xs text-gray-300 dark:text-gray-600">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1.5">
                        <button
                          onClick={() => markNotFrench(c)}
                          disabled={!!busy[`${c.submissionId}:${c.contactId}`]}
                          title="Remove from this list — sets the contact's status to Not French"
                          className="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-red-50 hover:bg-red-100 dark:bg-red-900/20 dark:hover:bg-red-900/40 text-red-600 dark:text-red-400 text-xs font-medium border border-red-200 dark:border-red-800 transition-colors disabled:opacity-50 whitespace-nowrap"
                        >
                          {busy[`${c.submissionId}:${c.contactId}`] ? "…" : (
                            <>
                              <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                              </svg>
                              Not French
                            </>
                          )}
                        </button>
                        <button
                          onClick={() => markDuplicate(c)}
                          disabled={!!busy[`${c.submissionId}:${c.contactId}`]}
                          title="Remove from this list — sets the contact's status to Duplicate"
                          className="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-amber-50 hover:bg-amber-100 dark:bg-amber-900/20 dark:hover:bg-amber-900/40 text-amber-600 dark:text-amber-400 text-xs font-medium border border-amber-200 dark:border-amber-800 transition-colors disabled:opacity-50 whitespace-nowrap"
                        >
                          {busy[`${c.submissionId}:${c.contactId}`] ? "…" : (
                            <>
                              <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                              </svg>
                              Duplicate
                            </>
                          )}
                        </button>
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

// ── Dictionary Scan panel ─────────────────────────────────────────────────────
// Scans every non-archived submission's contacts, skips anything already
// marked "Potentially French", and flags whichever remaining contacts have a
// last name that's actually in the live dictionary — catches names that were
// submitted (or manually reclassified) before the dictionary caught up, or
// whose status was overridden by hand. Same Forebears/TruePeopleSearch URL
// scheme as the main app's per-contact search buttons.

type DictionaryScanMatch = {
  submissionId: number
  contactId: string
  userId: string
  submittedAt: string
  fullName: string
  lastName: string
  matchedName: string
  address: string
  city: string
  zipcode: string
  phone: string
  status: string
  duplicateAddressCount: number
}

function forebearsUrlForSurname(lastName: string) {
  const surname = String(lastName || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/[\u0300-\u036f]/g, "")
  return `https://forebears.io/surnames/${encodeURIComponent(surname)}`
}

function truePeopleSearchUrlFor(fullName: string, zipcode: string) {
  return `https://www.truepeoplesearch.com/results?name=${encodeURIComponent(fullName)}&citystatezip=${encodeURIComponent(zipcode)}`
}

function DictionaryScanPanel({ onSubmissionsChanged }: { onSubmissionsChanged?: () => void }) {
  const [matches, setMatches] = useState<DictionaryScanMatch[]>([])
  const [totalScanned, setTotalScanned] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [search, setSearch] = useState("")
  const [reviewedNotice, setReviewedNotice] = useState<string | null>(null)
  const [busy, setBusy] = useState<Record<string, boolean>>({})
  const [editingKey, setEditingKey] = useState<string | null>(null)
  const [editDraft, setEditDraft] = useState({ fullName: "", lastName: "", address: "", city: "", zipcode: "", phone: "" })
  const [savingEdit, setSavingEdit] = useState(false)

  // Read-only — used for the panel's automatic initial load only. Never
  // touches review status, so opening the tab has no side effects.
  const load = useCallback(() => {
    setLoading(true)
    setError(null)
    fetch("/api/admin/name-dictionary-scan")
      .then((r) => r.json())
      .then((data) => {
        if (data?.error) {
          setError(data.error)
        } else {
          setMatches(data.matches ?? [])
          setTotalScanned(data.totalScanned ?? 0)
        }
        setLoading(false)
      })
      .catch(() => {
        setError("Network error — could not reach the server.")
        setLoading(false)
      })
  }, [])

  useEffect(() => { load() }, [load])

  // Explicit admin action — re-runs the scan AND marks every non-archived
  // submission it covers as "reviewed", since this scan is itself a review
  // pass over those submissions' name classifications.
  const rescanAndMarkReviewed = useCallback(() => {
    if (!window.confirm("Rescan and mark all active submissions as reviewed?")) return
    setLoading(true)
    setError(null)
    setReviewedNotice(null)
    fetch("/api/admin/name-dictionary-scan", { method: "POST" })
      .then((r) => r.json())
      .then((data) => {
        if (data?.error) {
          setError(data.error)
        } else {
          setMatches(data.matches ?? [])
          setTotalScanned(data.totalScanned ?? 0)
          setReviewedNotice(`✓ Marked ${data.reviewedCount ?? 0} submission${data.reviewedCount === 1 ? "" : "s"} as reviewed.`)
          onSubmissionsChanged?.()
        }
        setLoading(false)
      })
      .catch(() => {
        setError("Network error — could not reach the server.")
        setLoading(false)
      })
  }, [onSubmissionsChanged])

  const filtered = matches.filter((m) => {
    if (!search) return true
    const q = search.toLowerCase()
    return (
      m.fullName.toLowerCase().includes(q) ||
      m.lastName.toLowerCase().includes(q) ||
      m.city.toLowerCase().includes(q) ||
      m.zipcode.toLowerCase().includes(q) ||
      m.userId.toLowerCase().includes(q)
    )
  })

  // Grouped by submission — easier to scan than one flat alphabetical list
  // when a handful of submissions account for most of the missed matches.
  const groups: { submissionId: number; userId: string; submittedAt: string; items: DictionaryScanMatch[] }[] = []
  {
    const bySubmission = new Map<number, { submissionId: number; userId: string; submittedAt: string; items: DictionaryScanMatch[] }>()
    for (const m of filtered) {
      let g = bySubmission.get(m.submissionId)
      if (!g) {
        g = { submissionId: m.submissionId, userId: m.userId, submittedAt: m.submittedAt, items: [] }
        bySubmission.set(m.submissionId, g)
      }
      g.items.push(m)
    }
    groups.push(...Array.from(bySubmission.values()).sort((a, b) => new Date(b.submittedAt).getTime() - new Date(a.submittedAt).getTime()))
  }

  // Resolves the row directly: sets the contact's status to "Potentially
  // French" and drops it from the list, since it's now correctly flagged.
  const markAsFrench = useCallback(async (m: DictionaryScanMatch) => {
    const key = `${m.submissionId}:${m.contactId}`
    setBusy((b) => ({ ...b, [key]: true }))
    try {
      const res = await fetch("/api/admin/name-dictionary-scan", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ submissionId: m.submissionId, contactId: m.contactId }),
      })
      const data = await res.json()
      if (!res.ok) {
        alert(`Failed to mark "${m.fullName}" as Potentially French: ${data?.error ?? "Unknown error"}`)
        return
      }
      setMatches((prev) => prev.filter((x) => !(x.submissionId === m.submissionId && x.contactId === m.contactId)))
      // Cached submission counts and the Potentially French list both just
      // changed server-side — refresh so the rest of the dashboard reflects
      // it immediately instead of only on next tab switch.
      onSubmissionsChanged?.()
    } catch {
      alert("Network error — could not reach the server.")
    } finally {
      setBusy((b) => { const next = { ...b }; delete next[key]; return next })
    }
  }, [onSubmissionsChanged])

  // Removes the matched surname from the live dictionary entirely — for a
  // false-positive dictionary entry, not just this one contact. Since every
  // contact sharing that surname was only on this list because of the
  // dictionary entry, they all drop off the list together once it's gone.
  const removeFromDictionary = useCallback(async (m: DictionaryScanMatch) => {
    const key = `remove:${m.matchedName}`
    setBusy((b) => ({ ...b, [key]: true }))
    try {
      const res = await fetch("/api/admin/dictionary-feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: m.matchedName, action: "remove" }),
      })
      const data = await res.json()
      if (!res.ok) {
        alert(`Failed to remove "${m.matchedName}" from the dictionary: ${data?.error ?? "Unknown error"}`)
        return
      }
      setMatches((prev) => prev.filter((x) => x.matchedName !== m.matchedName))
    } catch {
      alert("Network error — could not reach the server.")
    } finally {
      setBusy((b) => { const next = { ...b }; delete next[key]; return next })
    }
  }, [])

  // Hides just this contact from future scans — doesn't touch its status or
  // the dictionary, for cases where the match is a known/accepted exception.
  const dismissMatch = useCallback(async (m: DictionaryScanMatch) => {
    const key = `${m.submissionId}:${m.contactId}`
    setBusy((b) => ({ ...b, [key]: true }))
    try {
      const res = await fetch("/api/admin/name-dictionary-scan", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ submissionId: m.submissionId, contactId: m.contactId, action: "dismiss" }),
      })
      const data = await res.json()
      if (!res.ok) {
        alert(`Failed to remove "${m.fullName}" from the list: ${data?.error ?? "Unknown error"}`)
        return
      }
      setMatches((prev) => prev.filter((x) => !(x.submissionId === m.submissionId && x.contactId === m.contactId)))
    } catch {
      alert("Network error — could not reach the server.")
    } finally {
      setBusy((b) => { const next = { ...b }; delete next[key]; return next })
    }
  }, [])

  const startEdit = useCallback((m: DictionaryScanMatch) => {
    setEditingKey(`${m.submissionId}:${m.contactId}`)
    setEditDraft({ fullName: m.fullName, lastName: m.lastName, address: m.address, city: m.city, zipcode: m.zipcode, phone: m.phone })
  }, [])

  const cancelEdit = useCallback(() => {
    setEditingKey(null)
  }, [])

  // Persists the edited fields, then re-runs the read-only scan so the row
  // reflects reality afterward — an edited last name or address can change
  // whether this contact still belongs on the list at all.
  const saveEdit = useCallback(async (m: DictionaryScanMatch) => {
    setSavingEdit(true)
    try {
      const res = await fetch("/api/admin/name-dictionary-scan", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ submissionId: m.submissionId, contactId: m.contactId, action: "update", fields: editDraft }),
      })
      const data = await res.json()
      if (!res.ok) {
        alert(`Failed to save changes for "${m.fullName}": ${data?.error ?? "Unknown error"}`)
        return
      }
      setEditingKey(null)
      load()
    } catch {
      alert("Network error — could not reach the server.")
    } finally {
      setSavingEdit(false)
    }
  }, [editDraft, load])

  return (
    <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-800 overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-3 px-6 py-4 border-b border-gray-100 dark:border-gray-800 bg-gray-50 dark:bg-gray-800/50">
        <div>
          <h2 className="text-lg font-bold text-gray-900 dark:text-white">Dictionary Scan</h2>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
            Contacts not marked "Potentially French" whose last name is already in the dictionary — likely missed or
            outdated classifications. Scanned {totalScanned} contact{totalScanned !== 1 ? "s" : ""}.
          </p>
          {reviewedNotice && (
            <p className="text-sm text-green-600 dark:text-green-400 font-medium mt-1">{reviewedNotice}</p>
          )}
        </div>
        <div className="flex items-center gap-3">
          <input
            type="text"
            placeholder="Search name, city, user…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="h-9 px-3 text-sm rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-700 dark:text-gray-300 focus:outline-none focus:ring-1 focus:ring-indigo-400 w-56"
          />
          <button
            onClick={rescanAndMarkReviewed}
            disabled={loading}
            title="Re-run the scan and mark all active submissions as reviewed"
            className="h-9 px-3 text-sm rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white font-semibold disabled:opacity-50 transition-colors"
          >
            {loading ? "Scanning…" : "Rescan & Mark Reviewed"}
          </button>
        </div>
      </div>

      {loading ? (
        <p className="px-6 py-12 text-center text-gray-400 text-sm">Scanning submissions…</p>
      ) : error ? (
        <p className="px-6 py-12 text-center text-red-500 text-sm">{error}</p>
      ) : filtered.length === 0 ? (
        <p className="px-6 py-12 text-center text-gray-400 text-sm">
          {matches.length === 0 ? "No missed matches — every dictionary name is already flagged correctly." : "No matches for current search."}
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 dark:border-gray-800">
                <th className="text-left px-5 py-2 text-xs font-semibold text-gray-400 uppercase tracking-wide">Name</th>
                <th className="text-left px-4 py-2 text-xs font-semibold text-gray-400 uppercase tracking-wide">Address</th>
                <th className="text-left px-4 py-2 text-xs font-semibold text-gray-400 uppercase tracking-wide">Phone</th>
                <th className="text-left px-4 py-2 text-xs font-semibold text-gray-400 uppercase tracking-wide">Status</th>
                <th className="text-left px-4 py-2 text-xs font-semibold text-gray-400 uppercase tracking-wide">Duplicate</th>
                <th className="px-4 py-2"></th>
              </tr>
            </thead>
            <tbody>
              {groups.map((g) => (
                <Fragment key={g.submissionId}>
                  <tr className="bg-gray-50 dark:bg-gray-800/50 border-b border-gray-100 dark:border-gray-800">
                    <td colSpan={6} className="px-5 py-2">
                      <div className="flex flex-wrap items-center gap-2 text-xs">
                        <span className="font-semibold text-gray-700 dark:text-gray-300">{g.userId}</span>
                        <span className="text-gray-400">· {new Date(g.submittedAt).toLocaleDateString()}</span>
                        <span className="text-gray-400">· {g.items.length} missed name{g.items.length !== 1 ? "s" : ""}</span>
                        <Link
                          href={`/admin/user/${encodeURIComponent(g.userId)}?submissionId=${g.submissionId}`}
                          className="ml-auto text-blue-600 hover:underline font-semibold"
                        >
                          View submission →
                        </Link>
                      </div>
                    </td>
                  </tr>
                  {g.items.map((m) => {
                    const key = `${m.submissionId}:${m.contactId}`
                    const isEditing = editingKey === key
                    const inputClass =
                      "h-7 px-2 text-xs rounded-md border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-700 dark:text-gray-300 focus:outline-none focus:ring-1 focus:ring-indigo-400"
                    return (
                    <tr
                      key={key}
                      className="border-b border-gray-100 dark:border-gray-800 last:border-0 hover:bg-gray-50 dark:hover:bg-gray-800/30"
                    >
                      <td className="px-5 py-3">
                        {isEditing ? (
                          <div className="flex flex-col gap-1">
                            <input
                              type="text"
                              placeholder="Full name"
                              value={editDraft.fullName}
                              onChange={(e) => setEditDraft((d) => ({ ...d, fullName: e.target.value }))}
                              className={`${inputClass} w-full`}
                            />
                            <input
                              type="text"
                              placeholder="Last name"
                              title="Last name — drives the dictionary surname match"
                              value={editDraft.lastName}
                              onChange={(e) => setEditDraft((d) => ({ ...d, lastName: e.target.value }))}
                              className={`${inputClass} w-full`}
                            />
                          </div>
                        ) : (
                          <>
                            <div className="font-medium text-gray-900 dark:text-white">{m.fullName || "—"}</div>
                            <div className="text-xs text-gray-400 mt-0.5">matched: {m.matchedName}</div>
                          </>
                        )}
                      </td>
                      <td className="px-4 py-3 text-gray-500 text-xs">
                        {isEditing ? (
                          <div className="flex flex-col gap-1">
                            <input
                              type="text"
                              placeholder="Street address"
                              value={editDraft.address}
                              onChange={(e) => setEditDraft((d) => ({ ...d, address: e.target.value }))}
                              className={`${inputClass} w-full`}
                            />
                            <div className="flex gap-1.5">
                              <input
                                type="text"
                                placeholder="City"
                                value={editDraft.city}
                                onChange={(e) => setEditDraft((d) => ({ ...d, city: e.target.value }))}
                                className={`${inputClass} flex-1 min-w-0`}
                              />
                              <input
                                type="text"
                                placeholder="Zip"
                                value={editDraft.zipcode}
                                onChange={(e) => setEditDraft((d) => ({ ...d, zipcode: e.target.value }))}
                                className={`${inputClass} w-20 flex-none`}
                              />
                            </div>
                          </div>
                        ) : (
                          [m.address, m.city, m.zipcode].filter(Boolean).join(", ") || "—"
                        )}
                      </td>
                      <td className="px-4 py-3 text-gray-500 text-xs">
                        {isEditing ? (
                          <input
                            type="text"
                            value={editDraft.phone}
                            onChange={(e) => setEditDraft((d) => ({ ...d, phone: e.target.value }))}
                            className={`${inputClass} w-full`}
                          />
                        ) : (
                          m.phone || "—"
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400">
                          {m.status}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        {m.duplicateAddressCount > 1 ? (
                          <span
                            title="Same address as another match in this list"
                            className="text-xs font-semibold px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300"
                          >
                            {m.duplicateAddressCount}× address
                          </span>
                        ) : (
                          <span className="text-xs text-gray-300 dark:text-gray-600">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        {isEditing ? (
                          <div className="flex items-center gap-1.5">
                            <button
                              onClick={() => saveEdit(m)}
                              disabled={savingEdit}
                              title="Save changes"
                              className="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-green-50 hover:bg-green-100 dark:bg-green-900/20 dark:hover:bg-green-900/40 text-green-600 dark:text-green-400 text-xs font-medium border border-green-200 dark:border-green-800 transition-colors disabled:opacity-50"
                            >
                              {savingEdit ? "…" : "Save"}
                            </button>
                            <button
                              onClick={cancelEdit}
                              disabled={savingEdit}
                              title="Discard changes"
                              className="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-gray-50 hover:bg-gray-100 dark:bg-gray-800 dark:hover:bg-gray-700 text-gray-500 dark:text-gray-400 text-xs font-medium border border-gray-200 dark:border-gray-700 transition-colors disabled:opacity-50"
                            >
                              Cancel
                            </button>
                          </div>
                        ) : (
                          <div className="flex items-center gap-1.5">
                            <a
                              href={forebearsUrlForSurname(m.lastName)}
                              target="_blank"
                              rel="noopener noreferrer"
                              title="Search on Forebears.io"
                              className="inline-flex items-center justify-center h-[26px] w-[26px] rounded-md bg-blue-50 hover:bg-blue-100 dark:bg-blue-900/20 dark:hover:bg-blue-900/40 text-blue-600 dark:text-blue-400 border border-blue-200 dark:border-blue-800 transition-colors"
                            >
                              <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                <circle cx="12" cy="12" r="10" />
                                <path strokeLinecap="round" strokeLinejoin="round" d="M2 12h20M12 2a15.3 15.3 0 010 20M12 2a15.3 15.3 0 000 20" />
                              </svg>
                            </a>
                            <a
                              href={truePeopleSearchUrlFor(m.fullName, m.zipcode)}
                              target="_blank"
                              rel="noopener noreferrer"
                              title="Search on TruePeopleSearch"
                              className="inline-flex items-center justify-center h-[26px] w-[26px] rounded-md bg-indigo-50 hover:bg-indigo-100 dark:bg-indigo-900/20 dark:hover:bg-indigo-900/40 text-indigo-600 dark:text-indigo-400 border border-indigo-200 dark:border-indigo-800 transition-colors"
                            >
                              <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M5.121 17.804A13.937 13.937 0 0112 16c2.5 0 4.847.655 6.879 1.804M15 10a3 3 0 11-6 0 3 3 0 016 0z" />
                                <circle cx="12" cy="12" r="9" strokeWidth={2} />
                              </svg>
                            </a>
                            <button
                              onClick={() => markAsFrench(m)}
                              disabled={!!busy[key]}
                              title="Mark this contact's status as Potentially French"
                              className="inline-flex items-center justify-center h-[26px] w-[26px] rounded-md bg-green-50 hover:bg-green-100 dark:bg-green-900/20 dark:hover:bg-green-900/40 text-green-600 dark:text-green-400 border border-green-200 dark:border-green-800 transition-colors disabled:opacity-50"
                            >
                              {busy[key] ? "…" : (
                                <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                                </svg>
                              )}
                            </button>
                            <button
                              onClick={() => removeFromDictionary(m)}
                              disabled={!!busy[`remove:${m.matchedName}`]}
                              title={`Not French — remove "${m.matchedName}" from the dictionary entirely (affects every contact with this surname)`}
                              className="inline-flex items-center justify-center h-[26px] w-[26px] rounded-md bg-red-50 hover:bg-red-100 dark:bg-red-900/20 dark:hover:bg-red-900/40 text-red-600 dark:text-red-400 border border-red-200 dark:border-red-800 transition-colors disabled:opacity-50"
                            >
                              {busy[`remove:${m.matchedName}`] ? "…" : (
                                <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                                </svg>
                              )}
                            </button>
                            <button
                              onClick={() => startEdit(m)}
                              title="Edit this contact's information"
                              className="inline-flex items-center justify-center h-[26px] w-[26px] rounded-md bg-gray-50 hover:bg-gray-100 dark:bg-gray-800 dark:hover:bg-gray-700 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 border border-gray-200 dark:border-gray-700 transition-colors"
                            >
                              <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                              </svg>
                            </button>
                            <button
                              onClick={() => dismissMatch(m)}
                              disabled={!!busy[key]}
                              title="Remove from this list — doesn't change the contact's status or the dictionary"
                              className="inline-flex items-center justify-center h-[26px] w-[26px] rounded-md bg-gray-50 hover:bg-gray-100 dark:bg-gray-800 dark:hover:bg-gray-700 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 border border-gray-200 dark:border-gray-700 transition-colors disabled:opacity-50"
                            >
                              <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                              </svg>
                            </button>
                          </div>
                        )}
                      </td>
                    </tr>
                    )
                  })}
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
