import { cookies } from "next/headers"
import { redirect, notFound } from "next/navigation"
import Link from "next/link"
import { pool } from "@/lib/db"
import { ArrowLeft, Download, UserRound } from "lucide-react"

interface Contact {
  id: string
  fullName: string
  address: string
  city: string
  zipcode: string
  phone: string
  status: string
  notes: string
  checkedOnTPS: boolean
  checkedOnOTM: boolean
  checkedOnForebears: boolean
  needAddressUpdate: boolean
  needPhoneUpdate: boolean
  territoryStatus: boolean
}

interface SubmissionSummary {
  id: number
  submitted_at: string
  contact_count: number
  territory_zipcode: string
  territory_page_range: string
}

const STATUS_COLORS: Record<string, string> = {
  "Potentially French": "bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300",
  "Not French":         "bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300",
  "Duplicate":          "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300",
  "Not checked":        "bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300",
  "Detected":           "bg-purple-100 text-purple-800 dark:bg-purple-900/40 dark:text-purple-300",
}

export default async function UserDetailPage({
  params,
  searchParams,
}: {
  params: { userId: string }
  searchParams: { submissionId?: string }
}) {
  const cookieStore = cookies()
  const session = cookieStore.get("admin_session")
  if (session?.value !== process.env.ADMIN_PASSWORD) {
    redirect("/admin/login")
  }

  const userId = decodeURIComponent(params.userId)
  const submissionId = searchParams.submissionId ? parseInt(searchParams.submissionId) : null

  // Fetch all submissions for this user (for the switcher)
  const allResult = await pool.query(
    `SELECT id, submitted_at, contact_count, territory_zipcode, territory_page_range
     FROM submissions WHERE user_id = $1 ORDER BY submitted_at DESC`,
    [userId]
  )
  if (allResult.rows.length === 0) notFound()
  const allSubmissions: SubmissionSummary[] = allResult.rows

  // Fetch the specific submission (by ID if provided, otherwise latest)
  const targetId = submissionId ?? allSubmissions[0].id
  const result = await pool.query(
    `SELECT * FROM submissions WHERE id = $1 AND user_id = $2`,
    [targetId, userId]
  )
  if (result.rows.length === 0) notFound()

  const submission = result.rows[0]
  const contacts: Contact[] = submission.contacts
  const isLatest = targetId === allSubmissions[0].id
  const submissionIndex = allSubmissions.findIndex((s) => s.id === targetId)

  const potentiallyFrench = contacts.filter((c) => c.status === "Potentially French")
  const notFrench         = contacts.filter((c) => c.status === "Not French")
  const duplicate         = contacts.filter((c) => c.status === "Duplicate")
  const notChecked        = contacts.filter((c) => c.status === "Not checked")

  return (
    <div className="admin-shell min-h-screen">
      <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6 lg:px-8">

        {/* Back + header */}
        <div className="mb-6">
          <Link href="/admin" className="admin-material mb-6 inline-flex h-10 items-center gap-2 rounded-full px-4 text-sm font-medium text-muted-foreground transition-all duration-150 ease-out hover:-translate-y-px hover:text-foreground">
            <ArrowLeft className="h-4 w-4" aria-hidden="true" />
            Review queue
          </Link>
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div className="flex items-center gap-3">
              <div className="admin-icon-well flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl text-primary">
                <UserRound className="h-5 w-5" aria-hidden="true" />
              </div>
              <div>
                <h1 className="flex items-center gap-2 text-2xl font-bold leading-tight tracking-tight">
                  {userId}
                  {isLatest && (
                    <span className="rounded-full bg-primary/10 px-2 py-0.5 text-xs font-semibold text-primary">
                      Latest
                    </span>
                  )}
                </h1>
                <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
                  Submission {allSubmissions.length - submissionIndex} of {allSubmissions.length} ·{" "}
                  {new Date(submission.submitted_at).toLocaleString()}
                  {submission.territory_zipcode && ` · ZIP ${submission.territory_zipcode}`}
                  {submission.territory_page_range && ` · pages ${submission.territory_page_range}`}
                </p>
              </div>
            </div>

            {/* Submission switcher — shown when user has multiple */}
            {allSubmissions.length > 1 && (
              <div className="max-w-full sm:max-w-sm">
                <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Submission history</p>
                <div className="flex gap-2 overflow-x-auto pb-2">
                  {allSubmissions.map((s, i) => (
                    <Link
                      key={s.id}
                      href={`/admin/user/${encodeURIComponent(userId)}?submissionId=${s.id}`}
                      className={`shrink-0 rounded-full border px-3 py-1.5 text-xs font-semibold transition-all duration-150 ease-out ${
                        s.id === targetId
                          ? "admin-primary-button border-transparent text-primary-foreground"
                          : "border-white/70 bg-background/75 text-muted-foreground shadow-sm backdrop-blur hover:text-foreground dark:border-white/10"
                      }`}
                    >
                      {i === 0 ? "Latest" : new Date(s.submitted_at).toLocaleDateString()}
                    </Link>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Compact submission summary */}
        <div className="admin-material mb-6 grid grid-cols-2 divide-x divide-y overflow-hidden rounded-2xl sm:grid-cols-5 sm:divide-y-0">
          <DetailMetric label="Total" value={contacts.length} />
          <DetailMetric label="Potential" value={potentiallyFrench.length} />
          <DetailMetric label="Not French" value={notFrench.length} />
          <DetailMetric label="Duplicates" value={duplicate.length} />
          <DetailMetric label="Unchecked" value={notChecked.length} />
        </div>

        {/* Global notes */}
        {submission.global_notes && (
          <div className="admin-material mb-6 rounded-2xl p-5">
            <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Territory notes</h2>
            <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed">
              {submission.global_notes}
            </p>
          </div>
        )}

        {/* Download JSON */}
        <div className="mb-4 flex justify-end">
          <a
            href={`/api/admin/submissions?userId=${encodeURIComponent(userId)}&submissionId=${targetId}&format=json`}
            download={`${userId}-submission-${targetId}.json`}
            className="admin-material inline-flex h-10 items-center gap-2 rounded-full px-4 text-sm font-medium transition-all duration-150 ease-out hover:-translate-y-px focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <Download className="h-4 w-4" aria-hidden="true" />
            Download JSON
          </a>
        </div>

        {/* Contact table */}
        <div className="admin-card overflow-x-auto rounded-2xl">
          <table className="w-full min-w-[840px] text-sm">
            <thead>
              <tr className="border-b border-white/60 bg-white/25 dark:border-white/10 dark:bg-white/[0.03]">
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">Name</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">Location</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">Phone</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">Status</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">Sources checked</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">Notes</th>
              </tr>
            </thead>
            <tbody>
              {contacts.map((contact, i) => (
                <tr
                  key={contact.id ?? i}
                  className="border-b transition-colors duration-150 ease-out last:border-0 hover:bg-primary/[0.035]"
                >
                  <td className="px-4 py-3 font-medium">
                    {contact.fullName}
                    {contact.territoryStatus && (
                      <span className="ml-2 rounded bg-destructive/10 px-1.5 py-0.5 text-xs font-semibold text-destructive">Territory</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">
                    <p>{contact.address || "—"}</p>
                    <p className="text-xs">{[contact.city, contact.zipcode].filter(Boolean).join(", ")}</p>
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">{contact.phone || "—"}</td>
                  <td className="px-4 py-3">
                    <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-semibold ${STATUS_COLORS[contact.status] ?? "bg-gray-100 text-gray-700"}`}>
                      {contact.status}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-xs text-muted-foreground">
                    {[contact.checkedOnForebears && "Forebears", contact.checkedOnTPS && "TPS", contact.checkedOnOTM && "OTM"].filter(Boolean).join(" · ") || "—"}
                  </td>
                  <td className="max-w-[200px] truncate px-4 py-3 text-xs text-muted-foreground" title={contact.notes || undefined}>
                    {contact.notes}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}

function DetailMetric({ label, value }: { label: string; value: number }) {
  return (
    <div className="px-4 py-4">
      <p className="text-base font-semibold tabular-nums">{value}</p>
      <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{label}</p>
    </div>
  )
}
