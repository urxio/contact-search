import { NextRequest, NextResponse } from "next/server"
import { pool, ensureSchema } from "@/lib/db"
import { cookies } from "next/headers"
import {
  isAdminCheckedSource,
  isAdminContactStatus,
  parseAdminContactEdits,
  updateSubmissionContact,
} from "@/lib/submission-contacts"
import { parseSubmissionImport, submissionCounts } from "@/lib/submission-import"

export async function POST(req: NextRequest) {
  const adminSession = cookies().get("admin_session")
  if (adminSession?.value !== process.env.ADMIN_PASSWORD) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }
  try {
    const imported = parseSubmissionImport(await req.json())
    if (!imported) {
      return NextResponse.json({ error: "Upload a valid submission JSON file with at most 100 submissions." }, { status: 400 })
    }
    await ensureSchema()
    const client = await pool.connect()
    const ids: number[] = []
    try {
      await client.query("BEGIN")
      for (const submission of imported) {
        const counts = submissionCounts(submission.contacts)
        const result = await client.query(
          `INSERT INTO submissions
            (user_id, submitted_at, contact_count, potentially_french, not_french,
             duplicate, not_checked, global_notes, territory_zipcode, territory_page_range,
             contacts, review_status, archived)
           VALUES ($1,COALESCE($2::timestamptz,NOW()),$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
           RETURNING id`,
          [submission.userId, submission.submittedAt, counts.contactCount, counts.potentiallyFrench,
            counts.notFrench, counts.duplicate, counts.notChecked, submission.globalNotes,
            submission.territoryZipcode, submission.territoryPageRange, JSON.stringify(submission.contacts),
            submission.reviewStatus, submission.archived],
        )
        ids.push(Number(result.rows[0].id))
      }
      await client.query("COMMIT")
    } catch (error) {
      await client.query("ROLLBACK")
      throw error
    } finally {
      client.release()
    }
    return NextResponse.json({ success: true, imported: ids.length, ids }, { status: 201 })
  } catch (err) {
    console.error("Submission import error:", err)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

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

    // Fetch ALL submissions — include most-used zipcode derived from contacts JSONB
    const result = await pool.query(`
      SELECT
        id, user_id, submitted_at,
        contact_count, potentially_french, not_french, duplicate, not_checked,
        global_notes, territory_zipcode, territory_page_range,
        review_status, archived,
        (
          SELECT c->>'zipcode'
          FROM jsonb_array_elements(contacts) AS c
          WHERE c->>'zipcode' IS NOT NULL AND c->>'zipcode' != ''
          GROUP BY c->>'zipcode'
          ORDER BY COUNT(*) DESC
          LIMIT 1
        ) AS top_zipcode
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

    const submissionId = Number(id)
    const contactId = String(body.contactId ?? "").trim()
    if (!contactId && (body.status !== undefined || body.checkedSource !== undefined || body.fields !== undefined)) {
      return NextResponse.json({ error: "Missing contact id" }, { status: 400 })
    }
    if (contactId) {
      const hasStatus = body.status !== undefined
      const hasCheckedSource = body.checkedSource !== undefined
      const hasFields = body.fields !== undefined
      if (!Number.isSafeInteger(submissionId) || submissionId < 1) {
        return NextResponse.json({ error: "Invalid submission id" }, { status: 400 })
      }
      if ([hasStatus, hasCheckedSource, hasFields].filter(Boolean).length !== 1) {
        return NextResponse.json({ error: "Choose one contact update at a time" }, { status: 400 })
      }
      if (hasStatus && !isAdminContactStatus(body.status)) {
        return NextResponse.json({ error: "Invalid contact status" }, { status: 400 })
      }
      if (hasCheckedSource && !isAdminCheckedSource(body.checkedSource)) {
        return NextResponse.json({ error: "Invalid checked source" }, { status: 400 })
      }
      const fields = hasFields ? parseAdminContactEdits(body.fields) : null
      if (hasFields && !fields) {
        return NextResponse.json({ error: "Invalid contact fields" }, { status: 400 })
      }
      const client = await pool.connect()
      try {
        await client.query("BEGIN")
        const updated = await updateSubmissionContact(client, {
          submissionId,
          contactId,
          ...(hasStatus ? { status: body.status } : hasCheckedSource ? { checkedSource: body.checkedSource } : { fields: fields! }),
        })
        if (!updated) {
          await client.query("ROLLBACK")
          return NextResponse.json({ error: "Contact not found" }, { status: 404 })
        }
        await client.query("COMMIT")
        return NextResponse.json({ success: true, ...updated })
      } catch (error) {
        await client.query("ROLLBACK")
        throw error
      } finally {
        client.release()
      }
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
