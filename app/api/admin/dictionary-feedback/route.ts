import { NextRequest, NextResponse } from "next/server"
import { cookies } from "next/headers"
import { pool, ensureSchema } from "@/lib/db"
import { getDictionaryFile, updateDictionaryFile } from "@/lib/github"
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
        SELECT c->>'lastName' AS last_name, c->>'fullName' AS full_name
        FROM submissions s, jsonb_array_elements(s.contacts) c
        WHERE c->>'status' = 'Potentially French' AND s.archived = FALSE
      `),
      pool.query(`
        SELECT c->>'lastName' AS last_name, c->>'fullName' AS full_name
        FROM submissions s, jsonb_array_elements(s.contacts) c
        WHERE c->>'nameFeedback' = 'not-french' AND s.archived = FALSE
      `),
      pool.query(`SELECT name, list FROM dismissed_name_feedback`),
    ])

    const dismissed = { add: new Set<string>(), remove: new Set<string>() }
    for (const row of dismissedResult.rows) {
      dismissed[row.list as "add" | "remove"].add(row.name)
    }

    const tallyNames = (rows: { last_name: string | null; full_name: string | null }[]) => {
      const counts = new Map<string, number>()
      for (const row of rows) {
        const name = normalizeName(row.last_name || row.full_name || "")
        if (!name) continue
        counts.set(name, (counts.get(name) ?? 0) + 1)
      }
      return counts
    }

    const potentiallyFrenchCounts = tallyNames(potentiallyFrenchResult.rows)
    const notFrenchCounts = tallyNames(notFrenchResult.rows)

    let dictionaryLines: string[] = []
    let dictionaryError: string | null = null
    try {
      const { lines } = await getDictionaryFile()
      dictionaryLines = lines
    } catch (err: any) {
      dictionaryError = err?.message ?? "Failed to load dictionary from GitHub"
    }
    const dictionarySet = new Set(dictionaryLines)

    const addCandidates = Array.from(potentiallyFrenchCounts.entries())
      .filter(([name]) => !dictionarySet.has(name) && !dismissed.add.has(name))
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count)

    const removeCandidates = Array.from(notFrenchCounts.entries())
      .filter(([name]) => dictionarySet.has(name) && !dismissed.remove.has(name))
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count)

    return NextResponse.json({ addCandidates, removeCandidates, dictionaryError })
  } catch (err: any) {
    console.error("Dictionary feedback fetch error:", err)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

// POST — apply one or more add/remove changes to the dictionary file as a
// SINGLE commit to GitHub, or permanently dismiss name(s) from one of the
// suggestion lists without touching the dictionary.
// Body: { name?: string, names?: string[], action: "add" | "remove" | "dismiss", list?: "add" | "remove" }
// `list` is required when action is "dismiss" — it says which list to hide the name(s) from.
export async function POST(req: NextRequest) {
  const unauthorized = requireAdmin()
  if (unauthorized) return unauthorized

  try {
    const body = await req.json()
    const action = body?.action

    const rawNames: unknown[] = Array.isArray(body?.names) ? body.names : [body?.name]
    const names = Array.from(new Set(rawNames.map((n) => normalizeName(String(n ?? "")))))
      .filter((n) => n && /^[a-z'-]+$/.test(n))

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
          pool.query(
            `INSERT INTO dismissed_name_feedback (name, list) VALUES ($1, $2) ON CONFLICT (name, list) DO NOTHING`,
            [name, list],
          ),
        ),
      )
      return NextResponse.json({ success: true, applied: names })
    }

    if (action !== "add" && action !== "remove") {
      return NextResponse.json({ error: "Invalid action" }, { status: 400 })
    }

    const { lines, sha } = await getDictionaryFile()
    const lineSet = new Set(lines)

    const changedNames =
      action === "add"
        ? names.filter((n) => !lineSet.has(n))
        : names.filter((n) => lineSet.has(n))

    if (changedNames.length === 0) {
      return NextResponse.json({ success: true, note: "No changes needed", applied: [] })
    }

    const updatedLines =
      action === "add"
        ? [...lines, ...changedNames].sort()
        : lines.filter((l) => !changedNames.includes(l))

    const verb = action === "add" ? "add" : "remove"
    const preposition = action === "add" ? "to" : "from"
    const commitMessage =
      changedNames.length === 1
        ? `chore: ${verb} "${changedNames[0]}" ${preposition} name dictionary (admin feedback)`
        : `chore: ${verb} ${changedNames.length} names ${preposition} name dictionary (admin feedback)\n\n${changedNames.join(", ")}`

    await updateDictionaryFile(updatedLines, sha, commitMessage)

    return NextResponse.json({ success: true, applied: changedNames })
  } catch (err: any) {
    console.error("Dictionary feedback apply error:", err)
    return NextResponse.json({ error: err?.message ?? "Internal server error" }, { status: 500 })
  }
}
