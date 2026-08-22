import { notFound, redirect } from "next/navigation"
import { PageFrame } from "@/components/workspace/page-frame"
import { PersonalSettings } from "@/components/workspace/personal-settings"
import { AuthError, requireMembership } from "@/lib/auth"

export default async function MySettingsPage({ params }: { params: { slug: string } }) {
  let access
  try {
    access = await requireMembership(params.slug)
  } catch (error) {
    if (error instanceof AuthError && error.status === 401) redirect(`/auth/sign-in?next=/c/${encodeURIComponent(params.slug)}/settings`)
    notFound()
  }
  return (
    <PageFrame
      eyebrow="Account"
      title="My settings"
      description="Manage your profile, preferences, and password."
    >
      <PersonalSettings
        slug={params.slug}
        email={access.user.email}
        displayName={access.user.displayName}
        congregationDisplayName={access.membership?.displayName ?? access.user.displayName}
        hasMembership={Boolean(access.membership)}
        initialTheme={access.user.preferences?.theme ?? "light"}
        initialDefaultWorkspaceView={access.user.preferences?.defaultWorkspaceView === "team" ? "team" : "search"}
      />
    </PageFrame>
  )
}
