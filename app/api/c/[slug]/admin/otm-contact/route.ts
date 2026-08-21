import { NextRequest, NextResponse } from "next/server"
import { pool } from "@/lib/db"
import { auditEvent, requireCongregationAdmin, validateMutationOrigin } from "@/lib/auth"
import { apiError, assertMultiTenantEnabled, integer, RouteContext } from "../../../_shared"

async function mutateContact(congregationId: number, submissionId: number, contactId: string, remove: boolean) {
  const result = await pool.query(
    `UPDATE submissions SET contacts = (
       SELECT COALESCE(jsonb_agg(
         CASE WHEN NOT $4::boolean AND elem->>'id' = $3
           THEN elem || '{"status":"Not checked"}'::jsonb ELSE elem END
       ) FILTER (WHERE NOT $4::boolean OR elem->>'id' <> $3), '[]'::jsonb)
       FROM jsonb_array_elements(contacts) elem
     )
     WHERE id = $1 AND congregation_id = $2
       AND EXISTS (SELECT 1 FROM jsonb_array_elements(contacts) elem WHERE elem->>'id' = $3)
     RETURNING id`,
    [submissionId, congregationId, contactId, remove],
  )
  return !!result.rows[0]
}

async function handle(req: NextRequest, context: RouteContext, remove: boolean) {
  try {
    assertMultiTenantEnabled()
    validateMutationOrigin(req)
    const auth = await requireCongregationAdmin(context.params.slug)
    const submissionId = integer(req.nextUrl.searchParams.get("submissionId"))
    const contactId = req.nextUrl.searchParams.get("contactId")?.trim()
    if (!submissionId || !contactId) return NextResponse.json({ error: "Missing submissionId or contactId." }, { status: 400 })
    if (!await mutateContact(auth.congregation.id, submissionId, contactId, remove)) {
      return NextResponse.json({ error: "Contact not found." }, { status: 404 })
    }
    await auditEvent({ actorUserId: auth.user.id, congregationId: auth.congregation.id,
      action: remove ? "otm_contact.deleted" : "otm_contact.reset",
      targetType: "submission_contact", targetId: `${submissionId}:${contactId}` })
    return NextResponse.json({ success: true })
  } catch (error) {
    return apiError(error)
  }
}

export async function DELETE(req: NextRequest, context: RouteContext) {
  return handle(req, context, true)
}

export async function PATCH(req: NextRequest, context: RouteContext) {
  return handle(req, context, false)
}
