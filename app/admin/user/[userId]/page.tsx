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

const STATUS_COLORS: Record<string, string> = {
  "Potentially French": "bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300",
  "Not French":         "bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300",
  "Duplicate":          "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300",
  "Not checked":        "bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300",
  "Detected":           "bg-purple-100 text-purple-800 dark:bg-purple-900/40 dark:text-purple-300",
}

export default async function UserDetailPage({
  params,
}: {
  params: { userId: string }
}) {
  const cookieStore = cookies()
  const session = cookieStore.get("admin_session")
  if (session?.value !== process.env.ADMIN_PASSWORD) {
    redirect("/admin/login")
  }

  const userId = decodeURIComponent(params.userId)

  const result = await pool.query(
    `SELECT * FROM submissions WHERE user_id = $1 ORDER BY submitted_at DESC LIMIT 1`,
    [userId]
  )

  if (result.rows.length === 0) notFound()

  const submission = result.rows[0]
  const contacts: Contact[] = submission.contacts

  const potentiallyFrench = contacts.filter((c) => c.status === "Potentially French")
  const notFrench         = contacts.filter((c) => c.status === "Not French")
  const duplicate         = contacts.filter((c) => c.status === "Duplicate")
  const notChecked        = contacts.filter((c) => c.status === "Not checked")

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950 p-8">
      <div className="max-w-6xl mx-auto">

        {/* Back + header */}
        <div className="mb-6">
          <Link
            href="/admin"
            className="text-sm text-blue-600 hover:underline mb-4 inline-block"
          >
            ← Back to dashboard
          </Link>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
            {userId}
          </h1>
          <p className="text-sm text-gray-500 mt-1">
            Submitted {new Date(submission.submitted_at).toLocaleString()}
            {submission.territory_zipcode && ` · Territory ZIP: ${submission.territory_zipcode}`}
            {submission.territory_page_range && ` · Pages: ${submission.territory_page_range}`}
          </p>
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
            href={`/api/admin/submissions?userId=${encodeURIComponent(userId)}&format=json`}
            download={`${userId}-submission.json`}
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
                    <span
                      className={`inline-block rounded-full px-2 py-0.5 text-xs font-semibold ${STATUS_COLORS[contact.status] ?? "bg-gray-100 text-gray-700"}`}
                    >
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
