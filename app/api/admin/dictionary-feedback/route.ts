import { NextRequest, NextResponse } from "next/server"
import { cookies } from "next/headers"
import { pool } from "@/lib/db"
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
    const [potentiallyFrenchResult, notFrenchResult] = await Promise.all([
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
    ])

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
      .filter(([name]) => !dictionarySet.has(name))
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count)

    const removeCandidates = Array.from(notFrenchCounts.entries())
      .filter(([name]) => dictionarySet.has(name))
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count)

    return NextResponse.json({ addCandidates, removeCandidates, dictionaryError })
  } catch (err: any) {
    console.error("Dictionary feedback fetch error:", err)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

// POST — apply a single add/remove to the dictionary file via a direct
// commit to GitHub. Body: { name: string, action: "add" | "remove" }
export async function POST(req: NextRequest) {
  const unauthorized = requireAdmin()
  if (unauthorized) return unauthorized

  try {
    const body = await req.json()
    const action = body?.action
    const name = normalizeName(body?.name ?? "")

    if (!name || !/^[a-z'-]+$/.test(name)) {
      return NextResponse.json({ error: "Invalid name" }, { status: 400 })
    }
    if (action !== "add" && action !== "remove") {
      return NextResponse.json({ error: "Invalid action" }, { status: 400 })
    }

    const { lines, sha } = await getDictionaryFile()
    const exists = lines.includes(name)

    if (action === "add" && exists) {
      return NextResponse.json({ success: true, note: "Already in dictionary" })
    }
    if (action === "remove" && !exists) {
      return NextResponse.json({ success: true, note: "Already absent from dictionary" })
    }

    const updatedLines =
      action === "add"
        ? [...lines, name].sort()
        : lines.filter((l) => l !== name)

    await updateDictionaryFile(
      updatedLines,
      sha,
      `chore: ${action === "add" ? "add" : "remove"} "${name}" ${action === "add" ? "to" : "from"} name dictionary (admin feedback)`,
    )

    return NextResponse.json({ success: true })
  } catch (err: any) {
    console.error("Dictionary feedback apply error:", err)
    return NextResponse.json({ error: err?.message ?? "Internal server error" }, { status: 500 })
  }
}
