"use client"

import { useEffect, useMemo, useState } from "react"

import { WorkspaceShell } from "./workspace-shell"
import { WorkspaceRuntimeProvider } from "./workspace-context"
import type { WorkspaceAccount, WorkspaceSummary } from "./types"

type SessionPayload = {
  user?: {
    displayName?: string
    display_name?: string
    email?: string
    isPlatformAdmin?: boolean
    is_platform_admin?: boolean
  }
  memberships?: Array<{
    name?: string
    congregationName?: string
    congregation_name?: string
    slug: string
    role: "member" | "admin"
  }>
}

type WorkspaceShellLoaderProps = {
  slug: string
  fallbackName: string
  children: React.ReactNode
}

export function WorkspaceShellLoader({ slug, fallbackName, children }: WorkspaceShellLoaderProps) {
  const [session, setSession] = useState<SessionPayload | null>(null)

  useEffect(() => {
    let active = true
    fetch("/api/auth/session", { cache: "no-store" })
      .then((response) => (response.ok ? response.json() : null))
      .then((payload) => {
        if (active && payload) setSession(payload)
      })
      .catch(() => undefined)

    return () => {
      active = false
    }
  }, [])

  const workspaces = useMemo<WorkspaceSummary[]>(() => {
    if (!session?.memberships?.length) {
      return [{ name: fallbackName, slug, role: "member" }]
    }
    return session.memberships.map((membership) => ({
      name:
        membership.name ??
        membership.congregationName ??
        membership.congregation_name ??
        membership.slug,
      slug: membership.slug,
      role: membership.role,
    }))
  }, [fallbackName, session, slug])

  const activeWorkspace =
    workspaces.find((workspace) => workspace.slug === slug) ??
    ({ name: fallbackName, slug, role: "member" } satisfies WorkspaceSummary)

  const account: WorkspaceAccount | undefined = session?.user
    ? {
        displayName: session.user.displayName ?? session.user.display_name ?? "Workspace member",
        email: session.user.email,
        isPlatformAdmin: session.user.isPlatformAdmin ?? session.user.is_platform_admin,
      }
    : undefined

  return (
    <WorkspaceRuntimeProvider slug={slug}>
      <WorkspaceShell activeWorkspace={activeWorkspace} workspaces={workspaces} account={account}>
        {children}
      </WorkspaceShell>
    </WorkspaceRuntimeProvider>
  )
}
