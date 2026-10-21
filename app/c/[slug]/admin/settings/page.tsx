import { notFound } from "next/navigation"

import { SettingsWorkspace } from "@/components/workspace/settings-workspace"
import { requireCongregationAdmin } from "@/lib/auth"

function titleFromSlug(slug: string) {
  return slug
    .split("-")
    .filter(Boolean)
    .map((word) => word.charAt(0).toLocaleUpperCase() + word.slice(1))
    .join(" ")
}

export default async function AdminSettingsPage({ params }: { params: { slug: string } }) {
  // The admin layout already redirects signed-out visitors and hides this from members.
  const access = await requireCongregationAdmin(params.slug).catch(() => notFound())

  return (
    <main className="mx-auto w-full max-w-7xl px-4 pb-10 pt-6 sm:px-6 lg:px-8">
      <SettingsWorkspace
        slug={params.slug}
        initialName={access.congregation.name || titleFromSlug(params.slug)}
      />
    </main>
  )
}
