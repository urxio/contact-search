import { notFound, redirect } from "next/navigation"

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
      <div className="mx-auto max-w-7xl px-4 pt-6 sm:px-6 lg:px-8">
        <h1 className="sr-only">Admin</h1>
        <AdminSubnav slug={params.slug} />
      </div>
      {children}
    </div>
  )
}
