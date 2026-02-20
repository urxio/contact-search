import { NextRequest, NextResponse } from "next/server"
import { pool, ensureSchema } from "@/lib/db"
import { cookies } from "next/headers"

function isAuthed() {
  const cookieStore = cookies()
  return cookieStore.get("admin_session")?.value === process.env.ADMIN_PASSWORD
}

// ── GET /api/admin/otm-file ───────────────────────────────────────────────────
// Returns metadata about the currently saved OTM file (no file bytes).
export async function GET() {
  if (!isAuthed()) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  try {
    await ensureSchema()
    const result = await pool.query(
      `SELECT filename, uploaded_at FROM otm_files WHERE id = 1`
    )
    if (result.rows.length === 0) {
      return NextResponse.json({ exists: false })
    }
    const { filename, uploaded_at } = result.rows[0]
    return NextResponse.json({ exists: true, filename, uploadedAt: uploaded_at })
  } catch (err: any) {
    return NextResponse.json({ error: "Internal server error: " + err.message }, { status: 500 })
  }
}

// ── POST /api/admin/otm-file ──────────────────────────────────────────────────
// Accepts a multipart file upload and upserts the bytes into otm_files id=1.
export async function POST(req: NextRequest) {
  if (!isAuthed()) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  try {
    await ensureSchema()

    const form = await req.formData()
    const file = form.get("file") as File | null
    if (!file) {
      return NextResponse.json({ error: "No file uploaded" }, { status: 400 })
    }

    const buffer = Buffer.from(await file.arrayBuffer())

    await pool.query(
      `INSERT INTO otm_files (id, filename, filedata, uploaded_at)
       VALUES (1, $1, $2, NOW())
       ON CONFLICT (id) DO UPDATE
         SET filename    = EXCLUDED.filename,
             filedata    = EXCLUDED.filedata,
             uploaded_at = EXCLUDED.uploaded_at`,
      [file.name, buffer]
    )

    const saved = await pool.query(
      `SELECT filename, uploaded_at FROM otm_files WHERE id = 1`
    )
    const { filename, uploaded_at } = saved.rows[0]
    return NextResponse.json({ exists: true, filename, uploadedAt: uploaded_at })
  } catch (err: any) {
    return NextResponse.json({ error: "Internal server error: " + err.message }, { status: 500 })
  }
}
