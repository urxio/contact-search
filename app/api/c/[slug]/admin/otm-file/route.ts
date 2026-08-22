import { NextRequest, NextResponse } from "next/server"
import { pool } from "@/lib/db"
import { auditEvent, requireCongregationAdmin, validateMutationOrigin } from "@/lib/auth"
import { apiError, assertMultiTenantEnabled, RouteContext } from "../../../_shared"

export const runtime = "nodejs"

export async function GET(_req: NextRequest, { params }: RouteContext) {
  try {
    assertMultiTenantEnabled()
    const auth = await requireCongregationAdmin(params.slug)
    const result = await pool.query(
      `SELECT filename, uploaded_at FROM otm_files WHERE congregation_id = $1`,
      [auth.congregation.id],
    )
    if (!result.rows[0]) return NextResponse.json({ exists: false })
    const row = result.rows[0]
    return NextResponse.json({ exists: true, filename: row.filename, uploadedAt: row.uploaded_at })
  } catch (error) {
    return apiError(error)
  }
}

export async function POST(req: NextRequest, { params }: RouteContext) {
  try {
    assertMultiTenantEnabled()
    validateMutationOrigin(req)
    const auth = await requireCongregationAdmin(params.slug)
    const form = await req.formData()
    const file = form.get("file")
    if (!(file instanceof File) || file.size === 0 || file.size > 15 * 1024 * 1024) {
      return NextResponse.json({ error: "Choose an OTM spreadsheet up to 15 MB." }, { status: 400 })
    }
    const bytes = Buffer.from(await file.arrayBuffer())
    const result = await pool.query(
      `INSERT INTO otm_files (congregation_id, filename, filedata, uploaded_at)
       VALUES ($1,$2,$3,NOW())
       ON CONFLICT (congregation_id) DO UPDATE SET
         filename = EXCLUDED.filename, filedata = EXCLUDED.filedata, uploaded_at = NOW()
       RETURNING filename, uploaded_at`,
      [auth.congregation.id, file.name, bytes],
    )
    await auditEvent({ actorUserId: auth.user.id, congregationId: auth.congregation.id,
      action: "otm_file.replaced", targetType: "otm_file", metadata: { filename: file.name, bytes: file.size } })
    return NextResponse.json({
      exists: true,
      filename: result.rows[0].filename,
      uploadedAt: result.rows[0].uploaded_at,
    }, { status: 201 })
  } catch (error) {
    return apiError(error)
  }
}
