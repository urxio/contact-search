import { notFound, redirect } from "next/navigation"

import { AdminToolsFaq } from "@/components/admin/admin-tools-faq"
import { AuthError, requireCongregationAdmin } from "@/lib/auth"

export default async function CongregationAdminToolsHelpPage({ params }: { params: { slug: string } }) {
  try {
    await requireCongregationAdmin(params.slug)
  } catch (error) {
    if (error instanceof AuthError && error.status === 401) {
      redirect(`/auth/sign-in?next=/c/${encodeURIComponent(params.slug)}/admin/tools-help`)
    }
    notFound()
  }

  return <AdminToolsFaq backHref={`/c/${params.slug}/admin`} />
}
