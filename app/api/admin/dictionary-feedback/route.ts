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

// GET — aggregate per-contact nameFeedback AND "Potentially French" status
// across all submissions into a per-surname tally, and cross-reference
// against the live dictionary file.
export async function GET() {
  const unauthorized = requireAdmin()
  if (unauthorized) return unauthorized

  try {
    const [feedbackResult, statusResult] = await Promise.all([
      pool.query(`
        SELECT
          c->>'lastName'     AS last_name,
          c->>'fullName'     AS full_name,
          c->>'nameFeedback' AS feedback,
          s.user_id
        FROM submissions s, jsonb_array_elements(s.contacts) c
        WHERE c->>'nameFeedback' IS NOT NULL AND s.archived = FALSE
      `),
      pool.query(`
        SELECT
          c->>'lastName' AS last_name,
          c->>'fullName' AS full_name,
          s.user_id
        FROM submissions s, jsonb_array_elements(s.contacts) c
        WHERE c->>'status' = 'Potentially French' AND s.archived = FALSE
      `),
    ])

    const tally = new Map<
      string,
      { name: string; frenchVotes: number; notFrenchVotes: number; statusCount: number; voters: Set<string> }
    >()

    const getEntry = (name: string) => {
      if (!tally.has(name)) {
        tally.set(name, { name, frenchVotes: 0, notFrenchVotes: 0, statusCount: 0, voters: new Set() })
      }
      return tally.get(name)!
    }

    for (const row of feedbackResult.rows) {
      const name = normalizeName(row.last_name || row.full_name || "")
      if (!name) continue
      const entry = getEntry(name)
      if (row.feedback === "french") entry.frenchVotes++
      else if (row.feedback === "not-french") entry.notFrenchVotes++
      entry.voters.add(row.user_id)
    }

    for (const row of statusResult.rows) {
      const name = normalizeName(row.last_name || row.full_name || "")
      if (!name) continue
      const entry = getEntry(name)
      entry.statusCount++
      entry.voters.add(row.user_id)
    }

    let dictionaryLines: string[] = []
    let dictionaryError: string | null = null
    try {
      const { lines } = await getDictionaryFile()
      dictionaryLines = lines
    } catch (err: any) {
      // Surface the feedback tally even if GitHub isn't reachable/configured —
      // the admin can still see what's been flagged.
      dictionaryError = err?.message ?? "Failed to load dictionary from GitHub"
    }
    const dictionarySet = new Set(dictionaryLines)

    const items = Array.from(tally.values())
      .map((entry) => {
        const inDictionary = dictionarySet.has(entry.name)
        let suggestedAction: "add" | "remove" | null = null
        if (!inDictionary && (entry.frenchVotes > entry.notFrenchVotes || entry.statusCount > 0)) {
          suggestedAction = "add"
        } else if (inDictionary && entry.notFrenchVotes > entry.frenchVotes) {
          suggestedAction = "remove"
        }

        return {
          name: entry.name,
          frenchVotes: entry.frenchVotes,
          notFrenchVotes: entry.notFrenchVotes,
          statusCount: entry.statusCount,
          voterCount: entry.voters.size,
          inDictionary,
          suggestedAction,
        }
      })
      .sort((a, b) => (b.frenchVotes + b.notFrenchVotes + b.statusCount) - (a.frenchVotes + a.notFrenchVotes + a.statusCount))

    return NextResponse.json({ items, dictionaryError })
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
