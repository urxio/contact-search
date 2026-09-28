import { NextRequest, NextResponse } from "next/server"
import { auditEvent, requirePlatformAdmin, validateMutationOrigin } from "@/lib/auth"
import { pool } from "@/lib/db"
import { normalizeSurname, validSurname } from "@/lib/surname-origins"
import { apiError, assertMultiTenantEnabled } from "../../c/_shared"

type OriginRow = {
  surname: string
  origins: Array<{ country: string; explanation: string; sources: Array<{ title: string; url: string }> }>
  updated_at: Date
  reviewed_at: Date | null
}
type ContactRow = { surname: string; congregation_name: string; contact_name: string }

const headers = { "Cache-Control": "no-store" }

export async function GET() {
  try {
    assertMultiTenantEnabled()
    await requirePlatformAdmin()
    const [entries, contacts] = await Promise.all([
      pool.query<OriginRow>(`SELECT surname,origins,updated_at,reviewed_at FROM platform_surname_origin_cache
        WHERE origins='[]'::jsonb OR reviewed_at IS NOT NULL ORDER BY reviewed_at NULLS FIRST,updated_at DESC,surname`),
      pool.query<ContactRow>(`SELECT r.surname,c.name AS congregation_name,r.contact_name
        FROM platform_surname_origin_review_contacts r
        JOIN congregations c ON c.id=r.congregation_id
        JOIN platform_surname_origin_cache o ON o.surname=r.surname
        WHERE o.origins='[]'::jsonb OR o.reviewed_at IS NOT NULL
        ORDER BY r.surname,r.contact_name`),
    ])
    const people = new Map<string, Array<{ name: string; congregation: string }>>()
    for (const contact of contacts.rows) {
      const matches = people.get(contact.surname) ?? []
      matches.push({ name: contact.contact_name, congregation: contact.congregation_name })
      people.set(contact.surname, matches)
    }
    return NextResponse.json({ entries: entries.rows.map((row) => ({
      surname: row.surname, origins: row.origins, researchedAt: row.updated_at.toISOString(),
      reviewedAt: row.reviewed_at?.toISOString() ?? null, contacts: people.get(row.surname) ?? [],
    })) }, { headers })
  } catch (error) { return apiError(error) }
}

export async function POST(req: NextRequest) {
  try {
    assertMultiTenantEnabled()
    validateMutationOrigin(req)
    const user = await requirePlatformAdmin()
    const body = await req.json()
    const surname = normalizeSurname(body?.surname)
    const country = typeof body?.country === "string" ? body.country.trim().replace(/\s+/g, " ") : ""
    if (!validSurname(surname) || !country || country.length > 80 || /[\u0000-\u001f\u007f-\u009f]/.test(country)) {
      return NextResponse.json({ error: "A valid surname and country are required." }, { status: 400, headers })
    }
    const origins = [{ country, explanation: "Set by the platform owner after manual review.", sources: [] }]
    const result = await pool.query<OriginRow>(`UPDATE platform_surname_origin_cache
      SET origins=$1::jsonb,updated_at=NOW(),reviewed_at=NOW(),reviewed_by_user_id=$2
      WHERE surname=$3 AND (origins='[]'::jsonb OR reviewed_at IS NOT NULL)
      RETURNING surname,origins,updated_at,reviewed_at`, [JSON.stringify(origins), user.id, surname])
    if (!result.rows[0]) return NextResponse.json({ error: "This surname is no longer awaiting manual review." }, { status: 409, headers })
    await auditEvent({ actorUserId: user.id, action: "surname_origin.manual_country_set",
      targetType: "surname", targetId: surname, metadata: { country } })
    return NextResponse.json({ entry: {
      surname, origins, researchedAt: result.rows[0].updated_at.toISOString(),
      reviewedAt: result.rows[0].reviewed_at?.toISOString() ?? null,
    } }, { headers })
  } catch (error) { return apiError(error) }
}
