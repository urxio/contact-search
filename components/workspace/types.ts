export type WorkspaceRole = "member" | "admin"

export type WorkspaceSummary = {
  name: string
  slug: string
  role: WorkspaceRole
  supportAccess?: boolean
}

export type WorkspaceAccount = {
  displayName: string
  email?: string
  isPlatformAdmin?: boolean
}
