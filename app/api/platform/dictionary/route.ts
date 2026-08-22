import { NextRequest, NextResponse } from "next/server"
import { auditEvent, requirePlatformAdmin, validateMutationOrigin } from "@/lib/auth"
import { applyDictionaryChanges, listDictionaryNames, normalizeDictionaryNames } from "@/lib/dictionary"
import { apiError, assertMultiTenantEnabled } from "../../c/_shared"

export async function GET() {
  try {
    assertMultiTenantEnabled()
    await requirePlatformAdmin()
    const lines = await listDictionaryNames()
    return NextResponse.json({ lines, count: lines.length })
  } catch (error) {
    return apiError(error)
  }
}

export async function POST(req: NextRequest) {
  try {
    assertMultiTenantEnabled()
    validateMutationOrigin(req)
    const user = await requirePlatformAdmin()
    const body = await req.json()
    const action = body.action === "add" ? "add" : body.action === "remove" ? "remove" : null
    const rawNames: unknown[] = Array.isArray(body.names) ? body.names : [body.name]
    const names = normalizeDictionaryNames(rawNames)
    if (!action || names.length === 0) {
      return NextResponse.json({ error: "A valid action and at least one name are required." }, { status: 400 })
    }
    const changed = await applyDictionaryChanges(action, names, user.id)
    if (changed.length === 0) return NextResponse.json({ success: true, applied: [] })
    await auditEvent({ actorUserId: user.id, action: `dictionary.${action}`,
      targetType: "dictionary", metadata: { names: changed } })
    return NextResponse.json({ success: true, applied: changed })
  } catch (error) {
    return apiError(error)
  }
}
