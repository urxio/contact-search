import { notFound, redirect } from "next/navigation"
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
          <section className="space-y-4" aria-labelledby="congregation-administration-heading">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Administration</p>
              <h2 id="congregation-administration-heading" className="mt-2 text-2xl font-bold leading-tight">Congregation settings</h2>
              <p className="mt-2 text-sm font-normal leading-relaxed text-muted-foreground">
                Manage people, invitations, and territory coverage for this workspace.
              </p>
            </div>
            <SettingsWorkspace slug={params.slug} initialName={access.congregation.name || titleFromSlug(params.slug)} />
          </section>
        ) : null}
      </div>
    </PageFrame>
  )
}
