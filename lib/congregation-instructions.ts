export type CongregationInstruction = {
  id: number
  title: string
  body: string
  position: number
  revision: number
  createdAt?: string
  updatedAt?: string
}

export function validateInstructionText(value: unknown, maximum: number) {
  if (typeof value !== "string") return null
  const text = value.trim()
  return text.length > 0 && text.length <= maximum ? text : null
}

export function serializeInstruction(row: any): CongregationInstruction {
  return {
    id: Number(row.id), title: String(row.title), body: String(row.body),
    position: Number(row.position), revision: Number(row.revision),
    createdAt: row.created_at ? new Date(row.created_at).toISOString() : undefined,
    updatedAt: row.updated_at ? new Date(row.updated_at).toISOString() : undefined,
  }
}
