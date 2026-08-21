import { notFound, redirect } from "next/navigation"
import { PageFrame } from "@/components/workspace/page-frame"
import { SettingsWorkspace } from "@/components/workspace/settings-workspace"
import { AuthError, requireCongregationAdmin } from "@/lib/auth"

function titleFromSlug(slug: string) {
  return slug
    .split("-")
    .filter(Boolean)
    .map((word) => word.charAt(0).toLocaleUpperCase() + word.slice(1))
    .join(" ")
}

export default async function CongregationSettingsPage({ params }: { params: { slug: string } }) {
  let access
  try {
    access = await requireCongregationAdmin(params.slug)
  } catch (error) {
    if (error instanceof AuthError && error.status === 401) redirect(`/auth/sign-in?next=/c/${encodeURIComponent(params.slug)}/settings`)
    notFound()
  }
  return (
    <PageFrame
      eyebrow="Administration"
      title="Congregation settings"
      description="Manage the people, invitations, and territory coverage available in this workspace."
    >
      <SettingsWorkspace slug={params.slug} initialName={access.congregation.name || titleFromSlug(params.slug)} />
    </PageFrame>
  )
}
