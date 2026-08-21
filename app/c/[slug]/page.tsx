import { notFound, redirect } from "next/navigation"

import SearchHelper from "@/app/page"
import { WorkspaceRuntimeProvider } from "@/components/workspace/workspace-context"
import { AuthError, requireMembership } from "@/lib/auth"

export default async function CongregationSearchPage({ params }: { params: { slug: string } }) {
  let access
  try {
    access = await requireMembership(params.slug)
  } catch (error) {
    if (error instanceof AuthError && error.status === 401) redirect(`/auth/sign-in?next=/c/${encodeURIComponent(params.slug)}`)
    notFound()
  }

  return (
    <WorkspaceRuntimeProvider
      slug={params.slug}
      authenticatedUserId={access.user.id}
      authenticatedDisplayName={access.membership?.displayName || access.user.displayName}
      embedded
    >
      <SearchHelper />
    </WorkspaceRuntimeProvider>
  )
}
