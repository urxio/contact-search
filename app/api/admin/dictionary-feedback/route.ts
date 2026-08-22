import { NextRequest, NextResponse } from "next/server"
import { cookies } from "next/headers"
import { pool, ensureSchema } from "@/lib/db"
import { applyDictionaryChanges, getDictionarySet, normalizeDictionaryNames } from "@/lib/dictionary"
import { normalizeName } from "@/utils/french-name-detection"

function requireAdmin(): NextResponse | null {
  const cookieStore = cookies()
  const adminSession = cookieStore.get("admin_session")
  if (adminSession?.value !== process.env.ADMIN_PASSWORD) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }
  return null
}

// GET — two simple, actionable lists:
//   addCandidates    — surnames from "Potentially French" contacts that
//                       aren't in the dictionary yet (need adding)
//   removeCandidates — surnames from contacts explicitly marked "Not French"
//                       that are currently in the dictionary (need removing)
// Anything already consistent with the dictionary is left out entirely.
export async function GET() {
  const unauthorized = requireAdmin()
  if (unauthorized) return unauthorized

  try {
    await ensureSchema()

    const [potentiallyFrenchResult, notFrenchResult, dismissedResult] = await Promise.all([
      pool.query(`
        SELECT c->>'lastName' AS last_name, c->>'fullName' AS full_name, s.submitted_at
        FROM submissions s, jsonb_array_elements(s.contacts) c
        WHERE c->>'status' = 'Potentially French' AND s.archived = FALSE
      `),
      pool.query(`
        SELECT c->>'lastName' AS last_name, c->>'fullName' AS full_name, s.submitted_at
        FROM submissions s, jsonb_array_elements(s.contacts) c
        WHERE c->>'nameFeedback' = 'not-french' AND s.archived = FALSE
      `),
      pool.query(`SELECT name, list, dismissed_at FROM dismissed_name_feedback`),
    ])

    // A name is dismissed only until a fresh vote arrives after the
    // dismissal — so it resurfaces if someone flags it again later.
    const dismissed = {
      add: new Map<string, Date>(),
      remove: new Map<string, Date>(),
    }
    for (const row of dismissedResult.rows) {
      dismissed[row.list as "add" | "remove"].set(row.name, new Date(row.dismissed_at))
    }

    const tallyNames = (rows: { last_name: string | null; full_name: string | null; submitted_at: string }[]) => {
      const tally = new Map<string, { count: number; latestVoteAt: Date }>()
      for (const row of rows) {
        const name = normalizeName(row.last_name || row.full_name || "")
        if (!name) continue
        const votedAt = new Date(row.submitted_at)
        const existing = tally.get(name)
        if (existing) {
          existing.count++
          if (votedAt > existing.latestVoteAt) existing.latestVoteAt = votedAt
        } else {
          tally.set(name, { count: 1, latestVoteAt: votedAt })
        }
      }
      return tally
    }

    const potentiallyFrenchTally = tallyNames(potentiallyFrenchResult.rows)
    const notFrenchTally = tallyNames(notFrenchResult.rows)

    const dictionarySet = await getDictionarySet()

    const isSuppressed = (list: "add" | "remove", name: string, latestVoteAt: Date) => {
      const dismissedAt = dismissed[list].get(name)
      return dismissedAt !== undefined && latestVoteAt <= dismissedAt
    }

    const addCandidates = Array.from(potentiallyFrenchTally.entries())
      .filter(([name, { latestVoteAt }]) => !dictionarySet.has(name) && !isSuppressed("add", name, latestVoteAt))
      .map(([name, { count }]) => ({ name, count }))
      .sort((a, b) => b.count - a.count)

    const removeCandidates = Array.from(notFrenchTally.entries())
      .filter(([name, { latestVoteAt }]) => dictionarySet.has(name) && !isSuppressed("remove", name, latestVoteAt))
      .map(([name, { count }]) => ({ name, count }))
      .sort((a, b) => b.count - a.count)

    return NextResponse.json({ addCandidates, removeCandidates, dictionaryError: null })
  } catch (err: any) {
    console.error("Dictionary feedback fetch error:", err)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

// POST — apply one or more add/remove changes to the shared platform
// dictionary, or dismiss name(s) from one suggestion list.
// Body: { name?: string, names?: string[], action: "add" | "remove" | "dismiss", list?: "add" | "remove" }
// `list` is required when action is "dismiss" — it says which list to hide the name(s) from.
export async function POST(req: NextRequest) {
  const unauthorized = requireAdmin()
  if (unauthorized) return unauthorized

  try {
    await ensureSchema()
    const body = await req.json()
    const action = body?.action

    const rawNames: unknown[] = Array.isArray(body?.names) ? body.names : [body?.name]
    const names = normalizeDictionaryNames(rawNames)

    if (names.length === 0) {
      return NextResponse.json({ error: "No valid names provided" }, { status: 400 })
    }

    if (action === "dismiss") {
      const list = body?.list
      if (list !== "add" && list !== "remove") {
        return NextResponse.json({ error: "Invalid list" }, { status: 400 })
      }
      await ensureSchema()
      await Promise.all(
        names.map((name) =>
          // Re-dismissing an already-dismissed (and since resurfaced) name
          // refreshes dismissed_at, so it takes new votes since THIS
          // dismissal to bring it back again.
          pool.query(
            `INSERT INTO dismissed_name_feedback (name, list, dismissed_at) VALUES ($1, $2, NOW())
             ON CONFLICT (name, list) DO UPDATE SET dismissed_at = NOW()`,
            [name, list],
          ),
        ),
      )
      return NextResponse.json({ success: true, applied: names })
    }

    if (action !== "add" && action !== "remove") {
      return NextResponse.json({ error: "Invalid action" }, { status: 400 })
    }

    const changedNames = await applyDictionaryChanges(action, names)
    return NextResponse.json({ success: true, applied: changedNames })
  } catch (err: any) {
    console.error("Dictionary feedback apply error:", err)
    return NextResponse.json({ error: err?.message ?? "Internal server error" }, { status: 500 })
  }
}
