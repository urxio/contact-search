import { NextRequest, NextResponse } from "next/server"
import { pool } from "@/lib/db"
import { auditEvent, requireMembership, validateMutationOrigin } from "@/lib/auth"
import { normalizeSurname, parseCountries, validSurname } from "@/lib/surname-countries"
import { apiError, assertMultiTenantEnabled, type RouteContext } from "../../_shared"

type CacheRow = { surname: string; countries: string[]; source: "onograph" | "manual"; updated_at: Date }

const cacheHeaders = { "Cache-Control": "no-store" }
const selectEntry = `SELECT surname,countries,source,updated_at FROM surname_country_cache
  WHERE congregation_id=$1 AND surname=$2`

function serialize(row: CacheRow) {
  return { surname: row.surname, countries: row.countries, source: row.source, updatedAt: row.updated_at.toISOString() }
}

export async function GET(_req: NextRequest, { params }: RouteContext) {
  try {
    assertMultiTenantEnabled()
    const auth = await requireMembership(params.slug)
    const result = await pool.query<CacheRow>(
      `SELECT surname,countries,source,updated_at FROM surname_country_cache WHERE congregation_id=$1 ORDER BY surname`,
      [auth.congregation.id],
    )
    return NextResponse.json({ entries: result.rows.map(serialize), lookupAvailable: Boolean(process.env.ONOGRAPH_API_KEY) }, { headers: cacheHeaders })
  } catch (error) { return apiError(error) }
}

async function lookupOnoGraph(surname: string, key: string): Promise<string[]> {
  const url = new URL("https://ono.4b.rs/v1/jur")
  url.searchParams.set("key", key)
  url.searchParams.set("name", surname)
  url.searchParams.set("type", "surname")
  url.searchParams.set("limit", "3")
  const response = await fetch(url, { cache: "no-store", signal: AbortSignal.timeout(10000) })
  if (!response.ok) throw new Error(`OnoGraph returned HTTP ${response.status}`)
  const data = await response.json()
  if (data?.status?.some((item: { type?: string }) => item.type === "error")) {
    throw new Error("OnoGraph could not complete the surname lookup")
  }
  const jurisdictions = Array.isArray(data?.jurisdictions) ? data.jurisdictions : []
  return jurisdictions
    .filter((row: { jurisdiction?: unknown; incidence?: unknown }) =>
      typeof row.jurisdiction === "string" && row.jurisdiction.length <= 80 && Number(row.incidence) > 0)
    .sort((a: { incidence: string }, b: { incidence: string }) => Number(b.incidence) - Number(a.incidence))
    .slice(0, 3)
    .map((row: { jurisdiction: string }) => row.jurisdiction)
}

export async function POST(req: NextRequest, { params }: RouteContext) {
  try {
    assertMultiTenantEnabled()
    validateMutationOrigin(req)
    const auth = await requireMembership(params.slug)
    const body = await req.json()
    const surname = normalizeSurname(body?.surname)
    if (!validSurname(surname)) return NextResponse.json({ error: "A valid surname is required." }, { status: 400 })

    if (body?.action === "save") {
      const countries = parseCountries(body?.countries)
      if (!countries) return NextResponse.json({ error: "Enter one to three distinct countries." }, { status: 400 })
      const result = await pool.query<CacheRow>(
        `INSERT INTO surname_country_cache(congregation_id,surname,countries,source,updated_by_user_id)
         VALUES($1,$2,$3,'manual',$4)
         ON CONFLICT(congregation_id,surname) DO UPDATE SET
           countries=EXCLUDED.countries,source='manual',updated_by_user_id=EXCLUDED.updated_by_user_id,updated_at=NOW()
         RETURNING surname,countries,source,updated_at`,
        [auth.congregation.id, surname, countries, auth.user.id],
      )
      await auditEvent({ actorUserId: auth.user.id, congregationId: auth.congregation.id,
        action: "surname_country.saved", targetType: "surname", targetId: surname })
      return NextResponse.json({ entry: serialize(result.rows[0]) }, { headers: cacheHeaders })
    }

    if (body?.action !== "lookup") return NextResponse.json({ error: "Unknown action." }, { status: 400 })
    const cached = await pool.query<CacheRow>(selectEntry, [auth.congregation.id, surname])
    if (cached.rows[0]) return NextResponse.json({ entry: serialize(cached.rows[0]) }, { headers: cacheHeaders })

    const key = process.env.ONOGRAPH_API_KEY
    if (!key) return NextResponse.json({ entry: null, lookupAvailable: false }, { headers: cacheHeaders })
    let countries: string[]
    try { countries = await lookupOnoGraph(surname, key) }
    catch { return NextResponse.json({ error: "OnoGraph lookup is unavailable. You can still check Forebears manually." }, { status: 502 }) }
    await pool.query(
      `INSERT INTO surname_country_cache(congregation_id,surname,countries,source)
       VALUES($1,$2,$3,'onograph') ON CONFLICT(congregation_id,surname) DO NOTHING`,
      [auth.congregation.id, surname, countries],
    )
    const result = await pool.query<CacheRow>(selectEntry, [auth.congregation.id, surname])
    return NextResponse.json({ entry: serialize(result.rows[0]) }, { headers: cacheHeaders })
  } catch (error) { return apiError(error) }
}
