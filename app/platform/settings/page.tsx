import { PageFrame } from "@/components/workspace/page-frame"
import { UnclearOriginReview } from "@/components/workspace/unclear-origin-review"

export default function PlatformSettingsPage() {
  return (
    <PageFrame eyebrow="Platform owner" title="Platform settings"
      description="Review shared surname research and manage platform-wide results.">
      <UnclearOriginReview />
    </PageFrame>
  )
}
