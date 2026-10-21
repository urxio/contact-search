import { TerritorySetup } from "@/components/admin/territory-setup"

export default function AdminTerritorySetupPage({ params }: { params: { slug: string } }) {
  return <TerritorySetup slug={params.slug} />
}
