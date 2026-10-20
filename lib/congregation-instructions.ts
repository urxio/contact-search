export type InstructionAudience = "everyone" | "admins"

export type CongregationInstruction = {
  id: number
  title: string
  body: string
  position: number
  revision: number
  audience: InstructionAudience
  createdAt?: string
  updatedAt?: string
}

export function validateInstructionText(value: unknown, maximum: number) {
  if (typeof value !== "string") return null
  const text = value.trim()
  return text.length > 0 && text.length <= maximum ? text : null
}

export function validateInstructionAudience(value: unknown): InstructionAudience | null {
  if (value === undefined) return "everyone"
  return value === "everyone" || value === "admins" ? value : null
}

/** Admin-only instructions are visible to congregation admins and platform admins. */
export function canSeeAdminInstructions(access: { user: { isPlatformAdmin?: boolean }; membership?: { role?: string } | null }) {
  return Boolean(access.user.isPlatformAdmin) || access.membership?.role === "admin"
}

export function serializeInstruction(row: any): CongregationInstruction {
  return {
    id: Number(row.id), title: String(row.title), body: String(row.body),
    position: Number(row.position), revision: Number(row.revision),
    audience: row.audience === "admins" ? "admins" : "everyone",
    createdAt: row.created_at ? new Date(row.created_at).toISOString() : undefined,
    updatedAt: row.updated_at ? new Date(row.updated_at).toISOString() : undefined,
  }
}
