import { ZipCoverage } from "@/components/admin/zip-coverage"

export default function AdminZipCoveragePage({ params }: { params: { slug: string } }) {
  return <ZipCoverage slug={params.slug} />
}
