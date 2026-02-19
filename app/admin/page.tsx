import { cookies } from "next/headers"
import { redirect } from "next/navigation"
import Link from "next/link"
import { pool, ensureSchema } from "@/lib/db"

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
}

interface UserGroup {
  userId: string
  submissions: Submission[]
}

async function getAllSubmissions(): Promise<Submission[]> {
  await ensureSchema()
  const result = await pool.query(`
    SELECT
      id, user_id, submitted_at,
      contact_count, potentially_french, not_french, duplicate, not_checked,
      global_notes, territory_zipcode, territory_page_range
    FROM submissions
    ORDER BY user_id ASC, submitted_at DESC
  `)
  return result.rows
}

export default async function AdminDashboard() {
  const cookieStore = cookies()
  const session = cookieStore.get("admin_session")
  if (session?.value !== process.env.ADMIN_PASSWORD) {
    redirect("/admin/login")
  }

  const submissions = await getAllSubmissions()

  // Group by user_id
  const grouped = submissions.reduce<Record<string, Submission[]>>((acc, sub) => {
    if (!acc[sub.user_id]) acc[sub.user_id] = []
    acc[sub.user_id].push(sub)
    return acc
  }, {})
  const userGroups: UserGroup[] = Object.entries(grouped).map(([userId, subs]) => ({
    userId,
    submissions: subs, // already sorted DESC by query
  }))

  const totalSubmissions = submissions.length
  const totalUsers = userGroups.length

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950 p-8">
      <div className="max-w-6xl mx-auto">

        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-3xl font-bold text-gray-900 dark:text-white">Admin Dashboard</h1>
            <p className="text-gray-500 dark:text-gray-400 mt-1">
              {totalUsers} user{totalUsers !== 1 ? "s" : ""} · {totalSubmissions} submission{totalSubmissions !== 1 ? "s" : ""} total
            </p>
          </div>
          <form action="/api/admin/logout" method="POST">
            <button type="submit" className="text-sm text-gray-500 hover:text-red-500 transition-colors">
              Sign out
            </button>
          </form>
        </div>

        {/* Summary cards — across all submissions */}
        {submissions.length > 0 && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
            <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-4">
              <div className="text-2xl font-bold text-gray-900 dark:text-white">
                {submissions.reduce((s, r) => s + r.contact_count, 0)}
              </div>
              <div className="text-xs text-gray-500 mt-1">Total Contacts</div>
            </div>
            <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-4">
              <div className="text-2xl font-bold text-green-600">
                {submissions.reduce((s, r) => s + r.potentially_french, 0)}
              </div>
              <div className="text-xs text-gray-500 mt-1">Potentially French</div>
            </div>
            <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-4">
              <div className="text-2xl font-bold text-red-500">
                {submissions.reduce((s, r) => s + r.not_french, 0)}
              </div>
              <div className="text-xs text-gray-500 mt-1">Not French</div>
            </div>
            <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-4">
              <div className="text-2xl font-bold text-blue-500">
                {submissions.reduce((s, r) => s + r.not_checked, 0)}
              </div>
              <div className="text-xs text-gray-500 mt-1">Not Checked</div>
            </div>
          </div>
        )}

        {/* Submissions table — grouped by user */}
        {userGroups.length === 0 ? (
          <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-800 p-12 text-center">
            <p className="text-gray-400 text-lg">No submissions yet.</p>
            <p className="text-gray-400 text-sm mt-1">
              Users submit their work via the "Send for Review" button on the main app.
            </p>
          </div>
        ) : (
          <div className="flex flex-col gap-4">
            {userGroups.map(({ userId, submissions: userSubs }) => {
              const latest = userSubs[0]
              const totalContacts = userSubs.reduce((s, r) => s + r.contact_count, 0)
              const totalFrench   = userSubs.reduce((s, r) => s + r.potentially_french, 0)

              return (
                <div
                  key={userId}
                  className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-800 overflow-hidden"
                >
                  {/* User header row */}
                  <div className="flex items-center justify-between px-6 py-4 bg-gray-50 dark:bg-gray-800/50 border-b border-gray-100 dark:border-gray-800">
                    <div className="flex items-center gap-3">
                      <span className="text-base font-bold text-gray-900 dark:text-white">{userId}</span>
                      <span className="text-xs bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300 rounded-full px-2 py-0.5 font-medium">
                        {userSubs.length} submission{userSubs.length !== 1 ? "s" : ""}
                      </span>
                    </div>
                    <div className="flex items-center gap-4 text-xs text-gray-500">
                      <span>{totalContacts} contacts total</span>
                      <span className="text-green-600 font-medium">{totalFrench} Pot. French</span>
                      <span className="text-gray-400">Last: {new Date(latest.submitted_at).toLocaleString()}</span>
                    </div>
                  </div>

                  {/* Each submission as a row */}
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-gray-100 dark:border-gray-800">
                        <th className="text-left px-6 py-2 text-xs font-semibold text-gray-400 uppercase tracking-wide">Submitted</th>
                        <th className="text-left px-6 py-2 text-xs font-semibold text-gray-400 uppercase tracking-wide">Territory</th>
                        <th className="text-right px-6 py-2 text-xs font-semibold text-gray-400 uppercase tracking-wide">Total</th>
                        <th className="text-right px-6 py-2 text-xs font-semibold text-green-600 uppercase tracking-wide">Pot. French</th>
                        <th className="text-right px-6 py-2 text-xs font-semibold text-red-500 uppercase tracking-wide">Not French</th>
                        <th className="text-right px-6 py-2 text-xs font-semibold text-amber-500 uppercase tracking-wide">Duplicate</th>
                        <th className="text-right px-6 py-2 text-xs font-semibold text-blue-500 uppercase tracking-wide">Not Checked</th>
                        <th className="px-6 py-2"></th>
                      </tr>
                    </thead>
                    <tbody>
                      {userSubs.map((sub, idx) => {
                        const checkedPct =
                          sub.contact_count > 0
                            ? Math.round(((sub.potentially_french + sub.not_french + sub.duplicate) / sub.contact_count) * 100)
                            : 0

                        return (
                          <tr
                            key={sub.id}
                            className="border-b border-gray-100 dark:border-gray-800 last:border-0 hover:bg-gray-50 dark:hover:bg-gray-800/30 transition-colors"
                          >
                            <td className="px-6 py-3 text-gray-500">
                              <span className="flex items-center gap-2">
                                {new Date(sub.submitted_at).toLocaleString()}
                                {idx === 0 && (
                                  <span className="text-[10px] bg-green-100 dark:bg-green-900/40 text-green-700 dark:text-green-300 rounded-full px-1.5 py-0.5 font-semibold">
                                    latest
                                  </span>
                                )}
                              </span>
                            </td>
                            <td className="px-6 py-3 text-gray-500 text-xs">
                              {sub.territory_zipcode
                                ? `ZIP: ${sub.territory_zipcode}${sub.territory_page_range ? ` · Pages: ${sub.territory_page_range}` : ""}`
                                : "—"}
                            </td>
                            <td className="px-6 py-3 text-right font-medium">{sub.contact_count}</td>
                            <td className="px-6 py-3 text-right text-green-600 font-medium">{sub.potentially_french}</td>
                            <td className="px-6 py-3 text-right text-red-500 font-medium">{sub.not_french}</td>
                            <td className="px-6 py-3 text-right text-amber-500 font-medium">{sub.duplicate}</td>
                            <td className="px-6 py-3 text-right text-blue-500 font-medium">{sub.not_checked}</td>
                            <td className="px-6 py-3 text-right">
                              <span className="inline-flex items-center gap-2">
                                <span className="text-xs text-gray-400">{checkedPct}%</span>
                                <Link
                                  href={`/admin/user/${encodeURIComponent(userId)}?submissionId=${sub.id}`}
                                  className="inline-block bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold rounded-lg px-3 py-1 transition-colors"
                                >
                                  View →
                                </Link>
                              </span>
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
