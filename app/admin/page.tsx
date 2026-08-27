"use client"

import { useEffect, useState, useCallback, useRef, Fragment } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import {
  Archive,
  ArchiveRestore,
  ArrowUpDown,
  BookOpen,
  CheckCircle2,
  ChevronDown,
  EyeOff,
  Filter as FilterIcon,
  Inbox,
  LayoutDashboard,
  LogOut,
  MoreHorizontal,
  Search,
  Trash2,
  Upload,
  Users,
  Wrench,
  X,
} from "lucide-react"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { ThemeSwitcher } from "@/components/theme-switcher"
import { useWorkspaceRuntime } from "@/components/workspace/workspace-context"

// ── Types ────────────────────────────────────────────────────────────────────

type ReviewStatus = "pending" | "in_review" | "reviewed"
type SubmissionSort = "newest" | "oldest" | "user" | "contacts" | "progress"

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

// ── Helpers ───────────────────────────────────────────────────────────────────

const STATUS_CLASSES: Record<ReviewStatus, string> = {
  pending:   "border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-800 dark:bg-amber-950/50 dark:text-amber-300",
  in_review: "border-blue-200 bg-blue-50 text-blue-700 dark:border-blue-800 dark:bg-blue-950/50 dark:text-blue-300",
  reviewed:  "border-green-200 bg-green-50 text-green-700 dark:border-green-800 dark:bg-green-950/50 dark:text-green-300",
}

const SUBMISSION_SORT_OPTIONS: Array<{ value: SubmissionSort; label: string }> = [
  { value: "newest", label: "Newest first" },
  { value: "oldest", label: "Oldest first" },
  { value: "user", label: "User A–Z" },
  { value: "contacts", label: "Most contacts" },
  { value: "progress", label: "Needs review" },
]

const USER_ICON_CLASSES = [
  "bg-blue-100 text-blue-700 dark:bg-blue-950/70 dark:text-blue-300",
  "bg-violet-100 text-violet-700 dark:bg-violet-950/70 dark:text-violet-300",
  "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/70 dark:text-emerald-300",
  "bg-amber-100 text-amber-700 dark:bg-amber-950/70 dark:text-amber-300",
  "bg-rose-100 text-rose-700 dark:bg-rose-950/70 dark:text-rose-300",
  "bg-cyan-100 text-cyan-700 dark:bg-cyan-950/70 dark:text-cyan-300",
  "bg-orange-100 text-orange-700 dark:bg-orange-950/70 dark:text-orange-300",
  "bg-fuchsia-100 text-fuchsia-700 dark:bg-fuchsia-950/70 dark:text-fuchsia-300",
] as const

function pct(a: number, total: number) {
  return total > 0 ? Math.round((a / total) * 100) : 0
}

function userIconClass(userId: string) {
  let hash = 0
  for (let index = 0; index < userId.length; index += 1) {
    hash = ((hash << 5) - hash + userId.charCodeAt(index)) | 0
  }
  return USER_ICON_CLASSES[Math.abs(hash) % USER_ICON_CLASSES.length]
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function AdminDashboard() {
  const router = useRouter()
  const workspace = useWorkspaceRuntime()
  const adminApiBase = workspace ? `/api/c/${encodeURIComponent(workspace.slug)}/admin` : "/api/admin"
  const adminPeopleBase = workspace ? `/c/${workspace.slug}/admin/people` : "/admin/user"
  const toolsHelpHref = workspace ? `/c/${workspace.slug}/admin/tools-help` : "/admin/tools-help"
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
  const [submissionSearch, setSubmissionSearch] = useState("")
  const [submissionUser, setSubmissionUser] = useState("all")
  const [submissionStatus, setSubmissionStatus] = useState<"all" | ReviewStatus>("all")
  const [submissionProgress, setSubmissionProgress] = useState<"all" | "complete" | "incomplete" | "unchecked">("all")
  const [submissionSort, setSubmissionSort] = useState<SubmissionSort>("newest")
  const importFileRef = useRef<HTMLInputElement>(null)
  const [importing, setImporting] = useState(false)
  const [importMessage, setImportMessage] = useState<string | null>(null)
  const [importUserName, setImportUserName] = useState("")
  const [importPayload, setImportPayload] = useState<unknown>(null)
  const [importFileName, setImportFileName] = useState("")
  const [importDialogOpen, setImportDialogOpen] = useState(false)

  // ── Fetch ─────────────────────────────────────────────────────────────────

  const fetchSubmissions = useCallback(async () => {
    try {
      const res = await fetch(`${adminApiBase}/submissions`)
      if (res.status === 401) {
        router.push(workspace ? "/auth/sign-in" : "/admin/login")
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
  }, [adminApiBase, router, workspace])

  useEffect(() => { fetchSubmissions() }, [fetchSubmissions])

  // ── Mutations ─────────────────────────────────────────────────────────────

  const setStatus = useCallback(async (id: number, review_status: ReviewStatus) => {
    setBusy(b => ({ ...b, [id]: true }))
    await fetch(`${adminApiBase}/submissions`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, review_status }),
    })
    setSubmissions(s =>
      s.map(sub => sub.id === id ? { ...sub, review_status } : sub)
    )
    setBusy(b => ({ ...b, [id]: false }))
  }, [adminApiBase])

  const toggleArchive = useCallback(async (id: number, archived: boolean) => {
    setBusy(b => ({ ...b, [id]: true }))
    await fetch(`${adminApiBase}/submissions`, {
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
  }, [adminApiBase])

  const deleteSubmission = useCallback(async (id: number) => {
    if (!confirm("Permanently delete this submission? This cannot be undone.")) return
    setBusy(b => ({ ...b, [id]: true }))
    await fetch(`${adminApiBase}/submissions?id=${id}`, { method: "DELETE" })
    setSubmissions(s => s.filter(sub => sub.id !== id))
    setBusy(b => ({ ...b, [id]: false }))
  }, [adminApiBase])

  const selectImportFile = useCallback(async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    event.target.value = ""
    if (!file) return
    if (!file.name.toLowerCase().endsWith(".json")) {
      setImportMessage("Choose a .json submission export.")
      return
    }
    if (file.size > 10 * 1024 * 1024) {
      setImportMessage("That file is too large. Choose a JSON file under 10 MB.")
      return
    }
    setImportMessage(null)
    try {
      setImportPayload(JSON.parse(await file.text()))
      setImportFileName(file.name)
      setImportUserName("")
      setImportDialogOpen(true)
    } catch {
      setImportMessage("The selected file is not valid JSON.")
    }
  }, [])

  const importSubmissions = useCallback(async () => {
    if (!importPayload || !importUserName.trim()) return
    setImporting(true)
    setImportMessage(null)
    try {
      const response = await fetch(`${adminApiBase}/submissions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ submissionImport: importPayload, userId: importUserName.trim() }),
      })
      const result = await response.json()
      if (!response.ok) {
        setImportMessage(result?.error ?? "Could not import the submission.")
        return
      }
      setImportMessage(`Imported ${result.imported} submission${result.imported === 1 ? "" : "s"}.`)
      setImportDialogOpen(false)
      setImportPayload(null)
      await fetchSubmissions()
    } catch {
      setImportMessage("Could not import the submission. Check your connection and try again.")
    } finally {
      setImporting(false)
    }
  }, [adminApiBase, fetchSubmissions, importPayload, importUserName])

  // ── Derived data ──────────────────────────────────────────────────────────

  const visible = submissions.filter(s => showArchived ? s.archived : !s.archived)
  const availableUsers = Array.from(new Set(submissions.map((submission) => submission.user_id))).sort((a, b) => a.localeCompare(b))
  const normalizedSearch = submissionSearch.trim().toLowerCase()
  const filteredVisible = visible.filter((submission) => {
    const reviewStatus = submission.review_status ?? "pending"
    const checkedCount = submission.potentially_french + submission.not_french + submission.duplicate
    const searchableText = [
      submission.user_id,
      submission.top_zipcode,
      submission.territory_zipcode,
      submission.territory_page_range,
      new Date(submission.submitted_at).toLocaleString(),
    ].filter(Boolean).join(" ").toLowerCase()

    if (normalizedSearch && !searchableText.includes(normalizedSearch)) return false
    if (submissionUser !== "all" && submission.user_id !== submissionUser) return false
    if (submissionStatus !== "all" && reviewStatus !== submissionStatus) return false
    if (submissionProgress === "complete" && checkedCount < submission.contact_count) return false
    if (submissionProgress === "incomplete" && checkedCount >= submission.contact_count) return false
    if (submissionProgress === "unchecked" && submission.not_checked === 0) return false
    return true
  })
  const sortedFilteredVisible = [...filteredVisible].sort((a, b) => {
    const newestFirst = new Date(b.submitted_at).getTime() - new Date(a.submitted_at).getTime()

    switch (submissionSort) {
      case "oldest":
        return -newestFirst
      case "user":
        return a.user_id.localeCompare(b.user_id) || newestFirst
      case "contacts":
        return b.contact_count - a.contact_count || newestFirst
      case "progress": {
        const aProgress = pct(a.potentially_french + a.not_french + a.duplicate, a.contact_count)
        const bProgress = pct(b.potentially_french + b.not_french + b.duplicate, b.contact_count)
        return aProgress - bProgress || newestFirst
      }
      case "newest":
      default:
        return newestFirst
    }
  })
  const activeFilterCount = [
    submissionUser !== "all",
    submissionStatus !== "all",
    submissionProgress !== "all",
  ].filter(Boolean).length
  const hasSubmissionFilters = normalizedSearch.length > 0 || activeFilterCount > 0

  const clearSubmissionFilters = () => {
    setSubmissionSearch("")
    setSubmissionUser("all")
    setSubmissionStatus("all")
    setSubmissionProgress("all")
  }

  const latestSubmissionIds = new Set<number>()
  const seenUsers = new Set<string>()
  visible.forEach((submission) => {
    if (!seenUsers.has(submission.user_id)) {
      seenUsers.add(submission.user_id)
      latestSubmissionIds.add(submission.id)
    }
  })

  const totalContacts  = visible.reduce((s, r) => s + r.contact_count, 0)
  const totalPending   = visible.filter(s => s.review_status === "pending").length
  const totalReviewed  = visible.filter(s => s.review_status === "reviewed").length
  const archivedCount  = submissions.filter(s => s.archived).length

  // ── Render ────────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="admin-shell flex min-h-screen items-center justify-center">
        <p className="animate-pulse text-sm text-muted-foreground">Loading admin…</p>
      </div>
    )
  }

  if (fetchError) {
    return (
      <div className="admin-shell flex min-h-screen items-center justify-center px-4">
        <div className="admin-material w-full max-w-sm rounded-2xl p-6 text-center">
          <p className="mb-2 text-base font-semibold text-destructive">Could not load admin</p>
          <p className="mb-4 text-sm text-muted-foreground">{fetchError}</p>
          <button
            onClick={() => { setLoading(true); setFetchError(null); fetchSubmissions() }}
            className="admin-primary-button h-9 rounded-xl px-4 text-sm font-medium text-white transition-all duration-150 ease-out"
          >
            Try again
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="admin-shell min-h-screen">
      <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">

        {/* ── Header ── */}
        <div className="mb-8 flex items-start justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="admin-icon-well flex h-11 w-11 items-center justify-center rounded-2xl text-primary">
              <LayoutDashboard className="h-5 w-5" aria-hidden="true" />
            </div>
            <div>
              <h1 className="text-2xl font-bold leading-tight tracking-tight">Admin</h1>
              <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
                Review submissions and manage contact checks.
              </p>
            </div>
          </div>
          {!workspace ? (
            <div className="flex items-center gap-2">
              <ThemeSwitcher className="admin-material" />
              <button
                onClick={async () => {
                  await fetch("/api/admin/logout", { method: "POST" })
                  window.location.href = "/"
                }}
                className="admin-material inline-flex h-10 items-center gap-2 rounded-full px-4 text-sm font-medium text-muted-foreground transition-all duration-150 ease-out hover:-translate-y-px hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <LogOut className="h-4 w-4" aria-hidden="true" />
                <span className="hidden sm:inline">Sign out</span>
              </button>
            </div>
          ) : null}
        </div>

        {/* ── Primary navigation ── */}
        <div className="admin-material mb-6 inline-flex items-center gap-1 rounded-full p-1">
          <button
            onClick={() => setActiveTab("submissions")}
            className={`rounded-full px-4 py-2 text-sm font-medium transition-all duration-150 ease-out ${
              activeTab === "submissions"
                ? "bg-muted/70 text-foreground shadow-sm"
                : "text-muted-foreground hover:bg-background/50 hover:text-foreground"
            }`}
          >
            Review queue
          </button>
          <button
            onClick={() => {
              setActiveTab("potentiallyFrench")
              setVisitedTabs((visited) => new Set(visited).add("potentiallyFrench"))
            }}
            className={`rounded-full px-4 py-2 text-sm font-medium transition-all duration-150 ease-out ${
              activeTab === "potentiallyFrench"
                ? "bg-muted/70 text-foreground shadow-sm"
                : "text-muted-foreground hover:bg-background/50 hover:text-foreground"
            }`}
          >
            Potential Frenchs
          </button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                className={`inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-medium transition-all duration-150 ease-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                  activeTab === "dictionaryScan" || activeTab === "names" || activeTab === "otm"
                    ? "bg-muted/70 text-foreground shadow-sm"
                    : "text-muted-foreground hover:bg-background/50 hover:text-foreground"
                }`}
              >
                <Wrench className="h-4 w-4" aria-hidden="true" />
                Tools
                <ChevronDown className="h-4 w-4" aria-hidden="true" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="admin-material w-80 rounded-2xl p-2">
              <DropdownMenuLabel>Review tools</DropdownMenuLabel>
              {([
                ["dictionaryScan", "Find missed French contacts", "Find contacts whose surnames match the dictionary but were not flagged."],
                ["names", "Manage name dictionary", "Add or remove surnames used for automatic French detection."],
                ["otm", "Database Duplicates Check", "Compare submitted addresses with an uploaded congregation database."],
              ] as const).map(([tab, label, description]) => (
                <DropdownMenuItem
                  key={tab}
                  onSelect={() => {
                    setActiveTab(tab)
                    setVisitedTabs((visited) => new Set(visited).add(tab))
                  }}
                  className={`flex-col items-start gap-0.5 py-2.5 ${activeTab === tab ? "bg-accent" : ""}`}
                >
                  <span className="font-medium">{label}</span>
                  <span className="text-xs font-normal leading-relaxed text-muted-foreground">{description}</span>
                </DropdownMenuItem>
              ))}
              <DropdownMenuSeparator />
              <DropdownMenuItem asChild className="py-2.5">
                <Link href={toolsHelpHref} className="flex items-start gap-2">
                  <BookOpen className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                  <span>
                    <span className="block font-medium">Tools FAQ</span>
                    <span className="block text-xs font-normal leading-relaxed text-muted-foreground">Learn what every tool and action button does.</span>
                  </span>
                </Link>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        {/* Keep tools mounted after their first visit so switching does not refetch. */}
        {visitedTabs.has("otm") && (
          <div className={activeTab === "otm" ? "" : "hidden"}><OtmPanel /></div>
        )}

        {visitedTabs.has("names") && (
          <div className={activeTab === "names" ? "" : "hidden"}><DictionaryFeedbackPanel /></div>
        )}

        {visitedTabs.has("potentiallyFrench") && (
          <div className={activeTab === "potentiallyFrench" ? "" : "hidden"}><PotentiallyFrenchPanel onSubmissionsChanged={fetchSubmissions} /></div>
        )}

        {visitedTabs.has("dictionaryScan") && (
          <div className={activeTab === "dictionaryScan" ? "" : "hidden"}>
            <DictionaryScanPanel onSubmissionsChanged={fetchSubmissions} />
          </div>
        )}

        {/* ── Review queue ── */}
        <div className={activeTab === "submissions" ? "" : "hidden"}>
          <input ref={importFileRef} type="file" accept="application/json,.json" onChange={selectImportFile} className="sr-only" />
          <div className="mb-6 flex flex-col gap-4 border-y py-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="grid grid-cols-3 divide-x">
              <QueueMetric icon={Inbox} label="Pending" value={totalPending} />
              <QueueMetric icon={Users} label="Contacts" value={totalContacts} />
              <QueueMetric icon={CheckCircle2} label="Reviewed" value={totalReviewed} />
            </div>
            <div className="flex w-fit flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => importFileRef.current?.click()}
                disabled={importing}
                className="admin-primary-button inline-flex h-9 items-center gap-2 rounded-full px-4 text-sm font-medium text-white disabled:opacity-60"
              >
                <Upload className="h-4 w-4" aria-hidden="true" />
                {importing ? "Importing…" : "Import JSON"}
              </button>
              <div className="inline-flex rounded-full bg-muted/70 p-1 shadow-inner">
              <button
                onClick={() => setShowArchived(false)}
                className={`rounded-full px-4 py-1.5 text-sm font-medium transition-all duration-150 ease-out ${!showArchived ? "bg-background text-foreground shadow-sm dark:bg-white/10" : "text-muted-foreground hover:text-foreground"}`}
              >
                Active
              </button>
              <button
                onClick={() => setShowArchived(true)}
                className={`rounded-full px-4 py-1.5 text-sm font-medium transition-all duration-150 ease-out ${showArchived ? "bg-background text-foreground shadow-sm dark:bg-white/10" : "text-muted-foreground hover:text-foreground"}`}
              >
                Archived{archivedCount > 0 ? ` (${archivedCount})` : ""}
              </button>
              </div>
            </div>
          </div>
          {importMessage && (
            <p role="status" className="-mt-4 mb-4 text-sm text-muted-foreground">{importMessage}</p>
          )}
          <Dialog open={importDialogOpen} onOpenChange={(open) => {
            if (!importing) setImportDialogOpen(open)
          }}>
            <DialogContent className="sm:max-w-md">
              <DialogHeader>
                <DialogTitle>Assign imported submission</DialogTitle>
                <DialogDescription>
                  Enter the name to display for {importFileName}. This person does not need to be a congregation member.
                </DialogDescription>
              </DialogHeader>
              <label className="block" htmlFor="import-user-name">
                <span className="mb-2 block text-sm font-medium">User</span>
                <input
                  id="import-user-name"
                  type="text"
                  value={importUserName}
                  onChange={(event) => setImportUserName(event.target.value)}
                  placeholder="e.g. Marie Martin"
                  maxLength={255}
                  autoFocus
                  disabled={importing}
                  className="admin-field h-10 w-full rounded-md px-3 text-sm outline-none placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60"
                />
              </label>
              <DialogFooter>
                <button
                  type="button"
                  onClick={() => setImportDialogOpen(false)}
                  disabled={importing}
                  className="inline-flex h-10 items-center justify-center rounded-md px-4 text-sm font-medium text-muted-foreground hover:bg-muted disabled:opacity-60"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={importSubmissions}
                  disabled={importing || !importUserName.trim()}
                  className="admin-primary-button inline-flex h-10 items-center justify-center rounded-md px-4 text-sm font-medium text-white disabled:opacity-60"
                >
                  {importing ? "Importing…" : "Import submission"}
                </button>
              </DialogFooter>
            </DialogContent>
          </Dialog>

          {visible.length === 0 && (
            <div className="border-y px-6 py-12 text-center">
              <p className="text-base font-semibold">{showArchived ? "No archived submissions" : "No submissions yet"}</p>
              <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
                {showArchived ? "Archived work will appear here." : "New work appears here after a user sends it for review."}
              </p>
            </div>
          )}

          {visible.length > 0 && (
            <section aria-labelledby="submissions-heading">
              <div className="mb-2 flex items-center justify-between px-2">
                <h2 id="submissions-heading" className="text-base font-semibold">Submissions</h2>
                <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  {hasSubmissionFilters ? `${filteredVisible.length} of ${visible.length}` : visible.length} record{visible.length !== 1 ? "s" : ""}
                </p>
              </div>
              <div className="mb-2 flex flex-wrap items-center justify-between gap-2 px-2">
                <div className="relative min-w-0 flex-1 sm:max-w-xs">
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
                  <input
                    type="search"
                    value={submissionSearch}
                    onChange={(event) => setSubmissionSearch(event.target.value)}
                    placeholder="Search submissions…"
                    aria-label="Search submissions"
                    className="admin-field h-9 w-full rounded-md pl-9 pr-9 text-sm outline-none transition-all duration-150 ease-out placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring"
                  />
                  {submissionSearch && (
                    <button
                      type="button"
                      onClick={() => setSubmissionSearch("")}
                      aria-label="Clear submission search"
                      className="absolute right-2 top-1/2 inline-flex h-6 w-6 -translate-y-1/2 items-center justify-center rounded text-muted-foreground transition-colors duration-150 ease-out hover:bg-muted hover:text-foreground"
                    >
                      <X className="h-3.5 w-3.5" aria-hidden="true" />
                    </button>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <button
                        type="button"
                        className="inline-flex h-9 items-center gap-2 rounded-md px-3 text-sm font-medium text-muted-foreground transition-colors duration-150 ease-out hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      >
                        <ArrowUpDown className="h-4 w-4" aria-hidden="true" />
                        <span className="hidden sm:inline">
                          {SUBMISSION_SORT_OPTIONS.find((option) => option.value === submissionSort)?.label}
                        </span>
                        <span className="sm:hidden">Sort</span>
                      </button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="admin-material w-48 rounded-xl p-2">
                      <DropdownMenuLabel className="text-xs uppercase tracking-wider text-muted-foreground">Sort submissions</DropdownMenuLabel>
                      <DropdownMenuRadioGroup
                        value={submissionSort}
                        onValueChange={(value) => setSubmissionSort(value as SubmissionSort)}
                      >
                        {SUBMISSION_SORT_OPTIONS.map((option) => (
                          <DropdownMenuRadioItem key={option.value} value={option.value}>
                            {option.label}
                          </DropdownMenuRadioItem>
                        ))}
                      </DropdownMenuRadioGroup>
                    </DropdownMenuContent>
                  </DropdownMenu>
                  <Popover>
                    <PopoverTrigger asChild>
                      <button
                        type="button"
                        className={`inline-flex h-9 items-center gap-2 rounded-md px-3 text-sm font-medium transition-colors duration-150 ease-out hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${activeFilterCount > 0 ? "bg-primary/10 text-primary" : "text-muted-foreground"}`}
                      >
                        <FilterIcon className="h-4 w-4" aria-hidden="true" />
                        Filter
                        {activeFilterCount > 0 && (
                          <span className="flex h-5 min-w-5 items-center justify-center rounded bg-primary px-1 text-xs font-semibold text-white">
                            {activeFilterCount}
                          </span>
                        )}
                      </button>
                    </PopoverTrigger>
                    <PopoverContent align="end" className="admin-material w-80 rounded-xl p-4">
                      <div className="mb-4 flex items-center justify-between">
                        <div>
                          <p className="text-base font-semibold">Filter submissions</p>
                          <p className="mt-1 text-sm leading-relaxed text-muted-foreground">Combine filters to narrow the database.</p>
                        </div>
                        {activeFilterCount > 0 && (
                          <button
                            type="button"
                            onClick={clearSubmissionFilters}
                            className="text-xs font-semibold text-muted-foreground transition-colors duration-150 ease-out hover:text-foreground"
                          >
                            Clear
                          </button>
                        )}
                      </div>
                      <div className="space-y-4">
                        <label className="block">
                          <span className="mb-2 block text-xs font-semibold uppercase tracking-wider text-muted-foreground">User</span>
                          <select
                            value={submissionUser}
                            onChange={(event) => setSubmissionUser(event.target.value)}
                            className="admin-field h-9 w-full rounded-md px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
                          >
                            <option value="all">All users</option>
                            {availableUsers.map((user) => <option key={user} value={user}>{user}</option>)}
                          </select>
                        </label>
                        <label className="block">
                          <span className="mb-2 block text-xs font-semibold uppercase tracking-wider text-muted-foreground">Status</span>
                          <select
                            value={submissionStatus}
                            onChange={(event) => setSubmissionStatus(event.target.value as "all" | ReviewStatus)}
                            className="admin-field h-9 w-full rounded-md px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
                          >
                            <option value="all">Any status</option>
                            <option value="pending">Pending</option>
                            <option value="in_review">In review</option>
                            <option value="reviewed">Reviewed</option>
                          </select>
                        </label>
                        <label className="block">
                          <span className="mb-2 block text-xs font-semibold uppercase tracking-wider text-muted-foreground">Review progress</span>
                          <select
                            value={submissionProgress}
                            onChange={(event) => setSubmissionProgress(event.target.value as "all" | "complete" | "incomplete" | "unchecked")}
                            className="admin-field h-9 w-full rounded-md px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
                          >
                            <option value="all">Any progress</option>
                            <option value="complete">100% checked</option>
                            <option value="incomplete">Still in progress</option>
                            <option value="unchecked">Has unchecked contacts</option>
                          </select>
                        </label>
                      </div>
                    </PopoverContent>
                  </Popover>
                  {hasSubmissionFilters && (
                    <button
                      type="button"
                      onClick={clearSubmissionFilters}
                      className="inline-flex h-9 items-center gap-2 rounded-md px-3 text-sm font-medium text-muted-foreground transition-colors duration-150 ease-out hover:bg-muted hover:text-foreground"
                    >
                      <X className="h-4 w-4" aria-hidden="true" />
                      Clear
                    </button>
                  )}
                </div>
              </div>
              <div className="overflow-x-auto border-y lg:overflow-visible">
                <table className="w-full min-w-[820px] text-sm">
                  <thead className="sticky top-0 z-10 bg-[hsl(var(--admin-surface))]">
                    <tr className="border-b">
                      <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">User</th>
                      <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">Submitted</th>
                      <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">Territory</th>
                      <th className="px-3 py-2 text-right text-xs font-semibold uppercase tracking-wider text-muted-foreground">Contacts</th>
                      <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">Status</th>
                      <th className="px-3 py-2"><span className="sr-only">Actions</span></th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredVisible.length === 0 && (
                      <tr>
                        <td colSpan={6} className="px-6 py-12 text-center">
                          <p className="text-base font-semibold">No matching submissions</p>
                          <p className="mt-1 text-sm leading-relaxed text-muted-foreground">Adjust or clear the current search and filters.</p>
                          <button
                            type="button"
                            onClick={clearSubmissionFilters}
                            className="mt-4 inline-flex h-9 items-center rounded-md px-3 text-sm font-medium text-primary transition-colors duration-150 ease-out hover:bg-primary/10"
                          >
                            Clear filters
                          </button>
                        </td>
                      </tr>
                    )}
                    {sortedFilteredVisible.map((sub) => {
                      const isBusy = !!busy[sub.id]
                      const zip = sub.top_zipcode || sub.territory_zipcode

                      return (
                        <tr key={sub.id} className="group border-b transition-colors duration-150 ease-out last:border-0 hover:bg-muted/30">
                          <td className="px-3 py-3">
                            <div className="flex items-center gap-2">
                              <span className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-xs font-semibold uppercase ${userIconClass(sub.user_id)}`} aria-hidden="true">
                                {sub.user_id.slice(0, 1)}
                              </span>
                              <span className="max-w-[180px] truncate font-medium">{sub.user_id}</span>
                            </div>
                          </td>
                          <td className="px-3 py-3 text-muted-foreground">
                            <div className="flex items-center gap-2">
                              <span>{new Date(sub.submitted_at).toLocaleString()}</span>
                              {latestSubmissionIds.has(sub.id) && <span className="rounded bg-primary/10 px-1.5 py-0.5 text-xs font-semibold text-primary">Latest</span>}
                            </div>
                          </td>
                          <td className="px-3 py-3 text-muted-foreground">
                            {zip ? `${zip}${sub.territory_page_range ? ` · pages ${sub.territory_page_range}` : ""}` : "—"}
                          </td>
                          <td className="px-3 py-3 text-right font-medium tabular-nums">{sub.contact_count}</td>
                          <td className="px-3 py-3">
                            <select
                              value={sub.review_status ?? "pending"}
                              disabled={isBusy}
                              onChange={(event) => setStatus(sub.id, event.target.value as ReviewStatus)}
                              aria-label={`Review status for submission ${sub.id}`}
                              className={`rounded-md border px-2 py-1 text-xs font-semibold outline-none transition-colors duration-150 ease-out focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50 ${STATUS_CLASSES[sub.review_status ?? "pending"]}`}
                            >
                              <option value="pending">Pending</option>
                              <option value="in_review">In review</option>
                              <option value="reviewed">Reviewed</option>
                            </select>
                          </td>
                          <td className="px-3 py-3">
                            <div className="flex items-center justify-end gap-2">
                              <Link
                                href={`${adminPeopleBase}/${encodeURIComponent(sub.user_id)}?submissionId=${sub.id}`}
                                className="inline-flex h-8 items-center rounded-md px-3 text-xs font-semibold text-primary transition-colors duration-150 ease-out hover:bg-primary/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                              >
                                Open
                              </Link>
                              <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                  <button
                                    disabled={isBusy}
                                    aria-label={`More actions for submission ${sub.id}`}
                                    className="inline-flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground opacity-60 transition-all duration-150 ease-out hover:bg-muted hover:text-foreground hover:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring group-hover:opacity-100 disabled:opacity-50"
                                  >
                                    <MoreHorizontal className="h-4 w-4" aria-hidden="true" />
                                  </button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent align="end" className="admin-material rounded-xl p-2">
                                  <DropdownMenuItem onSelect={() => toggleArchive(sub.id, !sub.archived)}>
                                    {sub.archived ? <ArchiveRestore aria-hidden="true" /> : <Archive aria-hidden="true" />}
                                    {sub.archived ? "Restore" : "Archive"}
                                  </DropdownMenuItem>
                                  <DropdownMenuSeparator />
                                  <DropdownMenuItem
                                    onSelect={() => deleteSubmission(sub.id)}
                                    className="text-destructive focus:text-destructive"
                                  >
                                    <Trash2 aria-hidden="true" />
                                    Delete permanently
                                  </DropdownMenuItem>
                                </DropdownMenuContent>
                              </DropdownMenu>
                            </div>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </section>
          )}
        </div>
      </div>
    </div>
  )
}

// ── Sub-components ────────────────────────────────────────────────────────────

function QueueMetric({ icon: Icon, label, value }: { icon: typeof Inbox; label: string; value: number }) {
  return (
    <div className="flex min-w-0 items-center gap-3 px-3 sm:px-5">
      <span className="admin-icon-well hidden h-9 w-9 items-center justify-center rounded-xl text-primary sm:flex">
        <Icon className="h-4 w-4" aria-hidden="true" />
      </span>
      <div>
        <p className="text-base font-semibold tabular-nums">{value}</p>
        <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{label}</p>
      </div>
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
  const workspace = useWorkspaceRuntime()
  const adminApiBase = workspace ? `/api/c/${encodeURIComponent(workspace.slug)}/admin` : "/api/admin"
  const adminPeopleBase = workspace ? `/c/${workspace.slug}/admin/people` : "/admin/user"
  const otmResultKey = workspace ? `search-helper:${workspace.slug}:admin:${OTM_LS_KEY}` : OTM_LS_KEY
  const otmNameKey = workspace ? `search-helper:${workspace.slug}:admin:${OTM_LS_NAME}` : OTM_LS_NAME
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
      const savedName   = localStorage.getItem(otmNameKey)
      const savedResult = localStorage.getItem(otmResultKey)
      if (savedResult) {
        setResult(JSON.parse(savedResult) as OtmResult)
        setFileName(savedName ?? "previous file")
        setRestored(true)
      }
    } catch { /* ignore parse errors */ }

    // Fetch DB-saved file metadata (works across browsers/sessions)
    fetch(`${adminApiBase}/otm-file`)
      .then(r => r.json())
      .then((data: SavedFileInfo) => setSavedFile(data))
      .catch(() => setSavedFile({ exists: false }))
  }, [adminApiBase, otmNameKey, otmResultKey])

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
    if (!file) { setError("Please select an Excel or CSV file first."); return }

    setRunning(true)
    setError(null)
    setResult(null)
    setRestored(false)
    setDismissed(new Set())

    try {
      const form = new FormData()
      form.append("file", file)
      const res = await fetch(`${adminApiBase}/otm-check`, { method: "POST", body: form })
      const data = await res.json()
      if (!res.ok) { setError(data.error ?? "Check failed"); return }
      const otmResult = data as OtmResult
      setResult(otmResult)

      // Persist result to localStorage for fast reload
      try {
        localStorage.setItem(otmResultKey, JSON.stringify(otmResult))
        localStorage.setItem(otmNameKey, file.name)
      } catch { /* ignore quota errors */ }

      // Also save the file bytes to Neon DB for cross-browser persistence
      setSavingFile(true)
      try {
        const saveForm = new FormData()
        saveForm.append("file", file)
        const saveRes = await fetch(`${adminApiBase}/otm-file`, { method: "POST", body: saveForm })
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
      const res = await fetch(`${adminApiBase}/otm-check?useSaved=true`, { method: "POST" })
      const data = await res.json()
      if (!res.ok) { setError(data.error ?? "Check failed"); return }
      const otmResult = data as OtmResult
      setResult(otmResult)
      try {
        localStorage.setItem(otmResultKey, JSON.stringify(otmResult))
        localStorage.setItem(otmNameKey, savedFile?.filename ?? "saved file")
      } catch { /* ignore quota errors */ }
    } catch {
      setError("Network error — could not reach the server.")
    } finally {
      setRunning(false)
    }
  }

  const clearSaved = () => {
    localStorage.removeItem(otmResultKey)
    localStorage.removeItem(otmNameKey)
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
        `${adminApiBase}/otm-contact?submissionId=${m.submissionId}&contactId=${encodeURIComponent(m.contactId)}`,
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
      try { localStorage.setItem(otmResultKey, JSON.stringify(updated)) } catch { /* ignore */ }
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
      try { localStorage.setItem(otmResultKey, JSON.stringify(updated)) } catch { /* ignore */ }
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
        <h2 className="text-lg font-bold text-gray-900 dark:text-white mb-1">Database Duplicates Check</h2>
        <p className="text-sm text-gray-500 dark:text-gray-400 mb-5">
          Upload an Excel or CSV file of known congregation addresses. This tool compares it with Potentially French contacts in every non-archived submission and flags exact or possible address matches. Removing a match deletes that duplicate contact from its submission; clearing a result only hides it from this report.
        </p>

        <div className="flex flex-wrap items-center gap-3">
          {/* Hidden file input */}
          <input
            ref={fileRef}
            type="file"
            id="otm-upload"
            accept=".xlsx,.xls,.csv,text/csv"
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
            {fileName ? "Change file" : "Upload congregation addresses"}
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
                <span className="text-gray-400 text-xs" title="Columns detected in the uploaded address file">
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
                            href={`${adminPeopleBase}/${encodeURIComponent(m.userId)}?submissionId=${m.submissionId}`}
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
// leave in the main app, cross-references the shared platform dictionary, and
// lets the admin apply add/remove changes immediately.

type NameCandidate = { name: string; count: number }

function forebearsUrlFor(name: string) {
  return `https://forebears.io/surnames/${encodeURIComponent(name)}`
}

function DictionaryFeedbackPanel() {
  const workspace = useWorkspaceRuntime()
  const adminApiBase = workspace ? `/api/c/${encodeURIComponent(workspace.slug)}/admin` : "/api/admin"
  const [activeSubTab, setActiveSubTab] = useState<"add" | "remove">("add")
  const [addCandidates, setAddCandidates] = useState<NameCandidate[]>([])
  const [removeCandidates, setRemoveCandidates] = useState<NameCandidate[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
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
      const res = await fetch(`${adminApiBase}/dictionary-feedback`)
      const data = await res.json()
      if (!res.ok) {
        setError(data?.error ?? "Failed to load name feedback.")
        setLoading(false)
        return
      }
      setAddCandidates(data.addCandidates ?? [])
      setRemoveCandidates(data.removeCandidates ?? [])
    } catch {
      setError("Network error — could not reach the server.")
    }
    setLoading(false)
  }, [adminApiBase, workspace])

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
      const res = await fetch(`${adminApiBase}/dictionary-feedback`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, action }),
      })
      const data = await res.json()
      if (!res.ok) {
        alert(`Failed to ${action} "${name}": ${data?.error ?? "Unknown error"}`)
      } else {
        await load()
      }
    } catch {
      alert("Network error — could not reach the server.")
    } finally {
      setBusy((b) => ({ ...b, [name]: false }))
    }
  }

  // Apply every selected name in one database operation.
  const applySelected = async (list: "add" | "remove") => {
    const names = Array.from(selected[list])
    if (names.length === 0) return
    setBatchBusy(true)
    try {
      const res = await fetch(`${adminApiBase}/dictionary-feedback`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ names, action: list }),
      })
      const data = await res.json()
      if (!res.ok) {
        alert(`Failed to apply selected names: ${data?.error ?? "Unknown error"}`)
        return
      }
      setSelected((prev) => ({ ...prev, [list]: new Set() }))
      await load()
    } catch {
      alert("Network error — could not reach the server.")
    } finally {
      setBatchBusy(false)
    }
  }

  // Permanently hide a name from a suggestion list without touching the
  // dictionary — for junk/false-positive entries.
  const dismiss = async (name: string, list: "add" | "remove") => {
    const key = `dismiss:${name}`
    setBusy((b) => ({ ...b, [key]: true }))
    try {
      const res = await fetch(`${adminApiBase}/dictionary-feedback`, {
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

  // Dismiss every selected name in one shot.
  const dismissSelected = async (list: "add" | "remove") => {
    const names = Array.from(selected[list])
    if (names.length === 0) return
    setBatchBusy(true)
    try {
      const res = await fetch(`${adminApiBase}/dictionary-feedback`, {
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
        <h2 className="text-lg font-bold text-gray-900 dark:text-white">Manage name dictionary</h2>
        <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
          Control the surnames used to detect Potentially French contacts. Add suggestions are surnames manually marked Potentially French but missing from the dictionary; remove suggestions are dictionary surnames found on contacts marked Not French. Applying a change affects future detection, while Dismiss only hides the suggestion.
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
              disabled={batchBusy}
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
                disabled={!!busy[c.name]}
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

function potentiallyFrenchAddressKey(contact: PotentiallyFrenchContact) {
  return [contact.address, contact.city, contact.zipcode]
    .map((value) => value.trim().toLowerCase())
    .join(" ")
    .replace(/\s+/g, " ")
    .trim()
}

function potentiallyFrenchDuplicateCount(contacts: PotentiallyFrenchContact[]) {
  const addressCounts = new Map<string, number>()
  const nameCounts = new Map<string, number>()
  for (const contact of contacts) {
    const addressKey = potentiallyFrenchAddressKey(contact)
    const nameKey = contact.fullName.trim().toLowerCase().replace(/\s+/g, " ")
    if (addressKey) addressCounts.set(addressKey, (addressCounts.get(addressKey) ?? 0) + 1)
    if (nameKey) nameCounts.set(nameKey, (nameCounts.get(nameKey) ?? 0) + 1)
  }
  return contacts.filter((contact) => {
    const addressKey = potentiallyFrenchAddressKey(contact)
    const nameKey = contact.fullName.trim().toLowerCase().replace(/\s+/g, " ")
    return (addressKey ? addressCounts.get(addressKey)! > 1 : false) || (nameKey ? nameCounts.get(nameKey)! > 1 : false)
  }).length
}

function withPotentiallyFrenchDuplicateCounts(contacts: PotentiallyFrenchContact[]) {
  const addressCounts = new Map<string, number>()
  const nameCounts = new Map<string, number>()
  for (const contact of contacts) {
    const addressKey = potentiallyFrenchAddressKey(contact)
    const nameKey = contact.fullName.trim().toLowerCase().replace(/\s+/g, " ")
    if (addressKey) addressCounts.set(addressKey, (addressCounts.get(addressKey) ?? 0) + 1)
    if (nameKey) nameCounts.set(nameKey, (nameCounts.get(nameKey) ?? 0) + 1)
  }
  return contacts.map((contact) => {
    const addressKey = potentiallyFrenchAddressKey(contact)
    const nameKey = contact.fullName.trim().toLowerCase().replace(/\s+/g, " ")
    return {
      ...contact,
      duplicateAddressCount: addressKey ? addressCounts.get(addressKey) ?? 1 : 1,
      duplicateNameCount: nameKey ? nameCounts.get(nameKey) ?? 1 : 1,
    }
  })
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
  const workspace = useWorkspaceRuntime()
  const adminApiBase = workspace ? `/api/c/${encodeURIComponent(workspace.slug)}/admin` : "/api/admin"
  const [contacts, setContacts] = useState<PotentiallyFrenchContact[]>([])
  const [totalCount, setTotalCount] = useState(0)
  const [duplicateCount, setDuplicateCount] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [search, setSearch] = useState("")
  const [duplicatesOnly, setDuplicatesOnly] = useState(false)
  const [busy, setBusy] = useState<Record<string, boolean>>({})
  const [duplicateReviewAddress, setDuplicateReviewAddress] = useState<string | null>(null)
  const [reviewAllDuplicates, setReviewAllDuplicates] = useState(false)
  const [duplicateKeepers, setDuplicateKeepers] = useState<Record<string, string>>({})
  const [removingDuplicates, setRemovingDuplicates] = useState(false)

  useEffect(() => {
    fetch(`${adminApiBase}/potentially-french`)
      .then((r) => r.json())
      .then((data) => {
        if (data?.error) {
          setError(data.error)
        } else {
          setContacts(withPotentiallyFrenchDuplicateCounts(data.contacts ?? []))
          setTotalCount(data.totalCount ?? 0)
          setDuplicateCount(data.duplicateCount ?? 0)
        }
        setLoading(false)
      })
      .catch(() => {
        setError("Network error — could not reach the server.")
        setLoading(false)
      })
  }, [adminApiBase])

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
      const res = await fetch(`${adminApiBase}/potentially-french`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ submissionId: c.submissionId, contactId: c.contactId }),
      })
      const data = await res.json()
      if (!res.ok) {
        alert(`Failed to mark "${c.fullName}" as Not French: ${data?.error ?? "Unknown error"}`)
        return
      }
      setContacts((prev) => withPotentiallyFrenchDuplicateCounts(prev.filter((x) => !(x.submissionId === c.submissionId && x.contactId === c.contactId))))
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
      const res = await fetch(`${adminApiBase}/potentially-french`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ submissionId: c.submissionId, contactId: c.contactId, action: "duplicate" }),
      })
      const data = await res.json()
      if (!res.ok) {
        alert(`Failed to mark "${c.fullName}" as Duplicate: ${data?.error ?? "Unknown error"}`)
        return
      }
      setContacts((prev) => withPotentiallyFrenchDuplicateCounts(prev.filter((x) => !(x.submissionId === c.submissionId && x.contactId === c.contactId))))
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

  const duplicateAddressGroups = Array.from(
    contacts.reduce((groups, contact) => {
      const addressKey = potentiallyFrenchAddressKey(contact)
      if (!addressKey) return groups
      const group = groups.get(addressKey) ?? []
      group.push(contact)
      groups.set(addressKey, group)
      return groups
    }, new Map<string, PotentiallyFrenchContact[]>()),
  )
    .filter(([, group]) => group.length > 1)
    .map(([addressKey, items]) => ({
      addressKey,
      items: [...items].sort((a, b) => new Date(a.submittedAt).getTime() - new Date(b.submittedAt).getTime()),
    }))

  const reviewedDuplicateGroups = reviewAllDuplicates
    ? duplicateAddressGroups
    : duplicateAddressGroups.filter((group) => group.addressKey === duplicateReviewAddress)

  const openDuplicateReview = useCallback((addressKey: string, reviewAll = false) => {
    const groupsToReview = reviewAll
      ? duplicateAddressGroups
      : duplicateAddressGroups.filter((group) => group.addressKey === addressKey)
    setDuplicateKeepers(Object.fromEntries(groupsToReview.map((group) => [
      group.addressKey,
      `${group.items[0].submissionId}:${group.items[0].contactId}`,
    ])))
    setDuplicateReviewAddress(addressKey)
    setReviewAllDuplicates(reviewAll)
  }, [duplicateAddressGroups])

  const closeDuplicateReview = useCallback(() => {
    if (removingDuplicates) return
    setDuplicateReviewAddress(null)
    setReviewAllDuplicates(false)
    setDuplicateKeepers({})
  }, [removingDuplicates])

  const removeReviewedDuplicates = useCallback(async () => {
    const contactsToRemove = reviewedDuplicateGroups.flatMap((group) =>
      group.items
        .filter((contact) => `${contact.submissionId}:${contact.contactId}` !== duplicateKeepers[group.addressKey])
        .map((contact) => ({ submissionId: contact.submissionId, contactId: contact.contactId })),
    )
    if (contactsToRemove.length === 0) return
    setRemovingDuplicates(true)
    try {
      const res = await fetch(`${adminApiBase}/potentially-french`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "removeDuplicates", contacts: contactsToRemove }),
      })
      const data = await res.json()
      if (!res.ok) {
        alert(`Failed to remove duplicate contacts: ${data?.error ?? "Unknown error"}`)
        return
      }
      const removed = new Set(contactsToRemove.map((contact) => `${contact.submissionId}:${contact.contactId}`))
      const updatedContacts = withPotentiallyFrenchDuplicateCounts(contacts.filter((contact) => !removed.has(`${contact.submissionId}:${contact.contactId}`)))
      setContacts(updatedContacts)
      setTotalCount(updatedContacts.length)
      setDuplicateCount(potentiallyFrenchDuplicateCount(updatedContacts))
      onSubmissionsChanged?.()
      setDuplicateReviewAddress(null)
      setReviewAllDuplicates(false)
      setDuplicateKeepers({})
    } catch {
      alert("Network error — could not reach the server.")
    } finally {
      setRemovingDuplicates(false)
    }
  }, [duplicateKeepers, onSubmissionsChanged, reviewedDuplicateGroups])

  return (
    <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-800 overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-3 px-6 py-4 border-b border-gray-100 dark:border-gray-800 bg-gray-50 dark:bg-gray-800/50">
        <div>
          <h2 className="text-lg font-bold text-gray-900 dark:text-white">Potential Frenchs</h2>
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
            onClick={() => openDuplicateReview("", true)}
            disabled={duplicateAddressGroups.length === 0}
            title="Review each duplicate-address group, then remove all but one contact from each"
            className="inline-flex items-center gap-1.5 h-9 px-3 rounded-lg bg-amber-500 hover:bg-amber-600 disabled:opacity-50 text-white text-sm font-semibold transition-colors whitespace-nowrap"
          >
            Auto-remove duplicates
          </button>
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
                            <button
                              onClick={() => openDuplicateReview(potentiallyFrenchAddressKey(c))}
                              title="View every Potentially French contact at this address and choose which one to keep"
                              className="text-xs font-semibold px-2 py-0.5 rounded-full bg-amber-100 hover:bg-amber-200 text-amber-700 dark:bg-amber-900/30 dark:hover:bg-amber-900/50 dark:text-amber-300 transition-colors"
                            >
                              {c.duplicateAddressCount}× address
                            </button>
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
      {duplicateReviewAddress !== null && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-gray-950/45 p-4" role="dialog" aria-modal="true" aria-labelledby="potentially-french-duplicate-review-title">
          <div className="w-full max-w-3xl max-h-[85vh] overflow-hidden rounded-2xl bg-white dark:bg-gray-900 shadow-2xl border border-gray-200 dark:border-gray-700 flex flex-col">
            <div className="px-6 py-4 border-b border-gray-100 dark:border-gray-800">
              <h3 id="potentially-french-duplicate-review-title" className="text-lg font-bold text-gray-900 dark:text-white">
                {reviewAllDuplicates ? "Review duplicate addresses" : "Duplicate address"}
              </h3>
              <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                Select the one Potentially French contact to keep for each address. The others will be marked Duplicate and removed from this list; no contact records are deleted.
              </p>
            </div>
            <div className="overflow-y-auto px-6 py-4 space-y-5">
              {reviewedDuplicateGroups.map((group) => (
                <section key={group.addressKey} className="rounded-xl border border-amber-200 dark:border-amber-900/60 overflow-hidden">
                  <div className="px-4 py-2 bg-amber-50 dark:bg-amber-900/20 text-sm font-semibold text-amber-800 dark:text-amber-200">
                    {[group.items[0].address, group.items[0].city, group.items[0].zipcode].filter(Boolean).join(", ")}
                    <span className="ml-2 text-xs font-normal">{group.items.length} contacts</span>
                  </div>
                  <div className="divide-y divide-gray-100 dark:divide-gray-800">
                    {group.items.map((contact) => {
                      const key = `${contact.submissionId}:${contact.contactId}`
                      return (
                        <label key={key} className="flex items-center gap-3 px-4 py-3 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800/50">
                          <input
                            type="radio"
                            name={`potentially-french-keeper-${group.addressKey}`}
                            checked={duplicateKeepers[group.addressKey] === key}
                            onChange={() => setDuplicateKeepers((previous) => ({ ...previous, [group.addressKey]: key }))}
                            className="accent-indigo-600"
                          />
                          <div className="min-w-0 flex-1">
                            <p className="font-medium text-sm text-gray-900 dark:text-white">{contact.fullName || "Unnamed contact"}</p>
                            <p className="text-xs text-gray-500 dark:text-gray-400">{contact.userId} · submitted {new Date(contact.submittedAt).toLocaleDateString()} · {contact.phone || "No phone"}</p>
                          </div>
                          <span className={duplicateKeepers[group.addressKey] === key ? "text-xs font-semibold text-green-600" : "text-xs text-amber-600 dark:text-amber-400"}>
                            {duplicateKeepers[group.addressKey] === key ? "Keep" : "Remove"}
                          </span>
                        </label>
                      )
                    })}
                  </div>
                </section>
              ))}
            </div>
            <div className="flex items-center justify-between gap-3 px-6 py-4 border-t border-gray-100 dark:border-gray-800">
              <p className="text-xs text-gray-500 dark:text-gray-400">
                {reviewedDuplicateGroups.reduce((count, group) => count + group.items.length - 1, 0)} contact{reviewedDuplicateGroups.reduce((count, group) => count + group.items.length - 1, 0) === 1 ? "" : "s"} will be removed from this list.
              </p>
              <div className="flex gap-2">
                <button onClick={closeDuplicateReview} disabled={removingDuplicates} className="h-9 px-3 text-sm rounded-lg border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 disabled:opacity-50">Cancel</button>
                <button onClick={removeReviewedDuplicates} disabled={removingDuplicates} className="h-9 px-3 text-sm rounded-lg bg-red-600 hover:bg-red-700 text-white font-semibold disabled:opacity-50">
                  {removingDuplicates ? "Removing…" : "Remove selected duplicates"}
                </button>
              </div>
            </div>
          </div>
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

function dictionaryScanAddressKey(match: DictionaryScanMatch) {
  return [match.address, match.city, match.zipcode]
    .map((value) => value.trim().toLowerCase())
    .join(" ")
    .replace(/\s+/g, " ")
    .trim()
}

function withDictionaryScanDuplicateCounts(matches: DictionaryScanMatch[]) {
  const addressCounts = new Map<string, number>()
  for (const match of matches) {
    const addressKey = dictionaryScanAddressKey(match)
    if (addressKey) addressCounts.set(addressKey, (addressCounts.get(addressKey) ?? 0) + 1)
  }
  return matches.map((match) => {
    const addressKey = dictionaryScanAddressKey(match)
    return { ...match, duplicateAddressCount: addressKey ? addressCounts.get(addressKey) ?? 1 : 1 }
  })
}

function DictionaryScanPanel({ onSubmissionsChanged }: { onSubmissionsChanged?: () => void }) {
  const workspace = useWorkspaceRuntime()
  const adminApiBase = workspace ? `/api/c/${encodeURIComponent(workspace.slug)}/admin` : "/api/admin"
  const adminPeopleBase = workspace ? `/c/${workspace.slug}/admin/people` : "/admin/user"
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
  const [duplicateReviewAddress, setDuplicateReviewAddress] = useState<string | null>(null)
  const [reviewAllDuplicates, setReviewAllDuplicates] = useState(false)
  const [duplicateKeepers, setDuplicateKeepers] = useState<Record<string, string>>({})
  const [removingDuplicates, setRemovingDuplicates] = useState(false)

  // Read-only — used for the panel's automatic initial load only. Never
  // touches review status, so opening the tab has no side effects.
  const load = useCallback(() => {
    setLoading(true)
    setError(null)
    fetch(`${adminApiBase}/name-dictionary-scan`)
      .then((r) => r.json())
      .then((data) => {
        if (data?.error) {
          setError(data.error)
        } else {
          setMatches(withDictionaryScanDuplicateCounts(data.matches ?? []))
          setTotalScanned(data.totalScanned ?? 0)
        }
        setLoading(false)
      })
      .catch(() => {
        setError("Network error — could not reach the server.")
        setLoading(false)
      })
  }, [adminApiBase])

  useEffect(() => { load() }, [load])

  // Explicit admin action — re-runs the scan AND marks every non-archived
  // submission it covers as "reviewed", since this scan is itself a review
  // pass over those submissions' name classifications.
  const rescanAndMarkReviewed = useCallback(() => {
    if (!window.confirm("Rescan and mark all active submissions as reviewed?")) return
    setLoading(true)
    setError(null)
    setReviewedNotice(null)
    fetch(`${adminApiBase}/name-dictionary-scan`, { method: "POST" })
      .then((r) => r.json())
      .then((data) => {
        if (data?.error) {
          setError(data.error)
        } else {
          setMatches(withDictionaryScanDuplicateCounts(data.matches ?? []))
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

  const duplicateGroups = Array.from(
    matches.reduce((groups, match) => {
      const addressKey = dictionaryScanAddressKey(match)
      if (!addressKey) return groups
      const group = groups.get(addressKey) ?? []
      group.push(match)
      groups.set(addressKey, group)
      return groups
    }, new Map<string, DictionaryScanMatch[]>()),
  )
    .filter(([, group]) => group.length > 1)
    .map(([addressKey, group]) => ({
      addressKey,
      items: [...group].sort((a, b) => new Date(a.submittedAt).getTime() - new Date(b.submittedAt).getTime()),
    }))

  const reviewedDuplicateGroups = reviewAllDuplicates
    ? duplicateGroups
    : duplicateGroups.filter((group) => group.addressKey === duplicateReviewAddress)

  const openDuplicateReview = useCallback((addressKey: string, reviewAll = false) => {
    const groupsToReview = reviewAll
      ? duplicateGroups
      : duplicateGroups.filter((group) => group.addressKey === addressKey)
    setDuplicateKeepers(Object.fromEntries(groupsToReview.map((group) => [
      group.addressKey,
      `${group.items[0].submissionId}:${group.items[0].contactId}`,
    ])))
    setDuplicateReviewAddress(addressKey)
    setReviewAllDuplicates(reviewAll)
  }, [duplicateGroups])

  const closeDuplicateReview = useCallback(() => {
    if (removingDuplicates) return
    setDuplicateReviewAddress(null)
    setReviewAllDuplicates(false)
    setDuplicateKeepers({})
  }, [removingDuplicates])

  const removeReviewedDuplicates = useCallback(async () => {
    const contacts = reviewedDuplicateGroups.flatMap((group) =>
      group.items
        .filter((match) => `${match.submissionId}:${match.contactId}` !== duplicateKeepers[group.addressKey])
        .map((match) => ({ submissionId: match.submissionId, contactId: match.contactId })),
    )
    if (contacts.length === 0) return
    setRemovingDuplicates(true)
    try {
      const res = await fetch(`${adminApiBase}/name-dictionary-scan`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "removeDuplicates", contacts }),
      })
      const data = await res.json()
      if (!res.ok) {
        alert(`Failed to remove duplicate contacts: ${data?.error ?? "Unknown error"}`)
        return
      }
      const removed = new Set(contacts.map((match) => `${match.submissionId}:${match.contactId}`))
      setMatches((previous) => withDictionaryScanDuplicateCounts(previous.filter((match) => !removed.has(`${match.submissionId}:${match.contactId}`))))
      onSubmissionsChanged?.()
      setReviewedNotice(`✓ Removed ${data.removedCount ?? contacts.length} duplicate contact${contacts.length === 1 ? "" : "s"}; one contact remains at each reviewed address.`)
      setDuplicateReviewAddress(null)
      setReviewAllDuplicates(false)
      setDuplicateKeepers({})
    } catch {
      alert("Network error — could not reach the server.")
    } finally {
      setRemovingDuplicates(false)
    }
  }, [duplicateKeepers, onSubmissionsChanged, reviewedDuplicateGroups])

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
      const res = await fetch(`${adminApiBase}/name-dictionary-scan`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ submissionId: m.submissionId, contactId: m.contactId }),
      })
      const data = await res.json()
      if (!res.ok) {
        alert(`Failed to mark "${m.fullName}" as Potentially French: ${data?.error ?? "Unknown error"}`)
        return
      }
      setMatches((prev) => withDictionaryScanDuplicateCounts(prev.filter((x) => !(x.submissionId === m.submissionId && x.contactId === m.contactId))))
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
      const res = await fetch(`${adminApiBase}/dictionary-feedback`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: m.matchedName, action: "remove" }),
      })
      const data = await res.json()
      if (!res.ok) {
        alert(`Failed to remove "${m.matchedName}" from the dictionary: ${data?.error ?? "Unknown error"}`)
        return
      }
      setMatches((prev) => withDictionaryScanDuplicateCounts(prev.filter((x) => x.matchedName !== m.matchedName)))
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
      const res = await fetch(`${adminApiBase}/name-dictionary-scan`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ submissionId: m.submissionId, contactId: m.contactId, action: "dismiss" }),
      })
      const data = await res.json()
      if (!res.ok) {
        alert(`Failed to remove "${m.fullName}" from the list: ${data?.error ?? "Unknown error"}`)
        return
      }
      setMatches((prev) => withDictionaryScanDuplicateCounts(prev.filter((x) => !(x.submissionId === m.submissionId && x.contactId === m.contactId))))
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
      const res = await fetch(`${adminApiBase}/name-dictionary-scan`, {
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
          <h2 className="text-lg font-bold text-gray-900 dark:text-white">Find missed French contacts</h2>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
            Scan non-archived submissions for contacts not marked Potentially French whose surname is already in the dictionary. Research each match, mark it Potentially French, remove an incorrect surname from the shared dictionary, or dismiss the suggestion without changing the contact. Scanned {totalScanned} contact{totalScanned !== 1 ? "s" : ""}.
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
            onClick={() => openDuplicateReview("", true)}
            disabled={loading || duplicateGroups.length === 0}
            title="Review all duplicate-address groups, then remove all but one contact from each"
            className="h-9 px-3 text-sm rounded-lg bg-amber-500 hover:bg-amber-600 text-white font-semibold disabled:opacity-50 transition-colors whitespace-nowrap"
          >
            Auto-remove duplicates
          </button>
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
                          href={`${adminPeopleBase}/${encodeURIComponent(g.userId)}?submissionId=${g.submissionId}`}
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
                          <button
                            onClick={() => openDuplicateReview(dictionaryScanAddressKey(m))}
                            title="View every Dictionary Scan contact at this address and choose which one to keep"
                            className="text-xs font-semibold px-2 py-0.5 rounded-full bg-amber-100 hover:bg-amber-200 text-amber-700 dark:bg-amber-900/30 dark:hover:bg-amber-900/50 dark:text-amber-300 transition-colors"
                          >
                            {m.duplicateAddressCount}× address
                          </button>
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
                              title="Dismiss from this list — doesn't change the contact's status or the dictionary"
                              aria-label="Dismiss match"
                              className="inline-flex items-center justify-center h-[26px] w-[26px] rounded-md bg-gray-50 hover:bg-gray-100 dark:bg-gray-800 dark:hover:bg-gray-700 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 border border-gray-200 dark:border-gray-700 transition-colors disabled:opacity-50"
                            >
                              <EyeOff className="h-3.5 w-3.5" aria-hidden="true" />
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

      {duplicateReviewAddress !== null && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-gray-950/45 p-4" role="dialog" aria-modal="true" aria-labelledby="duplicate-review-title">
          <div className="w-full max-w-3xl max-h-[85vh] overflow-hidden rounded-2xl bg-white dark:bg-gray-900 shadow-2xl border border-gray-200 dark:border-gray-700 flex flex-col">
            <div className="px-6 py-4 border-b border-gray-100 dark:border-gray-800">
              <h3 id="duplicate-review-title" className="text-lg font-bold text-gray-900 dark:text-white">
                {reviewAllDuplicates ? "Review duplicate addresses" : "Duplicate address"}
              </h3>
              <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                Select the one contact to keep for each address. All others will be marked Duplicate and removed from this scan; no contact records are deleted.
              </p>
            </div>
            <div className="overflow-y-auto px-6 py-4 space-y-5">
              {reviewedDuplicateGroups.map((group) => (
                <section key={group.addressKey} className="rounded-xl border border-amber-200 dark:border-amber-900/60 overflow-hidden">
                  <div className="px-4 py-2 bg-amber-50 dark:bg-amber-900/20 text-sm font-semibold text-amber-800 dark:text-amber-200">
                    {[group.items[0].address, group.items[0].city, group.items[0].zipcode].filter(Boolean).join(", ")}
                    <span className="ml-2 text-xs font-normal">{group.items.length} contacts</span>
                  </div>
                  <div className="divide-y divide-gray-100 dark:divide-gray-800">
                    {group.items.map((match) => {
                      const key = `${match.submissionId}:${match.contactId}`
                      return (
                        <label key={key} className="flex items-center gap-3 px-4 py-3 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800/50">
                          <input
                            type="radio"
                            name={`keeper-${group.addressKey}`}
                            checked={duplicateKeepers[group.addressKey] === key}
                            onChange={() => setDuplicateKeepers((previous) => ({ ...previous, [group.addressKey]: key }))}
                            className="accent-indigo-600"
                          />
                          <div className="min-w-0 flex-1">
                            <p className="font-medium text-sm text-gray-900 dark:text-white">{match.fullName || "Unnamed contact"}</p>
                            <p className="text-xs text-gray-500 dark:text-gray-400">{match.userId} · submitted {new Date(match.submittedAt).toLocaleDateString()} · {match.status}</p>
                          </div>
                          <span className={duplicateKeepers[group.addressKey] === key ? "text-xs font-semibold text-green-600" : "text-xs text-amber-600 dark:text-amber-400"}>
                            {duplicateKeepers[group.addressKey] === key ? "Keep" : "Remove"}
                          </span>
                        </label>
                      )
                    })}
                  </div>
                </section>
              ))}
            </div>
            <div className="flex items-center justify-between gap-3 px-6 py-4 border-t border-gray-100 dark:border-gray-800">
              <p className="text-xs text-gray-500 dark:text-gray-400">
                {reviewedDuplicateGroups.reduce((count, group) => count + group.items.length - 1, 0)} contact{reviewedDuplicateGroups.reduce((count, group) => count + group.items.length - 1, 0) === 1 ? "" : "s"} will be removed from this scan.
              </p>
              <div className="flex gap-2">
                <button onClick={closeDuplicateReview} disabled={removingDuplicates} className="h-9 px-3 text-sm rounded-lg border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 disabled:opacity-50">Cancel</button>
                <button onClick={removeReviewedDuplicates} disabled={removingDuplicates} className="h-9 px-3 text-sm rounded-lg bg-red-600 hover:bg-red-700 text-white font-semibold disabled:opacity-50">
                  {removingDuplicates ? "Removing…" : "Remove selected duplicates"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
