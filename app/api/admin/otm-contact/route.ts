import { NextRequest, NextResponse } from "next/server"
import { pool } from "@/lib/db"
import { cookies } from "next/headers"

function isAuthed() {
  const cookieStore = cookies()
  return cookieStore.get("admin_session")?.value === process.env.ADMIN_PASSWORD
}

// DELETE /api/admin/otm-contact?submissionId=123&contactId=abc
// Removes a single contact from the contacts JSONB array of a submission.
// Returns success even if the submission no longer exists (already deleted).
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
    // If the submission no longer exists we still return success — contact is gone.
    await pool.query(
      `UPDATE submissions
       SET contacts = (
         SELECT COALESCE(jsonb_agg(elem), '[]'::jsonb)
         FROM jsonb_array_elements(contacts) AS elem
         WHERE elem->>'id' <> $2
       )
       WHERE id = $1`,
      [parseInt(submissionId), contactId]
    )

    return NextResponse.json({ success: true })
  } catch (err: any) {
    console.error("OTM contact delete error:", err)
    return NextResponse.json(
      { error: "Internal server error: " + err.message },
      { status: 500 }
    )
  }
}

// PATCH /api/admin/otm-contact?submissionId=123&contactId=abc
// Sets the contact's status to "Not checked" — clears the OTM dup flag
// without removing the contact from the submission entirely.
export async function PATCH(req: NextRequest) {
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
    // Walk the contacts JSONB array; for the matching element set status = "Not checked".
    await pool.query(
      `UPDATE submissions
       SET contacts = (
         SELECT COALESCE(
           jsonb_agg(
             CASE WHEN elem->>'id' = $2
               THEN elem || '{"status":"Not checked"}'::jsonb
               ELSE elem
             END
           ),
           '[]'::jsonb
         )
         FROM jsonb_array_elements(contacts) AS elem
       )
       WHERE id = $1`,
      [parseInt(submissionId), contactId]
    )

    return NextResponse.json({ success: true })
  } catch (err: any) {
    console.error("OTM contact patch error:", err)
    return NextResponse.json(
      { error: "Internal server error: " + err.message },
      { status: 500 }
    )
  }
}
