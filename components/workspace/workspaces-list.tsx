"use client"

import Link from "next/link"
import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { ArrowRight, Building2, ShieldCheck, UsersRound } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Card, CardContent } from "@/components/ui/card"
import { CongregationMark } from "./congregation-mark"
import { EmptyState } from "./empty-state"
import type { WorkspaceSummary } from "./types"

type SessionPayload = {
  memberships?: Array<{
    name?: string
    congregationName?: string
    congregation_name?: string
    slug: string
    role: "member" | "admin"
  }>
}

export function WorkspacesList() {
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [workspaces, setWorkspaces] = useState<WorkspaceSummary[]>([])

  useEffect(() => {
    fetch("/api/auth/session", { cache: "no-store" })
      .then((response) => (response.ok ? response.json() : null))
      .then((data: SessionPayload | null) => {
        const memberships = data?.memberships ?? []
        const nextWorkspaces = memberships.map((membership) => ({
            name: membership.name ?? membership.congregationName ?? membership.congregation_name ?? membership.slug,
            slug: membership.slug,
            role: membership.role,
          }))
        setWorkspaces(nextWorkspaces)
        if (nextWorkspaces.length === 1) router.replace(`/c/${nextWorkspaces[0].slug}`)
      })
      .catch(() => setWorkspaces([]))
      .finally(() => setLoading(false))
  }, [router])

  if (loading) {
    return (
      <div className="grid gap-4 sm:grid-cols-2" aria-label="Loading congregations" aria-busy="true">
        {[0, 1].map((item) => (
          <div key={item} className="h-32 animate-pulse rounded-2xl bg-muted" />
        ))}
      </div>
    )
  }

  if (!workspaces.length) {
    return (
      <EmptyState
        icon={UsersRound}
        title="No congregation memberships yet"
        description="Ask a congregation administrator for a private invitation link. Your congregations will appear here after you accept one."
      />
    )
  }

  return (
    <div className="grid gap-4 sm:grid-cols-2">
      {workspaces.map((workspace) => (
        <Link key={workspace.slug} href={`/c/${workspace.slug}`} className="group rounded-2xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2">
          <Card className="admin-card h-full rounded-2xl group-hover:-translate-y-px">
            <CardContent className="flex min-h-32 items-center gap-4 p-6">
              <CongregationMark name={workspace.name} className="h-12 w-12 text-base" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-base font-semibold">{workspace.name}</p>
                <Badge variant="secondary" className="mt-2 gap-1.5 rounded-lg capitalize">
                  {workspace.role === "admin" ? <ShieldCheck className="h-3 w-3" aria-hidden="true" /> : <Building2 className="h-3 w-3" aria-hidden="true" />}
                  {workspace.role}
                </Badge>
              </div>
              <ArrowRight className="h-5 w-5 text-muted-foreground transition-transform duration-150 ease-out group-hover:translate-x-1" aria-hidden="true" />
            </CardContent>
          </Card>
        </Link>
      ))}
    </div>
  )
}
