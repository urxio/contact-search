import { redirect } from "next/navigation"

// ZIP coverage now lives under Admin > ZIP codes.
export default function AdminZipCoveragePage({ params }: { params: { slug: string } }) {
  redirect(`/c/${encodeURIComponent(params.slug)}/admin/zip-codes/coverage`)
}
