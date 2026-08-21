import { NextRequest, NextResponse } from "next/server"
import { auditEvent, requirePlatformAdmin, validateMutationOrigin } from "@/lib/auth"
import { getDictionaryFile, updateDictionaryFile } from "@/lib/github"
import { normalizeName } from "@/utils/french-name-detection"
import { apiError, assertMultiTenantEnabled } from "../../c/_shared"

export async function GET() {
  try {
    assertMultiTenantEnabled()
    await requirePlatformAdmin()
    const dictionary = await getDictionaryFile()
    return NextResponse.json({ lines: dictionary.lines, count: dictionary.lines.length })
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
    const names = Array.from(new Set(rawNames.map((name) => normalizeName(String(name ?? "")))))
      .filter((name) => name && /^[a-z'-]+(?:\s[a-z'-]+)*$/.test(name))
    if (!action || names.length === 0) {
      return NextResponse.json({ error: "A valid action and at least one name are required." }, { status: 400 })
    }
    const { lines, sha } = await getDictionaryFile()
    const current = new Set(lines)
    const changed = action === "add" ? names.filter((name) => !current.has(name)) : names.filter((name) => current.has(name))
    if (changed.length === 0) return NextResponse.json({ success: true, applied: [] })
    const updated = action === "add"
      ? [...lines, ...changed].sort()
      : lines.filter((name) => !changed.includes(name))
    await updateDictionaryFile(updated, sha, `chore: ${action} ${changed.length} surname${changed.length === 1 ? "" : "s"} (platform dictionary)`)
    await auditEvent({ actorUserId: user.id, action: `dictionary.${action}`,
      targetType: "dictionary", metadata: { names: changed } })
    return NextResponse.json({ success: true, applied: changed })
  } catch (error) {
    return apiError(error)
  }
}
