import { PersonalStatsDashboard } from "@/components/workspace/personal-stats-dashboard"

export default function PersonalStatsPage({ params }: { params: { slug: string } }) {
  return <PersonalStatsDashboard slug={params.slug} />
}
