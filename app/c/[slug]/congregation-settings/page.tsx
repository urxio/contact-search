import { redirect } from "next/navigation"

// Congregation settings now live under Admin > Settings.
export default function CongregationSettingsPage({ params }: { params: { slug: string } }) {
  redirect(`/c/${encodeURIComponent(params.slug)}/admin/settings`)
}
