import type { Metadata } from "next"

import { WhatsNew } from "@/components/workspace/whats-new"

export const metadata: Metadata = { title: "What's new" }

export default function WhatsNewPage() {
  return <WhatsNew />
}
