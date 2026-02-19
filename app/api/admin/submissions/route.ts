import { NextRequest, NextResponse } from "next/server"
import { pool, ensureSchema } from "@/lib/db"
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
      const submissionId = searchParams.get("submissionId")

      // Fetch a specific submission by ID, or fall back to latest for this user
      const result = submissionId
        ? await pool.query(
            `SELECT * FROM submissions WHERE id = $1 AND user_id = $2`,
            [parseInt(submissionId), userId]
          )
        : await pool.query(
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
        const filename = submissionId
          ? `${userId}-submission-${submissionId}.json`
          : `${userId}-submission.json`
        return new NextResponse(json, {
          headers: {
            "Content-Type": "application/json",
            "Content-Disposition": `attachment; filename="${filename}"`,
          },
        })
      }

      return NextResponse.json(row)
    }

    // Ensure new columns exist (idempotent migration)
    await ensureSchema()

    // Fetch ALL submissions (all users, all submissions) — no deduplication
    const result = await pool.query(`
      SELECT
        id, user_id, submitted_at,
        contact_count, potentially_french, not_french, duplicate, not_checked,
        global_notes, territory_zipcode, territory_page_range,
        review_status, archived
      FROM submissions
      ORDER BY user_id ASC, submitted_at DESC
    `)

    return NextResponse.json(result.rows)
  } catch (err: any) {
    console.error("Admin fetch error:", err)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

// PATCH — update review_status or archived flag for a submission
export async function PATCH(req: NextRequest) {
  const cookieStore = cookies()
  const adminSession = cookieStore.get("admin_session")
  if (adminSession?.value !== process.env.ADMIN_PASSWORD) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  try {
    const body = await req.json()
    const { id, review_status, archived } = body

    if (!id) {
      return NextResponse.json({ error: "Missing submission id" }, { status: 400 })
    }

    const VALID_STATUSES = ["pending", "in_review", "reviewed"]
    if (review_status !== undefined) {
      if (!VALID_STATUSES.includes(review_status)) {
        return NextResponse.json({ error: "Invalid review_status" }, { status: 400 })
      }
      await pool.query(`UPDATE submissions SET review_status = $1 WHERE id = $2`, [review_status, id])
    }

    if (archived !== undefined) {
      await pool.query(`UPDATE submissions SET archived = $1 WHERE id = $2`, [!!archived, id])
    }

    return NextResponse.json({ success: true })
  } catch (err: any) {
    console.error("Admin PATCH error:", err)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

// DELETE — permanently remove a submission
export async function DELETE(req: NextRequest) {
  const cookieStore = cookies()
  const adminSession = cookieStore.get("admin_session")
  if (adminSession?.value !== process.env.ADMIN_PASSWORD) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  try {
    const { searchParams } = new URL(req.url)
    const id = searchParams.get("id")
    if (!id) {
      return NextResponse.json({ error: "Missing id" }, { status: 400 })
    }
    await pool.query(`DELETE FROM submissions WHERE id = $1`, [parseInt(id)])
    return NextResponse.json({ success: true })
  } catch (err: any) {
    console.error("Admin DELETE error:", err)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
