import { ZipCoverage } from "@/components/admin/zip-coverage"

export default function AdminZipCoveragePage({ params }: { params: { slug: string } }) {
  return (
    <main className="mx-auto w-full max-w-7xl px-4 pb-10 pt-6 sm:px-6 lg:px-8">
      <ZipCoverage slug={params.slug} />
    </main>
  )
}
