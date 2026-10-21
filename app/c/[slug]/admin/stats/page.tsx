import { AdminStats } from "@/components/admin/admin-stats"

export default function AdminStatsPage({ params }: { params: { slug: string } }) {
  return (
    <main className="mx-auto w-full max-w-7xl px-4 pb-10 pt-6 sm:px-6 lg:px-8">
      <AdminStats slug={params.slug} />
    </main>
  )
}
