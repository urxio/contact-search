export type ActivityKind =
  | "joined" | "uploaded" | "uploaded_claimed" | "claimed" | "opened" | "assigned" | "released"
  | "claimed_pages" | "completed" | "status" | "submitted" | "zip_added"

export const ACTIVITY_FILTERS = {
  all: null,
  claims: ["uploaded_claimed", "claimed", "opened", "assigned", "released", "claimed_pages"],
  completed: ["completed"],
  uploads: ["uploaded", "uploaded_claimed", "zip_added"],
  submissions: ["submitted"],
  members: ["joined"],
} as const satisfies Record<string, readonly ActivityKind[] | null>

export type ActivityFilter = keyof typeof ACTIVITY_FILTERS

export function activityFilter(value: string | null): ActivityFilter {
  return value && value in ACTIVITY_FILTERS ? value as ActivityFilter : "all"
}

/** Claim-type events can be the first time anyone worked a ZIP code. */
export const CLAIM_KINDS: ReadonlySet<ActivityKind> = new Set(["uploaded_claimed", "claimed", "assigned", "claimed_pages"])

export type ActivityCursor = { at: string; key: string }

export function encodeCursor(cursor: ActivityCursor) {
  return Buffer.from(JSON.stringify(cursor)).toString("base64url")
}

export function decodeCursor(value: string | null): ActivityCursor | null {
  if (!value) return null
  try {
    const parsed = JSON.parse(Buffer.from(value, "base64url").toString("utf8"))
    return typeof parsed?.at === "string" && typeof parsed?.key === "string" && !Number.isNaN(Date.parse(parsed.at)) ? parsed : null
  } catch { return null }
}
