import { notFound, redirect } from "next/navigation"
import { LayoutDashboard } from "lucide-react"

import { AdminSubnav } from "@/components/admin/admin-subnav"
import { AuthError, requireCongregationAdmin } from "@/lib/auth"

export default async function CongregationAdminLayout({ children, params }: { children: React.ReactNode; params: { slug: string } }) {
  try {
    await requireCongregationAdmin(params.slug)
  } catch (error) {
    if (error instanceof AuthError && error.status === 401) redirect(`/auth/sign-in?next=/c/${encodeURIComponent(params.slug)}/admin`)
    notFound()
  }

  // Wrapped twice so the shell's legacy `div > nav:first-of-type` hiding rule never matches the sub-tabs.
  return (
    <div>
      <div className="mx-auto max-w-7xl px-4 pt-8 sm:px-6 lg:px-8">
        <div className="mb-5 flex items-center gap-3">
          <div className="admin-icon-well flex h-11 w-11 items-center justify-center rounded-2xl text-primary">
            <LayoutDashboard className="h-5 w-5" aria-hidden="true" />
          </div>
          <div>
            <h1 className="text-2xl font-bold leading-tight tracking-tight">Admin</h1>
            <p className="mt-1 text-sm leading-relaxed text-muted-foreground">Review submissions, track progress, and manage your congregation.</p>
          </div>
        </div>
        <AdminSubnav slug={params.slug} />
      </div>
      {children}
    </div>
  )
}
