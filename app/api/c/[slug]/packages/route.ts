import { NextRequest, NextResponse } from "next/server"
import { pool } from "@/lib/db"
import { auditEvent, requireMembership, validateMutationOrigin } from "@/lib/auth"
import { apiError, assertMultiTenantEnabled, canManageAll, integer, RouteContext } from "../../_shared"
import {
  DraftConflictError, insertPackageAudit, PACKAGE_SELECT, replaceDraft, sanitizePackageContacts,
  isPackageBrowsable, serializePackage, validatePackageName, validateVisibility,
} from "@/lib/contact-packages"
import { assertNoSegmentConflict, SegmentConflictError } from "@/lib/team-segments"

export async function GET(req: NextRequest, { params }: RouteContext) {
  try {
    assertMultiTenantEnabled()
    const auth = await requireMembership(params.slug)
    const manageAll = canManageAll(auth)
    const includedPackageId = integer(req.nextUrl.searchParams.get("include"))
    const result = await pool.query(
      `${PACKAGE_SELECT}
        WHERE cp.congregation_id=$1
          AND s.status <> 'Completed'
          AND ($2::boolean OR cp.visibility='shared' OR cp.uploaded_by_user_id=$3 OR s.owner_user_id=$3)
        ORDER BY cp.created_at DESC,cp.id DESC`,
      [auth.congregation.id, manageAll, auth.user.id],
    )
    return NextResponse.json({
      packages: result.rows
        .filter(row => isPackageBrowsable(row, auth.user.id, includedPackageId))
        .map(row => serializePackage(row, auth.user.id, manageAll)),
    })
  } catch (error) { return apiError(error) }
}

export async function POST(req: NextRequest, { params }: RouteContext) {
  let auditContext: { actorUserId: number; congregationId: number } | null = null
  const client = await pool.connect()
  try {
    assertMultiTenantEnabled()
    validateMutationOrigin(req)
    const auth = await requireMembership(params.slug)
    auditContext = { actorUserId: auth.user.id, congregationId: auth.congregation.id }
    const body = await req.json()
    const name = validatePackageName(body?.name)
    const visibility = validateVisibility(body?.visibility)
    const contacts = sanitizePackageContacts(body?.contacts)
    const zipcode = String(body?.zipcode ?? "").trim()
    const pageStart = integer(body?.pageStart)
    const pageEnd = integer(body?.pageEnd)
    const startNow = body?.startNow === true
    const draftRevision = Number(body?.draftRevision)
    if (!name || !visibility || !contacts || !zipcode || !pageStart || !pageEnd || pageEnd < pageStart ||
        (startNow && (!Number.isSafeInteger(draftRevision) || draftRevision < 0))) {
      return NextResponse.json({ error: "Excel name, visibility, contacts, ZIP code, and page range are required." }, { status: 400 })
    }

    await client.query("BEGIN")
    const zipResult = await client.query(
      `SELECT id,zipcode,total_pages FROM zt_zipcodes WHERE congregation_id=$1 AND zipcode=$2 FOR SHARE`,
      [auth.congregation.id, zipcode],
    )
    const zip = zipResult.rows[0]
    if (!zip) { await client.query("ROLLBACK"); return NextResponse.json({ error: "Zipcode not found." }, { status: 404 }) }
    if (pageEnd > Number(zip.total_pages)) {
      await client.query("ROLLBACK")
      return NextResponse.json({ error: "Page range exceeds this territory." }, { status: 400 })
    }
    await assertNoSegmentConflict(client, { congregationId: auth.congregation.id, zipcodeId: Number(zip.id), pageStart, pageEnd })
    const owner = startNow ? (auth.membership?.displayName || auth.user.displayName) : ""
    const segment = await client.query(
      `INSERT INTO zt_segments(congregation_id,zipcode_id,page_start,page_end,owner,owner_user_id,status)
       VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING id`,
      [auth.congregation.id,zip.id,pageStart,pageEnd,owner,startNow ? auth.user.id : null,startNow ? "In progress" : "Not started"],
    )
    const created = await client.query(
      `INSERT INTO contact_packages(congregation_id,segment_id,uploaded_by_user_id,name,visibility,original_filename,contacts,contact_count)
       VALUES($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id`,
      [auth.congregation.id,segment.rows[0].id,auth.user.id,name,visibility,String(body?.originalFilename ?? "").trim().slice(0,255),JSON.stringify(contacts),contacts.length],
    )
    const packageId = Number(created.rows[0].id)
    let draft
    if (startNow) {
      draft = await replaceDraft(client, { userId: auth.user.id, congregationId: auth.congregation.id, contacts,
        zipcode, pageStart, pageEnd, expectedRevision: draftRevision })
    }
    await insertPackageAudit(client, { actorUserId: auth.user.id, congregationId: auth.congregation.id,
      action: startNow ? "contact_package.created_and_opened" : "contact_package.created", packageId,
      metadata: { visibility, zipcode, pageStart, pageEnd, contactCount: contacts.length } })
    const packageResult = await client.query(`${PACKAGE_SELECT} WHERE cp.id=$1 AND cp.congregation_id=$2`, [packageId,auth.congregation.id])
    await client.query("COMMIT")
    return NextResponse.json({ package: serializePackage(packageResult.rows[0],auth.user.id,canManageAll(auth)), ...(draft ? { draft } : {}) }, { status: 201 })
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined)
    if (error instanceof SegmentConflictError) {
      if (auditContext) await auditEvent({ ...auditContext, action: "contact_package.conflict_rejected", targetType: "segment", targetId: String(error.conflict.segmentId), metadata: { conflict: error.conflict } }).catch(() => undefined)
      return NextResponse.json({ error: error.message, conflict: error.conflict }, { status: 409 })
    }
    if (error instanceof DraftConflictError) return NextResponse.json({ error: error.message, server: error.server }, { status: 409 })
    return apiError(error)
  } finally { client.release() }
}
