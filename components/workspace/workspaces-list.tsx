"use client"

import Link from "next/link"
import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { ArrowRight, Building2, ShieldCheck, UsersRound } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { CongregationMark } from "./congregation-mark"
import { EmptyState } from "./empty-state"
import type { WorkspaceSummary } from "./types"

type SessionPayload = {
  user?: {
    isPlatformAdmin?: boolean
    is_platform_admin?: boolean
    preferences?: {
      defaultWorkspaceView?: "search" | "team"
    }
  }
  memberships?: Array<{
    name?: string
    congregationName?: string
    congregation_name?: string
    slug: string
    role: "member" | "admin"
    supportAccess?: boolean
  }>
}

const viewSuffix = (view: "search" | "team") => view === "team" ? "/team" : ""

export function WorkspacesList() {
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [workspaces, setWorkspaces] = useState<WorkspaceSummary[]>([])
  const [isPlatformAdmin, setIsPlatformAdmin] = useState(false)
  const [defaultWorkspaceView, setDefaultWorkspaceView] = useState<"search" | "team">("search")

  useEffect(() => {
    fetch("/api/auth/session", { cache: "no-store" })
      .then((response) => (response.ok ? response.json() : null))
      .then((data: SessionPayload | null) => {
        const platformAdmin = data?.user?.isPlatformAdmin ?? data?.user?.is_platform_admin ?? false
        const preferredView = data?.user?.preferences?.defaultWorkspaceView ?? "search"
        const memberships = data?.memberships ?? []
        const nextWorkspaces = memberships.map((membership) => ({
            name: membership.name ?? membership.congregationName ?? membership.congregation_name ?? membership.slug,
            slug: membership.slug,
            role: membership.role,
            supportAccess: membership.supportAccess,
          }))
        setIsPlatformAdmin(platformAdmin)
        setDefaultWorkspaceView(preferredView)
        setWorkspaces(nextWorkspaces)
        if (!platformAdmin && nextWorkspaces.length === 1) {
          router.replace(`/c/${nextWorkspaces[0].slug}${viewSuffix(preferredView)}`)
        }
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

  if (!workspaces.length && !isPlatformAdmin) {
    return (
      <EmptyState
        icon={UsersRound}
        title="No congregation memberships yet"
        description="Ask a congregation administrator for a private invitation link. Your congregations will appear here after you accept one."
      />
    )
  }

  return (
    <div className="space-y-6">
      {isPlatformAdmin ? (
        <section className="admin-material flex flex-col gap-4 rounded-2xl p-6 sm:flex-row sm:items-center" aria-labelledby="platform-owner-heading">
          <div className="admin-icon-well flex h-12 w-12 shrink-0 items-center justify-center rounded-xl text-primary">
            <ShieldCheck className="h-6 w-6" aria-hidden="true" />
          </div>
          <div className="min-w-0 flex-1">
            <h2 id="platform-owner-heading" className="text-base font-semibold">Platform owner</h2>
            <p className="mt-1 text-sm font-normal leading-relaxed text-muted-foreground">
              Create congregations, manage the shared dictionary, or enter any workspace for audited support.
            </p>
          </div>
          <Button asChild className="admin-primary-button min-h-11 shrink-0 rounded-xl">
            <Link href="/platform">
              Open platform portal
              <ArrowRight aria-hidden="true" />
            </Link>
          </Button>
        </section>
      ) : null}

      {workspaces.length ? (
        <div className="grid gap-4 sm:grid-cols-2">
          {workspaces.map((workspace) => (
            <Link key={workspace.slug} href={`/c/${workspace.slug}${viewSuffix(defaultWorkspaceView)}`} className="group rounded-2xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2">
              <Card className="admin-card h-full rounded-2xl group-hover:-translate-y-px">
                <CardContent className="flex min-h-32 items-center gap-4 p-6">
                  <CongregationMark name={workspace.name} className="h-12 w-12 text-base" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-base font-semibold">{workspace.name}</p>
                    <Badge variant="secondary" className="mt-2 gap-1.5 rounded-lg capitalize">
                      {workspace.role === "admin" ? <ShieldCheck className="h-3 w-3" aria-hidden="true" /> : <Building2 className="h-3 w-3" aria-hidden="true" />}
                      {workspace.supportAccess ? "Support access" : workspace.role}
                    </Badge>
                  </div>
                  <ArrowRight className="h-5 w-5 text-muted-foreground transition-transform duration-150 ease-out group-hover:translate-x-1" aria-hidden="true" />
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      ) : (
        <EmptyState icon={Building2} title="No active congregations" description="Create the first private congregation from the platform portal." />
      )}
    </div>
  )
}
