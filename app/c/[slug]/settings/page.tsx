import { notFound, redirect } from "next/navigation"
import { AdminSettingsCollapsible } from "@/components/workspace/admin-settings-collapsible"
import { PageFrame } from "@/components/workspace/page-frame"
import { PersonalSettings } from "@/components/workspace/personal-settings"
import { SettingsWorkspace } from "@/components/workspace/settings-workspace"
import { AuthError, requireMembership } from "@/lib/auth"

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
    access = await requireMembership(params.slug)
  } catch (error) {
    if (error instanceof AuthError && error.status === 401) redirect(`/auth/sign-in?next=/c/${encodeURIComponent(params.slug)}/settings`)
    notFound()
  }
  const canManage = access.user.isPlatformAdmin || access.membership?.role === "admin"
  return (
    <PageFrame
      eyebrow="Account"
      title="Settings"
      description="Manage your profile, preferences, password, and congregation access."
    >
      <div className="space-y-10">
        <PersonalSettings
          slug={params.slug}
          email={access.user.email}
          displayName={access.user.displayName}
          congregationDisplayName={access.membership?.displayName ?? access.user.displayName}
          hasMembership={Boolean(access.membership)}
          initialTheme={access.user.preferences?.theme ?? "light"}
          initialDefaultWorkspaceView={access.user.preferences?.defaultWorkspaceView ?? "search"}
        />
        {canManage ? (
          <AdminSettingsCollapsible>
            <SettingsWorkspace slug={params.slug} initialName={access.congregation.name || titleFromSlug(params.slug)} />
          </AdminSettingsCollapsible>
        ) : null}
      </div>
    </PageFrame>
  )
}
