import { NextRequest, NextResponse } from "next/server"

import { auditEvent, requireCongregationAdmin, validateMutationOrigin } from "@/lib/auth"
import { pool } from "@/lib/db"
import { parseTerritoryZipWorkbook, UNASSIGNED_AREA } from "@/lib/territory-zip-import"
import { apiError, assertMultiTenantEnabled, RouteContext } from "../../../_shared"

type ExistingZip = { id: number; city: string; zipcode: string; area: string; totalPages: number }

async function loadTerritoryZipState(congregationId: number) {
  const [congregation, teamRows] = await Promise.all([
    pool.query(`SELECT settings FROM congregations WHERE id = $1`, [congregationId]),
    pool.query(
      `SELECT id, city, zipcode, territory AS area, total_pages AS "totalPages"
       FROM zt_zipcodes WHERE congregation_id = $1 ORDER BY zipcode`,
      [congregationId],
    ),
  ])
  const settings = congregation.rows[0]?.settings ?? {}
  const coverage = Array.isArray(settings.searchTerritoryZipcodes)
    ? settings.searchTerritoryZipcodes.map(String)
    : []
  const teamByZip = new Map<string, ExistingZip>(teamRows.rows.map((row) => [row.zipcode, {
    id: Number(row.id), city: row.city, zipcode: row.zipcode, area: row.area, totalPages: Number(row.totalPages),
  }]))
  const zipcodes = Array.from(new Set([...coverage, ...teamByZip.keys()])).sort()
  return {
    rows: zipcodes.map((zipcode) => {
      const team = teamByZip.get(zipcode)
      return {
        id: team?.id ?? null,
        zipcode,
        city: team?.city ?? "",
        area: team?.area ?? "",
        totalPages: team?.totalPages ?? null,
        inCoverage: coverage.includes(zipcode),
        inTeamProgress: !!team,
      }
    }),
    areas: Array.from(new Set(teamRows.rows.map((row) => String(row.area)).filter(Boolean))).sort(),
    coverage,
    teamByZip,
  }
}

export async function GET(_req: NextRequest, { params }: RouteContext) {
  try {
    assertMultiTenantEnabled()
    const auth = await requireCongregationAdmin(params.slug)
    const state = await loadTerritoryZipState(auth.congregation.id)
    return NextResponse.json({ rows: state.rows, areas: state.areas })
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
    if (!(file instanceof File)) return NextResponse.json({ error: "Choose an Excel file." }, { status: 400 })
    if (file.size > 5 * 1024 * 1024) return NextResponse.json({ error: "Excel files must be 5 MB or smaller." }, { status: 413 })
    if (!/\.(xlsx|xls)$/i.test(file.name)) return NextResponse.json({ error: "Choose an .xlsx or .xls file." }, { status: 400 })

    let parsed
    try {
      parsed = parseTerritoryZipWorkbook(Buffer.from(await file.arrayBuffer()))
    } catch (error) {
      return NextResponse.json({ error: error instanceof Error ? error.message : "The Excel file could not be read." }, { status: 400 })
    }
    const state = await loadTerritoryZipState(auth.congregation.id)
    const rows = parsed.map((row) => {
      if (row.error) return { ...row, status: "invalid" as const }
      const existing = state.teamByZip.get(row.zipcode)
      if (!existing) return { ...row, status: "new" as const, decision: "create" as const }
      const matches = existing.city.toLocaleLowerCase() === row.city.toLocaleLowerCase()
        && existing.area.toLocaleLowerCase() === row.area.toLocaleLowerCase()
      return {
        ...row,
        status: matches ? "unchanged" as const : "conflict" as const,
        decision: "keep" as const,
        existing: { city: existing.city, area: existing.area, totalPages: existing.totalPages },
      }
    })
    return NextResponse.json({ rows, areas: state.areas })
  } catch (error) {
    return apiError(error)
  }
}

export async function PUT(req: NextRequest, { params }: RouteContext) {
  try {
    assertMultiTenantEnabled()
    validateMutationOrigin(req)
    const auth = await requireCongregationAdmin(params.slug)
    const body = await req.json()
    const source = body?.source === "manual" ? "manual" : "excel"
    const rawRows = Array.isArray(body?.rows) ? body.rows : []
    if (rawRows.length < 1 || rawRows.length > 2_000) {
      return NextResponse.json({ error: "Provide between 1 and 2,000 ZIP mappings." }, { status: 400 })
    }
    const rows: Array<{ zipcode: string; city: string; area: string; decision: string; totalPages: number | null }> = rawRows.map((row: any) => ({
      zipcode: String(row?.zipcode ?? "").trim(),
      city: String(row?.city ?? "").trim(),
      area: String(row?.area ?? "").trim() || UNASSIGNED_AREA,
      decision: String(row?.decision ?? "replace"),
      totalPages: row?.totalPages === undefined || row?.totalPages === null || row?.totalPages === ""
        ? null : Number(row.totalPages),
    }))
    if (rows.some((row) => !/^\d{5}$/.test(row.zipcode) || !row.city || row.city.length > 100 || row.area.length > 100
      || !["create", "keep", "replace"].includes(row.decision)
      || (row.totalPages !== null && (!Number.isSafeInteger(row.totalPages) || row.totalPages < 1)))) {
      return NextResponse.json({ error: "Every mapping needs a five-digit ZIP, city, area, and valid decision." }, { status: 400 })
    }
    if (new Set(rows.map((row) => row.zipcode)).size !== rows.length) {
      return NextResponse.json({ error: "Each ZIP may appear only once." }, { status: 400 })
    }

    const client = await pool.connect()
    let created = 0
    let updated = 0
    let kept = 0
    try {
      await client.query("BEGIN")
      const congregation = await client.query(`SELECT settings FROM congregations WHERE id = $1 FOR UPDATE`, [auth.congregation.id])
      const settings = congregation.rows[0]?.settings ?? {}
      const coverage = new Set<string>(Array.isArray(settings.searchTerritoryZipcodes)
        ? settings.searchTerritoryZipcodes.map(String)
        : [])

      for (const row of rows) {
        coverage.add(row.zipcode)
        const existing = await client.query(
          `SELECT id, city, territory, total_pages FROM zt_zipcodes
           WHERE congregation_id = $1 AND zipcode = $2 FOR UPDATE`,
          [auth.congregation.id, row.zipcode],
        )
        if (row.decision === "keep") {
          if (!existing.rows[0]) throw new Error(`ZIP ${row.zipcode} changed since preview. Upload the file again.`)
          kept += 1
          continue
        }
        if (existing.rows[0]) {
          const sameMapping = existing.rows[0].city.toLocaleLowerCase() === row.city.toLocaleLowerCase()
            && existing.rows[0].territory.toLocaleLowerCase() === row.area.toLocaleLowerCase()
          const samePages = row.totalPages === null || Number(existing.rows[0].total_pages) === row.totalPages
          const same = sameMapping && samePages
          if (row.decision === "create" && !same) throw new Error(`ZIP ${row.zipcode} changed since preview. Upload the file again.`)
          if (!same) {
            if (row.totalPages !== null) {
              const usage = await client.query(
                `SELECT MAX(GREATEST(page_start, COALESCE(page_end,page_start), COALESCE(stopped_at_page,page_start)))::int AS max_page
                 FROM zt_segments WHERE congregation_id = $1 AND zipcode_id = $2`,
                [auth.congregation.id, existing.rows[0].id],
              )
              const maxPage = Number(usage.rows[0]?.max_page ?? 0)
              if (maxPage > row.totalPages) throw new Error(`ZIP ${row.zipcode} cannot be reduced below page ${maxPage}, which is already in use.`)
              await client.query(
                `UPDATE zt_zipcodes SET city = $3, territory = $4, total_pages = $5
                 WHERE congregation_id = $1 AND zipcode = $2`,
                [auth.congregation.id, row.zipcode, row.city, row.area, row.totalPages],
              )
            } else {
              await client.query(
                `UPDATE zt_zipcodes SET city = $3, territory = $4
                 WHERE congregation_id = $1 AND zipcode = $2`,
                [auth.congregation.id, row.zipcode, row.city, row.area],
              )
            }
            updated += 1
          } else kept += 1
        } else {
          await client.query(
            `INSERT INTO zt_zipcodes (congregation_id, city, zipcode, total_pages, territory)
             VALUES ($1,$2,$3,$4,$5)`,
            [auth.congregation.id, row.city, row.zipcode, row.totalPages ?? 0, row.area],
          )
          created += 1
        }
      }
      await client.query(
        `UPDATE congregations SET settings = settings || $2::jsonb, updated_at = NOW() WHERE id = $1`,
        [auth.congregation.id, JSON.stringify({ searchTerritoryZipcodes: Array.from(coverage).sort() })],
      )
      await client.query("COMMIT")
    } catch (error) {
      await client.query("ROLLBACK")
      if (error instanceof Error && (error.message.includes("changed since preview") || error.message.includes("cannot be reduced below"))) {
        return NextResponse.json({ error: error.message }, { status: 409 })
      }
      throw error
    } finally {
      client.release()
    }
    await auditEvent({
      actorUserId: auth.user.id,
      congregationId: auth.congregation.id,
      action: source === "manual" ? "team.zipcode.mapped" : "team.zipcodes.imported",
      targetType: "zipcode",
      targetId: source === "manual" ? rows[0].zipcode : undefined,
      metadata: { source, created, updated, kept, count: rows.length },
    })
    return NextResponse.json({ success: true, created, updated, kept, count: rows.length })
  } catch (error) {
    return apiError(error)
  }
}
