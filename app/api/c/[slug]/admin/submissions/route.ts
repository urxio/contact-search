import { NextRequest, NextResponse } from "next/server"
import { pool } from "@/lib/db"
import { auditEvent, requireCongregationAdmin, validateMutationOrigin } from "@/lib/auth"
import { apiError, assertMultiTenantEnabled, integer, RouteContext, safeDownloadName } from "../../../_shared"
import {
  isAdminCheckedSource,
  isAdminContactStatus,
  parseAdminContactEdits,
  updateSubmissionContact,
} from "@/lib/submission-contacts"
import { parseSubmissionImport, submissionCounts } from "@/lib/submission-import"

export async function POST(req: NextRequest, { params }: RouteContext) {
  try {
    assertMultiTenantEnabled()
    validateMutationOrigin(req)
    const auth = await requireCongregationAdmin(params.slug)
    const body = await req.json()
    const imported = parseSubmissionImport(body?.submissionImport ?? body, body?.userId)
    if (!imported) {
      return NextResponse.json({ error: "Upload a valid submission JSON file with at most 100 submissions." }, { status: 400 })
    }

    const client = await pool.connect()
    const ids: number[] = []
    try {
      await client.query("BEGIN")
      for (const submission of imported) {
        const counts = submissionCounts(submission.contacts)
        const result = await client.query(
          `INSERT INTO submissions
            (congregation_id, user_id, submitted_at, contact_count, potentially_french,
             not_french, duplicate, not_checked, global_notes, territory_zipcode,
             territory_page_range, contacts, review_status, archived)
           VALUES ($1,$2,COALESCE($3::timestamptz,NOW()),$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
           RETURNING id`,
          [auth.congregation.id, submission.userId, submission.submittedAt, counts.contactCount,
            counts.potentiallyFrench, counts.notFrench, counts.duplicate, counts.notChecked,
            submission.globalNotes, submission.territoryZipcode, submission.territoryPageRange,
            JSON.stringify(submission.contacts), submission.reviewStatus, submission.archived],
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
    await auditEvent({
      actorUserId: auth.user.id,
      congregationId: auth.congregation.id,
      action: "submission.imported",
      targetType: "submission",
      targetId: ids.join(","),
      metadata: { count: ids.length },
    })
    return NextResponse.json({ success: true, imported: ids.length, ids }, { status: 201 })
  } catch (error) {
    return apiError(error)
  }
}

export async function GET(req: NextRequest, { params }: RouteContext) {
  try {
    assertMultiTenantEnabled()
    const auth = await requireCongregationAdmin(params.slug)
    const userId = integer(req.nextUrl.searchParams.get("userId"))
    const userName = req.nextUrl.searchParams.get("userName")?.trim() || null
    const submissionId = integer(req.nextUrl.searchParams.get("submissionId"))
    if (req.nextUrl.searchParams.has("userId") && !userId) {
      return NextResponse.json({ error: "Invalid user id." }, { status: 400 })
    }

    if (userId || userName) {
      const result = await pool.query(
        `SELECT s.*,
                COALESCE(m.display_name, u.display_name, s.user_id) AS display_name
         FROM submissions s
         LEFT JOIN users u ON u.id = s.owner_user_id
         LEFT JOIN congregation_memberships m
           ON m.user_id = s.owner_user_id AND m.congregation_id = s.congregation_id
         WHERE s.congregation_id = $1
           AND (($2::bigint IS NOT NULL AND s.owner_user_id = $2)
             OR ($4::text IS NOT NULL AND s.user_id = $4))
           AND ($3::bigint IS NULL OR s.id = $3)
         ORDER BY s.submitted_at DESC LIMIT 1`,
        [auth.congregation.id, userId, submissionId, userName],
      )
      if (!result.rows[0]) return NextResponse.json({ error: "No submission found." }, { status: 404 })
      const row = result.rows[0]
      if (req.nextUrl.searchParams.get("format") === "json") {
        await auditEvent({ actorUserId: auth.user.id, congregationId: auth.congregation.id,
          action: "submission.downloaded", targetType: "submission", targetId: String(row.id) })
        const filename = `${safeDownloadName(row.display_name)}-submission-${row.id}.json`
        return new NextResponse(JSON.stringify(row, null, 2), {
          headers: { "Content-Type": "application/json", "Content-Disposition": `attachment; filename="${filename}"` },
        })
      }
      return NextResponse.json(row)
    }

    const result = await pool.query(
      `SELECT s.id, s.owner_user_id, s.user_id, s.submitted_at,
              s.contact_count, s.potentially_french, s.not_french, s.duplicate,
              s.not_checked, s.global_notes, s.territory_zipcode,
              s.territory_page_range, s.review_status, s.archived,
              COALESCE(m.display_name, u.display_name, s.user_id) AS display_name,
              (SELECT c->>'zipcode' FROM jsonb_array_elements(s.contacts) c
               WHERE COALESCE(c->>'zipcode','') <> '' GROUP BY c->>'zipcode'
               ORDER BY COUNT(*) DESC LIMIT 1) AS top_zipcode
       FROM submissions s
       LEFT JOIN users u ON u.id = s.owner_user_id
       LEFT JOIN congregation_memberships m
         ON m.user_id = s.owner_user_id AND m.congregation_id = s.congregation_id
       WHERE s.congregation_id = $1
       ORDER BY display_name, s.submitted_at DESC`,
      [auth.congregation.id],
    )
    return NextResponse.json(result.rows)
  } catch (error) {
    return apiError(error)
  }
}

export async function PATCH(req: NextRequest, { params }: RouteContext) {
  try {
    assertMultiTenantEnabled()
    validateMutationOrigin(req)
    const auth = await requireCongregationAdmin(params.slug)
    const body = await req.json()
    const id = integer(body.id)
    if (!id) return NextResponse.json({ error: "Missing submission id." }, { status: 400 })
    const contactId = String(body.contactId ?? "").trim()
    if (!contactId && (body.status !== undefined || body.checkedSource !== undefined || body.fields !== undefined)) {
      return NextResponse.json({ error: "Missing contact id." }, { status: 400 })
    }
    if (contactId) {
      const hasStatus = body.status !== undefined
      const hasCheckedSource = body.checkedSource !== undefined
      const hasFields = body.fields !== undefined
      if ([hasStatus, hasCheckedSource, hasFields].filter(Boolean).length !== 1) {
        return NextResponse.json({ error: "Choose one contact update at a time." }, { status: 400 })
      }
      if (hasStatus && !isAdminContactStatus(body.status)) {
        return NextResponse.json({ error: "Invalid contact status." }, { status: 400 })
      }
      if (hasCheckedSource && !isAdminCheckedSource(body.checkedSource)) {
        return NextResponse.json({ error: "Invalid checked source." }, { status: 400 })
      }
      const fields = hasFields ? parseAdminContactEdits(body.fields) : null
      if (hasFields && !fields) {
        return NextResponse.json({ error: "Invalid contact fields." }, { status: 400 })
      }
      const client = await pool.connect()
      let updated: NonNullable<Awaited<ReturnType<typeof updateSubmissionContact>>>
      try {
        await client.query("BEGIN")
        const mutationResult = await updateSubmissionContact(client, {
          submissionId: id,
          congregationId: auth.congregation.id,
          contactId,
          ...(hasStatus ? { status: body.status } : hasCheckedSource ? { checkedSource: body.checkedSource } : { fields: fields! }),
        })
        if (!mutationResult) {
          await client.query("ROLLBACK")
          return NextResponse.json({ error: "Contact not found." }, { status: 404 })
        }
        updated = mutationResult
        await client.query("COMMIT")
      } catch (error) {
        await client.query("ROLLBACK")
        throw error
      } finally {
        client.release()
      }
      await auditEvent({
        actorUserId: auth.user.id,
        congregationId: auth.congregation.id,
        action: "submission_contact.updated",
        targetType: "submission_contact",
        targetId: `${id}:${contactId}`,
        metadata: hasStatus
          ? { status: body.status }
          : hasCheckedSource
            ? { checkedSource: body.checkedSource }
            : { fields: Object.keys(fields!) },
      })
      return NextResponse.json({ success: true, ...updated })
    }
    if (body.review_status !== undefined && !["pending", "in_review", "reviewed"].includes(body.review_status)) {
      return NextResponse.json({ error: "Invalid review_status." }, { status: 400 })
    }
    if (body.archived !== undefined && typeof body.archived !== "boolean") {
      return NextResponse.json({ error: "Invalid archived value." }, { status: 400 })
    }
    const result = await pool.query(
      `UPDATE submissions SET
         review_status = COALESCE($3, review_status),
         archived = COALESCE($4, archived)
       WHERE id = $1 AND congregation_id = $2 RETURNING id`,
      [id, auth.congregation.id, body.review_status ?? null, body.archived ?? null],
    )
    if (!result.rows[0]) return NextResponse.json({ error: "Submission not found." }, { status: 404 })
    await auditEvent({ actorUserId: auth.user.id, congregationId: auth.congregation.id,
      action: "submission.updated", targetType: "submission", targetId: String(id),
      metadata: { reviewStatus: body.review_status, archived: body.archived } })
    return NextResponse.json({ success: true })
  } catch (error) {
    return apiError(error)
  }
}

export async function DELETE(req: NextRequest, { params }: RouteContext) {
  try {
    assertMultiTenantEnabled()
    validateMutationOrigin(req)
    const auth = await requireCongregationAdmin(params.slug)
    const id = integer(req.nextUrl.searchParams.get("id"))
    if (!id) return NextResponse.json({ error: "Missing submission id." }, { status: 400 })
    const client = await pool.connect()
    try {
      await client.query("BEGIN")
      await client.query(
        `DELETE FROM dismissed_dictionary_scan_matches
         WHERE congregation_id = $1 AND submission_id = $2`,
        [auth.congregation.id, id],
      )
      const result = await client.query(
        `DELETE FROM submissions WHERE congregation_id = $1 AND id = $2 RETURNING id`,
        [auth.congregation.id, id],
      )
      if (!result.rows[0]) {
        await client.query("ROLLBACK")
        return NextResponse.json({ error: "Submission not found." }, { status: 404 })
      }
      await client.query("COMMIT")
    } catch (error) {
      await client.query("ROLLBACK")
      throw error
    } finally {
      client.release()
    }
    await auditEvent({ actorUserId: auth.user.id, congregationId: auth.congregation.id,
      action: "submission.deleted", targetType: "submission", targetId: String(id) })
    return NextResponse.json({ success: true })
  } catch (error) {
    return apiError(error)
  }
}
