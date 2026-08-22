import { NextRequest, NextResponse } from "next/server"
import { pool } from "@/lib/db"
import { auditEvent, requireCongregationAdmin, validateMutationOrigin } from "@/lib/auth"
import { applyDictionaryChanges, getDictionarySet, normalizeDictionaryNames } from "@/lib/dictionary"
import { normalizeName } from "@/utils/french-name-detection"
import { apiError, assertMultiTenantEnabled, RouteContext } from "../../../_shared"

type Vote = { last_name: string | null; full_name: string | null; submitted_at: string }

export async function GET(_req: NextRequest, { params }: RouteContext) {
  try {
    assertMultiTenantEnabled()
    const auth = await requireCongregationAdmin(params.slug)
    const [potentiallyFrench, notFrench, dismissed, dictionarySet] = await Promise.all([
      pool.query(
        `SELECT c->>'lastName' last_name, c->>'fullName' full_name, s.submitted_at
         FROM submissions s, jsonb_array_elements(s.contacts) c
         WHERE s.congregation_id = $1 AND s.archived = FALSE AND c->>'status' = 'Potentially French'`,
        [auth.congregation.id],
      ),
      pool.query(
        `SELECT c->>'lastName' last_name, c->>'fullName' full_name, s.submitted_at
         FROM submissions s, jsonb_array_elements(s.contacts) c
         WHERE s.congregation_id = $1 AND s.archived = FALSE AND c->>'nameFeedback' = 'not-french'`,
        [auth.congregation.id],
      ),
      pool.query(
        `SELECT name, list, dismissed_at FROM dismissed_name_feedback WHERE congregation_id = $1`,
        [auth.congregation.id],
      ),
      getDictionarySet(),
    ])
    const dismissedAt = new Map<string, Date>(dismissed.rows.map((row: any) => [`${row.list}:${row.name}`, new Date(row.dismissed_at)]))
    const tally = (rows: Vote[], list: "add" | "remove") => {
      const counts = new Map<string, { count: number; latest: Date }>()
      for (const row of rows) {
        const name = normalizeName(row.last_name || row.full_name || "")
        if (!name) continue
        const date = new Date(row.submitted_at)
        const old = counts.get(name)
        counts.set(name, { count: (old?.count || 0) + 1, latest: old && old.latest > date ? old.latest : date })
      }
      return Array.from(counts.entries())
        .filter(([name, value]) => {
          const dismissedDate = dismissedAt.get(`${list}:${name}`)
          return !dismissedDate || value.latest > dismissedDate
        })
    }
    const addCandidates = tally(potentiallyFrench.rows, "add")
      .filter(([name]) => !dictionarySet.has(name)).map(([name, value]) => ({ name, count: value.count }))
      .sort((a, b) => b.count - a.count)
    const removeCandidates = tally(notFrench.rows, "remove")
      .filter(([name]) => dictionarySet.has(name)).map(([name, value]) => ({ name, count: value.count }))
      .sort((a, b) => b.count - a.count)
    return NextResponse.json({ addCandidates, removeCandidates, dictionaryPlatformManaged: true })
  } catch (error) {
    return apiError(error)
  }
}

export async function POST(req: NextRequest, { params }: RouteContext) {
  try {
    assertMultiTenantEnabled()
    validateMutationOrigin(req)
    const auth = await requireCongregationAdmin(params.slug)
    const body = await req.json()
    const raw: unknown[] = Array.isArray(body.names) ? body.names : [body.name]
    const names = normalizeDictionaryNames(raw)
    if (!names.length) return NextResponse.json({ error: "No valid names provided." }, { status: 400 })
    if (body.action === "dismiss") {
      if (body.list !== "add" && body.list !== "remove") {
        return NextResponse.json({ error: "Choose which suggestion list to dismiss from." }, { status: 400 })
      }
      const client = await pool.connect()
      try {
        await client.query("BEGIN")
        for (const name of names) {
          await client.query(
            `INSERT INTO dismissed_name_feedback (congregation_id, name, list, dismissed_at)
             VALUES ($1,$2,$3,NOW()) ON CONFLICT (congregation_id, name, list)
             DO UPDATE SET dismissed_at = NOW()`,
            [auth.congregation.id, name, body.list],
          )
        }
        await client.query("COMMIT")
      } catch (error) {
        await client.query("ROLLBACK")
        throw error
      } finally {
        client.release()
      }
      await auditEvent({ actorUserId: auth.user.id, congregationId: auth.congregation.id,
        action: "dictionary_suggestion.dismissed", targetType: "dictionary_suggestion",
        metadata: { names, list: body.list } })
      return NextResponse.json({ success: true, applied: names })
    }
    if (body.action !== "add" && body.action !== "remove") {
      return NextResponse.json({ error: "Invalid action." }, { status: 400 })
    }
    const changed = await applyDictionaryChanges(body.action, names, auth.user.id)
    if (changed.length > 0) {
      await auditEvent({ actorUserId: auth.user.id, congregationId: auth.congregation.id,
        action: `dictionary.${body.action}`, targetType: "dictionary",
        metadata: { names: changed } })
    }
    return NextResponse.json({ success: true, applied: changed })
  } catch (error) {
    return apiError(error)
  }
}
