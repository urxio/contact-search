import { redirect } from "next/navigation"

export default function AdminZipCodesPage({ params }: { params: { slug: string } }) {
  redirect(`/c/${encodeURIComponent(params.slug)}/admin/zip-codes/coverage`)
}
