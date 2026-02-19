import { NextRequest, NextResponse } from "next/server"
import { pool, ensureSchema } from "@/lib/db"

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const {
      userId,
      contacts,
      globalNotes,
      territoryZipcode,
      territoryPageRange,
    } = body

    if (!userId || !contacts || !Array.isArray(contacts)) {
      return NextResponse.json(
        { error: "Missing required fields: userId and contacts" },
        { status: 400 }
      )
    }

    // Ensure the table exists (idempotent)
    await ensureSchema()

    // Compute summary stats
    const contactCount = contacts.length
    const potentiallyFrench = contacts.filter(
      (c: any) => c.status === "Potentially French"
    ).length
    const notFrench = contacts.filter(
      (c: any) => c.status === "Not French"
    ).length
    const duplicate = contacts.filter(
      (c: any) => c.status === "Duplicate"
    ).length
    const notChecked = contacts.filter(
      (c: any) => c.status === "Not checked"
    ).length

    await pool.query(
      `INSERT INTO submissions
        (user_id, contact_count, potentially_french, not_french, duplicate, not_checked,
         global_notes, territory_zipcode, territory_page_range, contacts)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
      [
        userId,
        contactCount,
        potentiallyFrench,
        notFrench,
        duplicate,
        notChecked,
        globalNotes ?? "",
        territoryZipcode ?? "",
        territoryPageRange ?? "",
        JSON.stringify(contacts),
      ]
    )

    return NextResponse.json({ success: true })
  } catch (err: any) {
    console.error("Submission error:", err)
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    )
  }
}
