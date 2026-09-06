import { createHash, randomBytes, scrypt as scryptCallback, timingSafeEqual } from "crypto"
import { promisify } from "util"
import { cookies, headers } from "next/headers"
import { getIronSession } from "iron-session"
import { ensureSchema, pool } from "@/lib/db"

const scrypt = promisify(scryptCallback)
export const AUTH_COOKIE_NAME = "search_helper_session"
const SESSION_DAYS = 14
const MAX_FAILED_LOGINS = 5
const LOCKOUT_MINUTES = 15

type AuthCookie = { sessionId?: string }
export type AuthUser = {
  id: number
  email: string
  displayName: string
  isPlatformAdmin: boolean
  preferences: { theme?: "light" | "dark"; defaultWorkspaceView?: "search" | "team" }
}
export type CongregationAccess = {
  user: AuthUser
  congregation: { id: number; name: string; slug: string; settings: Record<string, unknown> }
  membership: null | { id: number; role: "member" | "admin"; displayName: string | null }
}

export class AuthError extends Error {
  constructor(public status: 401 | 403 | 404 | 409, message: string) { super(message) }
}

export function isMultiTenantEnabled() { return process.env.MULTI_TENANT_ENABLED === "true" }
const normalizeEmail = (email: string) => email.trim().toLowerCase()
const tokenHash = (token: string) => createHash("sha256").update(token).digest("hex")

function sessionOptions() {
  const password = process.env.SESSION_SECRET
  if (!password || password.length < 32) throw new Error("SESSION_SECRET must be at least 32 characters")
  return { password, cookieName: AUTH_COOKIE_NAME, cookieOptions: { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax" as const, path: "/", maxAge: SESSION_DAYS * 86400 } }
}

export async function hashPassword(password: string) {
  if (typeof password !== "string" || password.length < 10) throw new AuthError(409, "Password must be at least 10 characters")
  const salt = randomBytes(16)
  const key = await scrypt(password, salt, 64) as Buffer
  return `scrypt$${salt.toString("base64")}$${key.toString("base64")}`
}

export async function verifyPassword(password: string, encoded: string) {
  const [algorithm, saltText, keyText] = encoded.split("$")
  if (algorithm !== "scrypt" || !saltText || !keyText) return false
  const expected = Buffer.from(keyText, "base64")
  const actual = await scrypt(password, Buffer.from(saltText, "base64"), expected.length) as Buffer
  return actual.length === expected.length && timingSafeEqual(actual, expected)
}

export async function createAuthSession(userId: number) {
  await ensureSchema()
  const id = randomBytes(32).toString("base64url")
  await pool.query(`INSERT INTO auth_sessions(id,user_id,expires_at) VALUES($1,$2,NOW()+($3||' days')::interval)`, [id, userId, SESSION_DAYS])
  const session = await getIronSession<AuthCookie>(await cookies(), sessionOptions())
  session.sessionId = id
  await session.save()
  return id
}

export async function destroyAuthSession(sessionId?: string) {
  const session = await getIronSession<AuthCookie>(await cookies(), sessionOptions())
  const id = sessionId ?? session.sessionId
  if (id) await pool.query(`UPDATE auth_sessions SET revoked_at=NOW() WHERE id=$1`, [id])
  session.destroy()
}

export async function getCurrentSession() {
  if (!isMultiTenantEnabled()) return null
  await ensureSchema()
  const session = await getIronSession<AuthCookie>(await cookies(), sessionOptions())
  if (!session.sessionId) return null
  const result = await pool.query(`SELECT s.id session_id,u.id,u.email,u.display_name,u.is_platform_admin,u.preferences
    FROM auth_sessions s JOIN users u ON u.id=s.user_id
    WHERE s.id=$1 AND s.revoked_at IS NULL AND s.expires_at>NOW()`, [session.sessionId])
  if (!result.rowCount) { session.destroy(); return null }
  await pool.query(`UPDATE auth_sessions SET last_seen_at=NOW() WHERE id=$1 AND last_seen_at<NOW()-INTERVAL '5 minutes'`, [session.sessionId])
  const row = result.rows[0]
  return {
    sessionId: row.session_id as string,
    user: {
      id: Number(row.id),
      email: row.email,
      displayName: row.display_name,
      isPlatformAdmin: row.is_platform_admin,
      preferences: row.preferences ?? {},
    } as AuthUser,
  }
}

export async function requireUser() {
  const current = await getCurrentSession()
  if (!current) throw new AuthError(401, "Sign in required")
  return current.user
}

export async function requireMembership(slug: string): Promise<CongregationAccess> {
  const user = await requireUser()
  const result = await pool.query(`SELECT c.id congregation_id,c.name,c.slug,c.settings,m.id membership_id,m.role,m.display_name
    FROM congregations c LEFT JOIN congregation_memberships m ON m.congregation_id=c.id AND m.user_id=$2 AND m.status='active'
    WHERE c.slug=$1 AND c.status='active'`, [slug, user.id])
  if (!result.rowCount) throw new AuthError(404, "Workspace not found")
  const row = result.rows[0]
  if (!row.membership_id && !user.isPlatformAdmin) throw new AuthError(404, "Workspace not found")
  if (user.isPlatformAdmin && !row.membership_id) await auditEvent({ actorUserId: user.id, congregationId: Number(row.congregation_id), action: "platform.support_access", targetType: "congregation", targetId: String(row.congregation_id) })
  return { user, congregation: { id: Number(row.congregation_id), name: row.name, slug: row.slug, settings: row.settings ?? {} }, membership: row.membership_id ? { id: Number(row.membership_id), role: row.role, displayName: row.display_name } : null }
}

export async function requireCongregationAdmin(slug: string) {
  const access = await requireMembership(slug)
  if (!access.user.isPlatformAdmin && access.membership?.role !== "admin") throw new AuthError(404, "Workspace not found")
  return access
}

export async function requirePlatformAdmin() {
  const user = await requireUser()
  if (!user.isPlatformAdmin) throw new AuthError(404, "Not found")
  return user
}

export function validateMutationOrigin(request: Request) {
  const origin = request.headers.get("origin")
  const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host")
  if (!origin || !host) throw new AuthError(403, "Invalid request origin")
  let originHost = ""
  try { originHost = new URL(origin).host } catch { throw new AuthError(403, "Invalid request origin") }
  if (originHost !== host) throw new AuthError(403, "Invalid request origin")
}

export async function auditEvent(input: { actorUserId: number | null; congregationId?: number | null; action: string; targetType?: string; targetId?: string; metadata?: Record<string, unknown> }) {
  await pool.query(`INSERT INTO audit_events(actor_user_id,congregation_id,action,target_type,target_id,metadata) VALUES($1,$2,$3,$4,$5,$6::jsonb)`, [input.actorUserId, input.congregationId ?? null, input.action, input.targetType ?? null, input.targetId ?? null, JSON.stringify(input.metadata ?? {})])
}

export async function issueInvitation(input: { congregationId: number; email: string; role: "member" | "admin"; legacyIdentityId?: number | null; createdByUserId: number }) {
  if (!input.email.includes("@")) throw new AuthError(409, "A valid email is required")
  if (input.legacyIdentityId) {
    const identity = await pool.query(`SELECT 1 FROM legacy_identities WHERE id=$1 AND congregation_id=$2 AND linked_user_id IS NULL`, [input.legacyIdentityId, input.congregationId])
    if (!identity.rowCount) throw new AuthError(404, "Historical identity not found")
  }
  const token = randomBytes(32).toString("base64url")
  const result = await pool.query(`INSERT INTO invitations(congregation_id,email,role,token_hash,legacy_identity_id,expires_at,created_by_user_id)
    VALUES($1,$2,$3,$4,$5,NOW()+INTERVAL '7 days',$6) RETURNING expires_at`, [input.congregationId, normalizeEmail(input.email), input.role, tokenHash(token), input.legacyIdentityId ?? null, input.createdByUserId])
  await auditEvent({ actorUserId: input.createdByUserId, congregationId: input.congregationId, action: "invitation.created", targetType: "email", targetId: normalizeEmail(input.email), metadata: { role: input.role } })
  return { token, expiresAt: result.rows[0].expires_at as Date }
}

export async function consumeInvitation(token: string, input: { displayName?: string; password: string }) {
  const client = await pool.connect()
  try {
    await client.query("BEGIN")
    const invitation = await client.query(`SELECT i.*,c.slug FROM invitations i JOIN congregations c ON c.id=i.congregation_id WHERE token_hash=$1 AND accepted_at IS NULL AND revoked_at IS NULL AND expires_at>NOW() FOR UPDATE OF i`, [tokenHash(token)])
    if (!invitation.rowCount) throw new AuthError(404, "Invitation is invalid or expired")
    const invite = invitation.rows[0]
    const existing = await client.query(`SELECT id,password_hash FROM users WHERE email=$1`, [invite.email])
    let userId: number
    if (existing.rowCount) {
      if (!(await verifyPassword(input.password, existing.rows[0].password_hash))) throw new AuthError(401, "Password is incorrect")
      userId = Number(existing.rows[0].id)
    } else {
      if (!input.displayName?.trim()) throw new AuthError(409, "Display name is required")
      const passwordHash = await hashPassword(input.password)
      const created = await client.query(`INSERT INTO users(email,display_name,password_hash) VALUES($1,$2,$3) RETURNING id`, [invite.email, input.displayName.trim(), passwordHash])
      userId = Number(created.rows[0].id)
    }
    const displayName = input.displayName?.trim() || null
    await client.query(`INSERT INTO congregation_memberships(user_id,congregation_id,role,display_name) VALUES($1,$2,$3,$4) ON CONFLICT(user_id,congregation_id) DO UPDATE SET role=EXCLUDED.role,status='active',display_name=COALESCE(EXCLUDED.display_name,congregation_memberships.display_name)`, [userId, invite.congregation_id, invite.role, displayName])
    if (invite.legacy_identity_id) {
      const legacy = await client.query(`UPDATE legacy_identities SET linked_user_id=$1 WHERE id=$2 AND congregation_id=$3 AND linked_user_id IS NULL RETURNING display_name`, [userId, invite.legacy_identity_id, invite.congregation_id])
      if (!legacy.rowCount) throw new AuthError(409, "Historical identity is no longer available")
      const historicalName = legacy.rows[0].display_name
      await client.query(`UPDATE submissions SET owner_user_id=$1 WHERE congregation_id=$2 AND lower(trim(user_id))=lower(trim($3))`, [userId, invite.congregation_id, historicalName])
      await client.query(`UPDATE zt_segments SET owner_user_id=$1 WHERE congregation_id=$2 AND lower(trim(owner))=lower(trim($3))`, [userId, invite.congregation_id, historicalName])
    }
    await client.query(`UPDATE invitations SET accepted_at=NOW() WHERE id=$1`, [invite.id])
    await client.query(`INSERT INTO audit_events(actor_user_id,congregation_id,action,target_type,target_id,metadata) VALUES($1,$2,'invitation.accepted','invitation',$3,'{}')`, [userId, invite.congregation_id, String(invite.id)])
    await client.query("COMMIT")
    return { userId, slug: invite.slug as string }
  } catch (error) { await client.query("ROLLBACK"); throw error } finally { client.release() }
}

export async function issuePasswordReset(input: { userId: number; createdByUserId?: number | null }) {
  const token = randomBytes(32).toString("base64url")
  const result = await pool.query(`INSERT INTO password_reset_tokens(user_id,token_hash,expires_at,created_by_user_id) VALUES($1,$2,NOW()+INTERVAL '1 hour',$3) RETURNING expires_at`, [input.userId, tokenHash(token), input.createdByUserId ?? null])
  await auditEvent({ actorUserId: input.createdByUserId ?? input.userId, action: "password_reset.created", targetType: "user", targetId: String(input.userId) })
  return { token, expiresAt: result.rows[0].expires_at as Date }
}

export async function consumePasswordReset(token: string, password: string) {
  const passwordHash = await hashPassword(password)
  const client = await pool.connect()
  try {
    await client.query("BEGIN")
    const result = await client.query(`SELECT id,user_id FROM password_reset_tokens WHERE token_hash=$1 AND used_at IS NULL AND expires_at>NOW() FOR UPDATE`, [tokenHash(token)])
    if (!result.rowCount) throw new AuthError(404, "Reset link is invalid or expired")
    const row = result.rows[0]
    await client.query(`UPDATE users SET password_hash=$1,password_changed_at=NOW(),failed_login_count=0,locked_until=NULL WHERE id=$2`, [passwordHash, row.user_id])
    await client.query(`UPDATE password_reset_tokens SET used_at=NOW() WHERE id=$1`, [row.id])
    await client.query(`UPDATE auth_sessions SET revoked_at=NOW() WHERE user_id=$1 AND revoked_at IS NULL`, [row.user_id])
    await client.query("COMMIT")
    await auditEvent({ actorUserId: Number(row.user_id), action: "password_reset.completed", targetType: "user", targetId: String(row.user_id) })
  } catch (error) { await client.query("ROLLBACK"); throw error } finally { client.release() }
}

export async function signIn(email: string, password: string) {
  await ensureSchema()
  const result = await pool.query(`SELECT id,email,display_name,password_hash,is_platform_admin,failed_login_count,locked_until,preferences FROM users WHERE email=$1`, [normalizeEmail(email)])
  if (!result.rowCount) throw new AuthError(401, "Email or password is incorrect")
  const row = result.rows[0]
  if (row.locked_until && new Date(row.locked_until) > new Date()) throw new AuthError(401, "Account is temporarily locked")
  if (!(await verifyPassword(password, row.password_hash))) {
    await pool.query(`UPDATE users SET failed_login_count=failed_login_count+1,locked_until=CASE WHEN failed_login_count+1 >= $2 THEN NOW()+($3||' minutes')::interval ELSE locked_until END WHERE id=$1`, [row.id, MAX_FAILED_LOGINS, LOCKOUT_MINUTES])
    throw new AuthError(401, "Email or password is incorrect")
  }
  await pool.query(`UPDATE users SET failed_login_count=0,locked_until=NULL WHERE id=$1`, [row.id])
  await createAuthSession(Number(row.id))
  await auditEvent({ actorUserId: Number(row.id), action: "auth.signed_in", targetType: "user", targetId: String(row.id) })
  return {
    id: Number(row.id),
    email: row.email,
    displayName: row.display_name,
    isPlatformAdmin: row.is_platform_admin,
    preferences: row.preferences ?? {},
  } as AuthUser
}

export function authErrorResponse(error: unknown) {
  const status = error instanceof AuthError ? error.status : 500
  return Response.json({ error: error instanceof Error ? error.message : "Unexpected error" }, { status })
}

export async function requestHost() { return (await headers()).get("host") }
