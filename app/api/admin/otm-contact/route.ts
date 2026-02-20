import { NextRequest, NextResponse } from "next/server"
import { pool } from "@/lib/db"
import { cookies } from "next/headers"

function isAuthed() {
  const cookieStore = cookies()
  return cookieStore.get("admin_session")?.value === process.env.ADMIN_PASSWORD
}

// DELETE /api/admin/otm-contact?submissionId=123&contactId=abc
// Removes a single contact from the contacts JSONB array of a submission.
export async function DELETE(req: NextRequest) {
  if (!isAuthed()) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const { searchParams } = new URL(req.url)
  const submissionId = searchParams.get("submissionId")
  const contactId    = searchParams.get("contactId")

  if (!submissionId || !contactId) {
    return NextResponse.json(
      { error: "Missing submissionId or contactId" },
      { status: 400 }
    )
  }

  try {
    // Remove the element whose 'id' field matches contactId from the JSONB array.
    // jsonb_agg rebuilds the array without the removed element.
    const result = await pool.query(
      `UPDATE submissions
       SET contacts = (
         SELECT COALESCE(jsonb_agg(elem), '[]'::jsonb)
         FROM jsonb_array_elements(contacts) AS elem
         WHERE elem->>'id' <> $2
       )
       WHERE id = $1
       RETURNING id`,
      [parseInt(submissionId), contactId]
    )

    if (result.rows.length === 0) {
      return NextResponse.json({ error: "Submission not found" }, { status: 404 })
    }

    return NextResponse.json({ success: true })
  } catch (err: any) {
    console.error("OTM contact delete error:", err)
    return NextResponse.json(
      { error: "Internal server error: " + err.message },
      { status: 500 }
    )
  }
}
