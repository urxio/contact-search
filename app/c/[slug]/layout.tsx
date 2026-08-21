import { notFound, redirect } from "next/navigation"
import { WorkspaceShellLoader } from "@/components/workspace/workspace-shell-loader"
import { AuthError, requireMembership } from "@/lib/auth"

function titleFromSlug(slug: string) {
  return slug
    .split("-")
    .filter(Boolean)
    .map((word) => word.charAt(0).toLocaleUpperCase() + word.slice(1))
    .join(" ")
}

export default async function CongregationLayout({
  children,
  params,
}: {
  children: React.ReactNode
  params: { slug: string }
}) {
  let access
  try {
    access = await requireMembership(params.slug)
  } catch (error) {
    if (error instanceof AuthError && error.status === 401) redirect(`/auth/sign-in?next=/c/${encodeURIComponent(params.slug)}`)
    notFound()
  }
  return (
    <WorkspaceShellLoader slug={params.slug} fallbackName={access.congregation.name || titleFromSlug(params.slug)}>
      {children}
    </WorkspaceShellLoader>
  )
}
