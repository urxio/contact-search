import { notFound, redirect } from "next/navigation"

import AdminPage from "@/app/admin/page"
import { WorkspaceRuntimeProvider } from "@/components/workspace/workspace-context"
import { AuthError, requireCongregationAdmin } from "@/lib/auth"

export default async function CongregationAdminPage({ params }: { params: { slug: string } }) {
  let access
  try {
    access = await requireCongregationAdmin(params.slug)
  } catch (error) {
    if (error instanceof AuthError && error.status === 401) redirect(`/auth/sign-in?next=/c/${encodeURIComponent(params.slug)}/admin`)
    notFound()
  }
  return (
    <WorkspaceRuntimeProvider
      slug={params.slug}
      authenticatedUserId={access.user.id}
      authenticatedDisplayName={access.membership?.displayName || access.user.displayName}
      embedded
    >
      <AdminPage />
    </WorkspaceRuntimeProvider>
  )
}
