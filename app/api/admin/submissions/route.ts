import { NextRequest, NextResponse } from "next/server"
import { pool } from "@/lib/db"
import { cookies } from "next/headers"

export async function GET(req: NextRequest) {
  // Verify admin session cookie
  const cookieStore = cookies()
  const adminSession = cookieStore.get("admin_session")

  if (adminSession?.value !== process.env.ADMIN_PASSWORD) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  try {
    const { searchParams } = new URL(req.url)
    const userId = searchParams.get("userId")

    if (userId) {
      // Fetch full contact data for a specific user (most recent submission)
      const result = await pool.query(
        `SELECT * FROM submissions WHERE user_id = $1 ORDER BY submitted_at DESC LIMIT 1`,
        [userId]
      )
      if (result.rows.length === 0) {
        return NextResponse.json({ error: "No submission found" }, { status: 404 })
      }
      const row = result.rows[0]

      // Support ?format=json for file download
      const format = searchParams.get("format")
      if (format === "json") {
        const json = JSON.stringify(row, null, 2)
        return new NextResponse(json, {
          headers: {
            "Content-Type": "application/json",
            "Content-Disposition": `attachment; filename="${userId}-submission.json"`,
          },
        })
      }

      return NextResponse.json(row)
    }

    // Fetch summary of all submissions (latest per user)
    const result = await pool.query(`
      SELECT DISTINCT ON (user_id)
        id, user_id, submitted_at,
        contact_count, potentially_french, not_french, duplicate, not_checked,
        global_notes, territory_zipcode, territory_page_range
      FROM submissions
      ORDER BY user_id, submitted_at DESC
    `)

    return NextResponse.json(result.rows)
  } catch (err: any) {
    console.error("Admin fetch error:", err)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
