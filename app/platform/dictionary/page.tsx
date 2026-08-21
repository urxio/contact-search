import { DictionaryManager } from "@/components/workspace/dictionary-manager"
import { PageFrame } from "@/components/workspace/page-frame"

export default function PlatformDictionaryPage() {
  return (
    <PageFrame
      eyebrow="Platform owner"
      title="Global surname dictionary"
      description="Manage the shared source used to identify potentially French contacts across every congregation."
    >
      <DictionaryManager />
    </PageFrame>
  )
}
