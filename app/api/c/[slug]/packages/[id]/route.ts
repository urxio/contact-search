import { NextRequest, NextResponse } from "next/server"
import { pool } from "@/lib/db"
import { auditEvent, requireMembership, validateMutationOrigin } from "@/lib/auth"
import { apiError, assertMultiTenantEnabled, canManageAll, integer } from "../../../_shared"
import {
  DraftConflictError, insertPackageAudit, PACKAGE_SELECT, replaceDraft, serializePackage,
  validatePackageName, validateVisibility,
} from "@/lib/contact-packages"
import { assertNoSegmentConflict, SegmentConflictError } from "@/lib/team-segments"

type Context = { params: { slug: string; id: string } }

async function lockedPackage(client: any, congregationId: number, id: number) {
  return client.query(`${PACKAGE_SELECT} WHERE cp.id=$1 AND cp.congregation_id=$2 FOR UPDATE OF cp,s`, [id,congregationId])
}

function canSee(row: any, userId: number, manageAll: boolean) {
  return manageAll || row.visibility === "shared" || Number(row.uploaded_by_user_id) === userId || Number(row.owner_user_id) === userId
}

async function currentPackage(client: any, congregationId: number, id: number, userId: number, manageAll: boolean) {
  const result = await client.query(`${PACKAGE_SELECT} WHERE cp.id=$1 AND cp.congregation_id=$2`, [id,congregationId])
  return result.rows[0] ? serializePackage(result.rows[0],userId,manageAll) : null
}

export async function POST(req: NextRequest, { params }: Context) {
  let auditContext: { actorUserId: number; congregationId: number } | null = null
  const client = await pool.connect()
  try {
    assertMultiTenantEnabled(); validateMutationOrigin(req)
    const auth = await requireMembership(params.slug)
    auditContext = { actorUserId: auth.user.id, congregationId: auth.congregation.id }
    const id = integer(params.id)
    if (!id) return NextResponse.json({ error: "Excel not found." }, { status: 404 })
    const body = await req.json()
    const action = String(body?.action ?? "")
    const manageAll = canManageAll(auth)
    await client.query("BEGIN")
    const result = await lockedPackage(client,auth.congregation.id,id)
    const row = result.rows[0]
    if (!row || !canSee(row,auth.user.id,manageAll)) { await client.query("ROLLBACK"); return NextResponse.json({ error: "Excel not found." }, { status: 404 }) }

    if (action === "open") {
      const revision = Number(body?.draftRevision)
      if (!Number.isSafeInteger(revision) || revision < 0) { await client.query("ROLLBACK"); return NextResponse.json({ error: "Draft revision is required." }, { status: 400 }) }
      if (row.status === "Completed") { await client.query("ROLLBACK"); return NextResponse.json({ error: "Completed Excels cannot be opened." }, { status: 409 }) }
      const ownerUserId = row.owner_user_id == null ? null : Number(row.owner_user_id)
      if (ownerUserId && ownerUserId !== auth.user.id && !manageAll) { await client.query("ROLLBACK"); return NextResponse.json({ error: "This Excel is assigned to another member." }, { status: 409 }) }
      await assertNoSegmentConflict(client,{congregationId:auth.congregation.id,zipcodeId:Number(row.zipcode_id),pageStart:Number(row.page_start),pageEnd:Number(row.page_end),excludeSegmentId:Number(row.segment_id)})
      const owner = auth.membership?.displayName || auth.user.displayName
      await client.query(`UPDATE zt_segments SET owner=$1,owner_user_id=$2,status='In progress',updated_at=NOW() WHERE id=$3 AND congregation_id=$4`, [owner,auth.user.id,row.segment_id,auth.congregation.id])
      const draft = await replaceDraft(client,{ userId:auth.user.id,congregationId:auth.congregation.id,contacts:row.contacts,
        zipcode:row.zipcode,pageStart:Number(row.page_start),pageEnd:Number(row.page_end),expectedRevision:revision })
      await insertPackageAudit(client,{actorUserId:auth.user.id,congregationId:auth.congregation.id,action:"contact_package.opened",packageId:id,
        metadata:{previousOwnerUserId:ownerUserId}})
      const packageData = await currentPackage(client,auth.congregation.id,id,auth.user.id,manageAll)
      await client.query("COMMIT")
      return NextResponse.json({ package: packageData, draft })
    }

    if (action === "assign") {
      if (!manageAll) { await client.query("ROLLBACK"); return NextResponse.json({ error: "Excel not found." }, { status: 404 }) }
      const userId = integer(body?.userId)
      if (!userId) { await client.query("ROLLBACK"); return NextResponse.json({ error: "Member is required." }, { status: 400 }) }
      const member = await client.query(`SELECT COALESCE(m.display_name,u.display_name) display_name FROM congregation_memberships m JOIN users u ON u.id=m.user_id WHERE m.congregation_id=$1 AND m.user_id=$2 AND m.status='active'`,[auth.congregation.id,userId])
      if (!member.rows[0]) { await client.query("ROLLBACK"); return NextResponse.json({ error: "Member not found." }, { status: 404 }) }
      await assertNoSegmentConflict(client,{congregationId:auth.congregation.id,zipcodeId:Number(row.zipcode_id),pageStart:Number(row.page_start),pageEnd:Number(row.page_end),excludeSegmentId:Number(row.segment_id)})
      await client.query(`UPDATE zt_segments SET owner=$1,owner_user_id=$2,status='Not started',stopped_at_page=NULL,notes='',updated_at=NOW() WHERE id=$3 AND congregation_id=$4`,[member.rows[0].display_name,userId,row.segment_id,auth.congregation.id])
      await insertPackageAudit(client,{actorUserId:auth.user.id,congregationId:auth.congregation.id,action:"contact_package.assigned",packageId:id,metadata:{assignedToUserId:userId}})
    } else if (action === "release") {
      const ownerUserId = row.owner_user_id == null ? null : Number(row.owner_user_id)
      if (!manageAll && ownerUserId !== auth.user.id && Number(row.uploaded_by_user_id) !== auth.user.id) { await client.query("ROLLBACK"); return NextResponse.json({ error: "Excel not found." }, { status: 404 }) }
      if (row.status === "Completed" && !manageAll) { await client.query("ROLLBACK"); return NextResponse.json({ error: "Only an admin can release completed work." }, { status: 409 }) }
      await client.query(`UPDATE zt_segments SET owner='',owner_user_id=NULL,status='Not started',stopped_at_page=NULL,notes='',updated_at=NOW() WHERE id=$1 AND congregation_id=$2`,[row.segment_id,auth.congregation.id])
      await insertPackageAudit(client,{actorUserId:auth.user.id,congregationId:auth.congregation.id,action:"contact_package.released",packageId:id,metadata:{previousOwnerUserId:ownerUserId}})
    } else {
      await client.query("ROLLBACK"); return NextResponse.json({ error: "Unknown Excel action." }, { status: 400 })
    }
    const packageData = await currentPackage(client,auth.congregation.id,id,auth.user.id,manageAll)
    await client.query("COMMIT")
    return NextResponse.json({ package: packageData })
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined)
    if(error instanceof SegmentConflictError){
      if(auditContext)await auditEvent({...auditContext,action:"contact_package.conflict_rejected",targetType:"segment",targetId:String(error.conflict.segmentId),metadata:{conflict:error.conflict}}).catch(()=>undefined)
      return NextResponse.json({error:error.message,conflict:error.conflict},{status:409})
    }
    if (error instanceof DraftConflictError) return NextResponse.json({error:error.message,server:error.server},{status:409})
    return apiError(error)
  } finally { client.release() }
}

export async function PATCH(req: NextRequest, { params }: Context) {
  const client = await pool.connect()
  try {
    assertMultiTenantEnabled(); validateMutationOrigin(req)
    const auth = await requireMembership(params.slug); const id=integer(params.id); const manageAll=canManageAll(auth)
    if(!id)return NextResponse.json({error:"Excel not found."},{status:404})
    const body=await req.json(); const fields:string[]=[]; const values:any[]=[]
    if(body?.name!==undefined){const name=validatePackageName(body.name);if(!name)return NextResponse.json({error:"Excel name is required."},{status:400});fields.push(`name=$${values.push(name)}`)}
    if(body?.visibility!==undefined){const visibility=validateVisibility(body.visibility);if(!visibility)return NextResponse.json({error:"Visibility is invalid."},{status:400});fields.push(`visibility=$${values.push(visibility)}`)}
    if(!fields.length)return NextResponse.json({error:"Nothing to update."},{status:400})
    await client.query("BEGIN")
    const locked=await lockedPackage(client,auth.congregation.id,id);const row=locked.rows[0]
    if(!row||(!manageAll&&Number(row.uploaded_by_user_id)!==auth.user.id)){await client.query("ROLLBACK");return NextResponse.json({error:"Excel not found."},{status:404})}
    values.push(id,auth.congregation.id)
    await client.query(`UPDATE contact_packages SET ${fields.join(",")},updated_at=NOW() WHERE id=$${values.length-1} AND congregation_id=$${values.length}`,values)
    await insertPackageAudit(client,{actorUserId:auth.user.id,congregationId:auth.congregation.id,action:"contact_package.updated",packageId:id,metadata:{fields:fields.map(f=>f.split("=")[0])}})
    const packageData=await currentPackage(client,auth.congregation.id,id,auth.user.id,manageAll);await client.query("COMMIT")
    return NextResponse.json({package:packageData})
  } catch(error){await client.query("ROLLBACK").catch(()=>undefined);return apiError(error)} finally{client.release()}
}

export async function DELETE(req: NextRequest, { params }: Context) {
  const client=await pool.connect()
  try{
    assertMultiTenantEnabled();validateMutationOrigin(req)
    const auth=await requireMembership(params.slug);const id=integer(params.id);const manageAll=canManageAll(auth)
    if(!id)return NextResponse.json({error:"Excel not found."},{status:404})
    await client.query("BEGIN");const locked=await lockedPackage(client,auth.congregation.id,id);const row=locked.rows[0]
    if(!row||(!manageAll&&Number(row.uploaded_by_user_id)!==auth.user.id)){await client.query("ROLLBACK");return NextResponse.json({error:"Excel not found."},{status:404})}
    const preservedSegment=!(row.status==="Not started"&&row.owner_user_id==null)
    await insertPackageAudit(client,{actorUserId:auth.user.id,congregationId:auth.congregation.id,action:"contact_package.deleted",packageId:id,metadata:{preservedSegment}})
    await client.query(`DELETE FROM contact_packages WHERE id=$1 AND congregation_id=$2`,[id,auth.congregation.id])
    if(!preservedSegment)await client.query(`DELETE FROM zt_segments WHERE id=$1 AND congregation_id=$2`,[row.segment_id,auth.congregation.id])
    await client.query("COMMIT");return NextResponse.json({success:true,preservedSegment})
  }catch(error){await client.query("ROLLBACK").catch(()=>undefined);return apiError(error)}finally{client.release()}
}
