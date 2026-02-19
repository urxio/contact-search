import { cookies } from "next/headers"
import { redirect, notFound } from "next/navigation"
import Link from "next/link"
import { pool } from "@/lib/db"

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
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950 p-8">
      <div className="max-w-6xl mx-auto">

        {/* Back + header */}
        <div className="mb-6">
          <Link href="/admin" className="text-sm text-blue-600 hover:underline mb-4 inline-block">
            ← Back to dashboard
          </Link>
          <div className="flex items-start justify-between">
            <div>
              <h1 className="text-2xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
                {userId}
                {isLatest && (
                  <span className="text-xs bg-green-100 dark:bg-green-900/40 text-green-700 dark:text-green-300 rounded-full px-2 py-0.5 font-semibold">
                    latest
                  </span>
                )}
              </h1>
              <p className="text-sm text-gray-500 mt-1">
                Submission {allSubmissions.length - submissionIndex} of {allSubmissions.length} ·{" "}
                {new Date(submission.submitted_at).toLocaleString()}
                {submission.territory_zipcode && ` · Territory ZIP: ${submission.territory_zipcode}`}
                {submission.territory_page_range && ` · Pages: ${submission.territory_page_range}`}
              </p>
            </div>

            {/* Submission switcher — shown when user has multiple */}
            {allSubmissions.length > 1 && (
              <div className="flex flex-col items-end gap-1">
                <span className="text-xs text-gray-400 mb-1">Switch submission:</span>
                <div className="flex flex-wrap gap-1 justify-end max-w-xs">
                  {allSubmissions.map((s, i) => (
                    <Link
                      key={s.id}
                      href={`/admin/user/${encodeURIComponent(userId)}?submissionId=${s.id}`}
                      className={`text-xs rounded-lg px-2.5 py-1 font-medium transition-colors border ${
                        s.id === targetId
                          ? "bg-blue-600 text-white border-blue-600"
                          : "bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-400 border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700"
                      }`}
                    >
                      {i === 0 ? "Latest" : new Date(s.submitted_at).toLocaleDateString()}
                      {i === 0 && s.id !== targetId && " ↑"}
                    </Link>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Stat pills */}
        <div className="flex flex-wrap gap-3 mb-6">
          <span className="px-3 py-1 rounded-full bg-gray-200 dark:bg-gray-800 text-sm font-medium">
            {contacts.length} total
          </span>
          <span className="px-3 py-1 rounded-full bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300 text-sm font-medium">
            {potentiallyFrench.length} Potentially French
          </span>
          <span className="px-3 py-1 rounded-full bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300 text-sm font-medium">
            {notFrench.length} Not French
          </span>
          <span className="px-3 py-1 rounded-full bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300 text-sm font-medium">
            {duplicate.length} Duplicate
          </span>
          <span className="px-3 py-1 rounded-full bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300 text-sm font-medium">
            {notChecked.length} Not Checked
          </span>
        </div>

        {/* Global notes */}
        {submission.global_notes && (
          <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl p-4 mb-6">
            <h2 className="text-sm font-semibold text-gray-600 dark:text-gray-400 mb-1">Territory Notes</h2>
            <p className="text-sm text-gray-800 dark:text-gray-200 whitespace-pre-wrap">
              {submission.global_notes}
            </p>
          </div>
        )}

        {/* Download JSON */}
        <div className="flex justify-end mb-4">
          <a
            href={`/api/admin/submissions?userId=${encodeURIComponent(userId)}&submissionId=${targetId}&format=json`}
            download={`${userId}-submission-${targetId}.json`}
            className="inline-block bg-gray-800 hover:bg-gray-700 text-white text-xs font-semibold rounded-lg px-4 py-2 transition-colors"
          >
            ↓ Download JSON
          </a>
        </div>

        {/* Contact table */}
        <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-800 overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 dark:border-gray-800 bg-gray-50 dark:bg-gray-800/50">
                <th className="text-left px-4 py-3 font-semibold text-gray-600 dark:text-gray-400">Name</th>
                <th className="text-left px-4 py-3 font-semibold text-gray-600 dark:text-gray-400">Address</th>
                <th className="text-left px-4 py-3 font-semibold text-gray-600 dark:text-gray-400">City</th>
                <th className="text-left px-4 py-3 font-semibold text-gray-600 dark:text-gray-400">ZIP</th>
                <th className="text-left px-4 py-3 font-semibold text-gray-600 dark:text-gray-400">Phone</th>
                <th className="text-left px-4 py-3 font-semibold text-gray-600 dark:text-gray-400">Status</th>
                <th className="text-left px-4 py-3 font-semibold text-gray-600 dark:text-gray-400">Checked</th>
                <th className="text-left px-4 py-3 font-semibold text-gray-600 dark:text-gray-400">Notes</th>
              </tr>
            </thead>
            <tbody>
              {contacts.map((contact, i) => (
                <tr
                  key={contact.id ?? i}
                  className="border-b border-gray-100 dark:border-gray-800 last:border-0 hover:bg-gray-50 dark:hover:bg-gray-800/30 transition-colors"
                >
                  <td className="px-4 py-3 font-medium text-gray-900 dark:text-white">
                    {contact.fullName}
                    {contact.territoryStatus && (
                      <span className="ml-1 text-[10px] bg-red-100 text-red-700 rounded px-1">⚑ territory</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-gray-600 dark:text-gray-400">{contact.address}</td>
                  <td className="px-4 py-3 text-gray-600 dark:text-gray-400">{contact.city}</td>
                  <td className="px-4 py-3 text-gray-600 dark:text-gray-400">{contact.zipcode}</td>
                  <td className="px-4 py-3 text-gray-600 dark:text-gray-400">{contact.phone}</td>
                  <td className="px-4 py-3">
                    <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-semibold ${STATUS_COLORS[contact.status] ?? "bg-gray-100 text-gray-700"}`}>
                      {contact.status}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-xs text-gray-500">
                    <span className="flex gap-1">
                      {contact.checkedOnForebears && <span title="Forebears">🌐</span>}
                      {contact.checkedOnTPS       && <span title="TruePeopleSearch">👤</span>}
                      {contact.checkedOnOTM       && <span title="OTM">📋</span>}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-xs text-gray-500 max-w-[160px] truncate">
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
