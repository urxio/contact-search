export type ImportedSubmission = {
  userId: string
  contacts: Record<string, unknown>[]
  globalNotes: string
  territoryZipcode: string
  territoryPageRange: string
  submittedAt: string | null
  reviewStatus: "pending" | "in_review" | "reviewed"
  archived: boolean
}

const MAX_SUBMISSIONS = 100
const MAX_CONTACTS_PER_SUBMISSION = 10_000
const MAX_TEXT_LENGTH = 20_000

function text(value: unknown, maxLength = MAX_TEXT_LENGTH) {
  return typeof value === "string" ? value.trim().slice(0, maxLength) : ""
}

function object(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null
}

/** Parses admin submission downloads and Search Helper template exports. */
export function parseSubmissionImport(value: unknown, userIdOverride?: unknown): ImportedSubmission[] | null {
  if (userIdOverride !== undefined && typeof userIdOverride !== "string") return null
  const importedFor = text(userIdOverride, 255)
  if (userIdOverride !== undefined && !importedFor) return null
  const root = object(value)
  const entries = Array.isArray(value) ? value : Array.isArray(root?.submissions) ? root.submissions : [value]
  if (entries.length === 0 || entries.length > MAX_SUBMISSIONS) return null

  const parsed: ImportedSubmission[] = []
  for (const entry of entries) {
    const submission = object(entry)
    if (!submission || !Array.isArray(submission.contacts) || submission.contacts.length > MAX_CONTACTS_PER_SUBMISSION) return null
    const contacts = submission.contacts.map(object)
    // Search Helper template exports intentionally do not include a user. Keep
    // them identifiable in the queue without requiring an admin to edit JSON.
    const isTemplate = submission.exportDate !== undefined || submission.version !== undefined
    const userId = importedFor || text(submission.user_id ?? submission.userId, 255) || (isTemplate ? "Imported template" : "")
    if (!userId || contacts.some((contact) => !contact)) return null

    const reviewStatus = submission.review_status ?? submission.reviewStatus
    if (reviewStatus !== undefined && reviewStatus !== "pending" && reviewStatus !== "in_review" && reviewStatus !== "reviewed") return null
    if (submission.archived !== undefined && typeof submission.archived !== "boolean") return null

    const submittedAtValue = submission.submitted_at ?? submission.submittedAt ?? submission.exportDate
    const submittedAt = typeof submittedAtValue === "string" && !Number.isNaN(Date.parse(submittedAtValue))
      ? submittedAtValue
      : null
    parsed.push({
      userId,
      contacts: contacts as Record<string, unknown>[],
      globalNotes: text(submission.global_notes ?? submission.globalNotes),
      territoryZipcode: text(submission.territory_zipcode ?? submission.territoryZipcode, 64),
      territoryPageRange: text(submission.territory_page_range ?? submission.territoryPageRange, 128),
      submittedAt,
      reviewStatus: reviewStatus ?? "pending",
      archived: submission.archived ?? false,
    })
  }
  return parsed
}

export function submissionCounts(contacts: Record<string, unknown>[]) {
  const count = (status: string) => contacts.filter((contact) => contact.status === status).length
  return {
    contactCount: contacts.length,
    potentiallyFrench: count("Potentially French"),
    notFrench: count("Not French"),
    duplicate: count("Duplicate"),
    notChecked: count("Not checked"),
  }
}
