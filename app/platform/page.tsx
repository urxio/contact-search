import { PageFrame } from "@/components/workspace/page-frame"
import { PlatformDashboard } from "@/components/workspace/platform-dashboard"

export default function PlatformPage() {
  return (
    <PageFrame
      eyebrow="Platform owner"
      title="Congregations"
      description="Create private workspaces and enter a congregation for audited support."
    >
      <PlatformDashboard />
    </PageFrame>
  )
}
