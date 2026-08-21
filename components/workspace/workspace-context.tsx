"use client"

import { createContext, useContext } from "react"

type WorkspaceRuntime = {
  slug: string
  authenticatedUserId?: number
  authenticatedDisplayName?: string
  embedded?: boolean
}

const WorkspaceContext = createContext<WorkspaceRuntime | null>(null)

export function WorkspaceRuntimeProvider({
  slug,
  authenticatedUserId,
  authenticatedDisplayName,
  embedded = true,
  children,
}: WorkspaceRuntime & { children: React.ReactNode }) {
  return (
    <WorkspaceContext.Provider value={{ slug, authenticatedUserId, authenticatedDisplayName, embedded }}>
      {children}
    </WorkspaceContext.Provider>
  )
}

export function useWorkspaceRuntime() {
  return useContext(WorkspaceContext)
}
