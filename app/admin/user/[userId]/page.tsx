import { cookies } from "next/headers"
import { redirect, notFound } from "next/navigation"
import Link from "next/link"
import { pool } from "@/lib/db"
import { ArrowLeft, Download, UserRound } from "lucide-react"
import { ThemeSwitcher } from "@/components/theme-switcher"
import { AdminContactReview, type AdminReviewContact } from "@/components/admin/admin-contact-review"

interface SubmissionSummary {
  id: number
  submitted_at: string
  contact_count: number
  territory_zipcode: string
  territory_page_range: string
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
  const contacts: AdminReviewContact[] = Array.isArray(submission.contacts) ? submission.contacts : []
  const isLatest = targetId === allSubmissions[0].id
  const submissionIndex = allSubmissions.findIndex((s) => s.id === targetId)

  return (
    <div className="admin-shell min-h-screen">
      <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6 lg:px-8">

        {/* Back + header */}
        <div className="mb-6">
          <div className="mb-6 flex items-center justify-between gap-4">
            <Link href="/admin" className="admin-material inline-flex h-10 items-center gap-2 rounded-full px-4 text-sm font-medium text-muted-foreground transition-all duration-150 ease-out hover:-translate-y-px hover:text-foreground">
              <ArrowLeft className="h-4 w-4" aria-hidden="true" />
              Review queue
            </Link>
            <ThemeSwitcher className="admin-material" />
          </div>
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
                          ? "admin-primary-button border-transparent text-white"
                          : "admin-material text-muted-foreground hover:text-foreground"
                      }`}
                    >
                      {i === 0 ? "Latest" : new Date(s.submitted_at).toLocaleString([], {
                        month: "numeric", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit",
                      })}
                    </Link>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>

        <AdminContactReview key={targetId} submissionId={Number(targetId)} initialContacts={contacts} initialReviewStatus={submission.review_status || "pending"} apiUrl="/api/admin/submissions">
          {submission.global_notes && (
            <div className="admin-material mb-6 rounded-2xl p-5">
              <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Territory notes</h2>
              <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed">{submission.global_notes}</p>
            </div>
          )}
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
        </AdminContactReview>
      </div>
    </div>
  )
}
