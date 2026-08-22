import Link from "next/link"
import { notFound, redirect } from "next/navigation"
import { ArrowLeft, Download, UserRound } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { AdminContactReview, type AdminReviewContact } from "@/components/admin/admin-contact-review"
import { AuthError, requireCongregationAdmin } from "@/lib/auth"
import { pool } from "@/lib/db"

export default async function CongregationPersonPage({
  params,
  searchParams,
}: {
  params: { slug: string; userId: string }
  searchParams: { submissionId?: string }
}) {
  let access
  try {
    access = await requireCongregationAdmin(params.slug)
  } catch (error) {
    if (error instanceof AuthError && error.status === 401) {
      redirect(`/auth/sign-in?next=/c/${encodeURIComponent(params.slug)}/admin`)
    }
    notFound()
  }

  const displayName = decodeURIComponent(params.userId)
  const submissions = await pool.query(
    `SELECT id, submitted_at, contact_count, territory_zipcode, territory_page_range,
            global_notes, contacts
     FROM submissions
     WHERE congregation_id = $1 AND user_id = $2
     ORDER BY submitted_at DESC`,
    [access.congregation.id, displayName],
  )
  if (!submissions.rows.length) notFound()

  const requestedId = Number(searchParams.submissionId)
  const submission = Number.isInteger(requestedId) && requestedId > 0
    ? submissions.rows.find((row) => Number(row.id) === requestedId)
    : submissions.rows[0]
  if (!submission) notFound()
  const contacts: AdminReviewContact[] = Array.isArray(submission.contacts) ? submission.contacts : []
  const base = `/c/${params.slug}/admin/people/${encodeURIComponent(displayName)}`

  return (
    <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <Button asChild variant="outline" className="min-h-11 rounded-xl">
          <Link href={`/c/${params.slug}/admin`}><ArrowLeft aria-hidden="true" />Review queue</Link>
        </Button>
        <Button asChild variant="outline" className="min-h-11 rounded-xl">
          <a href={`/api/c/${params.slug}/admin/submissions?userName=${encodeURIComponent(displayName)}&submissionId=${submission.id}&format=json`} download>
            <Download aria-hidden="true" />Download JSON
          </a>
        </Button>
      </div>

      <div className="mb-6 flex items-center gap-3">
        <span className="admin-icon-well flex h-11 w-11 items-center justify-center rounded-2xl text-primary"><UserRound aria-hidden="true" /></span>
        <div className="min-w-0">
          <h1 className="truncate text-2xl font-bold tracking-tight">{displayName}</h1>
          <p className="text-sm text-muted-foreground">{new Date(submission.submitted_at).toLocaleString()}</p>
        </div>
      </div>

      {submissions.rows.length > 1 ? (
        <div className="mb-6 flex gap-2 overflow-x-auto pb-2" aria-label="Submission history">
          {submissions.rows.map((row, index) => (
            <Button key={row.id} asChild size="sm" variant={row.id === submission.id ? "default" : "outline"} className="shrink-0 rounded-full">
              <Link href={`${base}?submissionId=${row.id}`}>{index === 0 ? "Latest" : new Date(row.submitted_at).toLocaleDateString()}</Link>
            </Button>
          ))}
        </div>
      ) : null}

      <AdminContactReview
        submissionId={Number(submission.id)}
        initialContacts={contacts}
        apiUrl={`/api/c/${params.slug}/admin/submissions`}
      >
        {submission.global_notes ? (
          <Card className="admin-card mb-6 rounded-2xl"><CardHeader><CardTitle className="text-base">Territory notes</CardTitle></CardHeader><CardContent><p className="whitespace-pre-wrap text-sm text-muted-foreground">{submission.global_notes}</p></CardContent></Card>
        ) : null}
      </AdminContactReview>
    </div>
  )
}
