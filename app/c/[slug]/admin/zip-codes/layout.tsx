import { ZipCodesSubnav } from "@/components/admin/zip-codes-subnav"

export default function AdminZipCodesLayout({ children, params }: { children: React.ReactNode; params: { slug: string } }) {
  return (
    <main className="mx-auto w-full max-w-7xl space-y-5 px-4 pb-10 pt-6 sm:px-6 lg:px-8">
      <ZipCodesSubnav slug={params.slug} />
      {children}
    </main>
  )
}
