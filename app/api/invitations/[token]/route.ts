import { NextRequest, NextResponse } from "next/server"
import { createHash } from "crypto"
import { authErrorResponse, consumeInvitation, createAuthSession, validateMutationOrigin } from "@/lib/auth"
import { ensureSchema, pool } from "@/lib/db"

const digest = (token: string) => createHash("sha256").update(token).digest("hex")

export async function GET(_: NextRequest, { params }: { params: { token: string } }) {
  await ensureSchema()
  const result = await pool.query(`SELECT i.email,i.role,i.expires_at,c.name congregation_name FROM invitations i JOIN congregations c ON c.id=i.congregation_id WHERE i.token_hash=$1 AND i.accepted_at IS NULL AND i.expires_at>NOW()`, [digest(params.token)])
  if (!result.rowCount) return NextResponse.json({ error: "Invitation is invalid or expired" }, { status: 404 })
  return NextResponse.json(result.rows[0])
}

export async function POST(request: NextRequest, { params }: { params: { token: string } }) {
  try {
    validateMutationOrigin(request); await ensureSchema(); const body = await request.json()
    const accepted = await consumeInvitation(params.token, body)
    await createAuthSession(accepted.userId); return NextResponse.json({ ok: true, slug: accepted.slug })
  } catch (error) { return authErrorResponse(error) }
}
