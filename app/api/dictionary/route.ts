import { NextResponse } from "next/server"

import { ensureSchema } from "@/lib/db"
import { listDictionaryNames } from "@/lib/dictionary"

export const dynamic = "force-dynamic"

export async function GET() {
  try {
    await ensureSchema()
    const lines = await listDictionaryNames()
    return NextResponse.json(
      { lines, count: lines.length },
      { headers: { "Cache-Control": "no-store" } },
    )
  } catch (error) {
    console.error("Dictionary fetch error:", error)
    return NextResponse.json({ error: "The dictionary is temporarily unavailable." }, { status: 500 })
  }
}
