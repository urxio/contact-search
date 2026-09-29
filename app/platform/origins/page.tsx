import { PageFrame } from "@/components/workspace/page-frame"
import { UnclearOriginReview } from "@/components/workspace/unclear-origin-review"

export default function PlatformOriginsPage() {
  return (
    <PageFrame eyebrow="Platform owner" title="Surname origin review"
      description="Review unclear Luna results and manage manually cached countries across the platform.">
      <UnclearOriginReview />
    </PageFrame>
  )
}
