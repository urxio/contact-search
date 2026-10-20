import { notFound, redirect } from "next/navigation"

import { AuthError, requireMembership } from "@/lib/auth"
import { pool } from "@/lib/db"
import { serializeInstruction } from "@/lib/congregation-instructions"
import { PageFrame } from "@/components/workspace/page-frame"
import { CustomInstructions } from "@/components/instructions/custom-instructions"
import { InstructionsTabs } from "@/components/instructions/instructions-tabs"
import { GeneralInstructions } from "@/components/instructions/general-instructions"

export default async function InstructionsPage({ params }: { params: { slug: string } }) {
  let access
  try {
    access = await requireMembership(params.slug)
  } catch (error) {
    if (error instanceof AuthError && error.status === 401) {
      redirect(`/auth/sign-in?next=/c/${encodeURIComponent(params.slug)}/instructions`)
    }
    notFound()
  }
  const isPlatformAdmin = Boolean(access.user.isPlatformAdmin)
  const canManage = isPlatformAdmin || access.membership?.role === "admin"
  // Admin instructions are only queried for admins, so members never receive them.
  const [result, adminResult] = await Promise.all([
    pool.query(`SELECT id,title,body,position,revision,created_at,updated_at FROM congregation_instructions WHERE congregation_id=$1 ORDER BY position,id`, [access.congregation.id]),
    canManage ? pool.query(`SELECT id,title,body,position,revision,created_at,updated_at FROM platform_admin_instructions ORDER BY position,id`) : null,
  ])

  return (
    <PageFrame
      eyebrow="Getting started"
      title="Instructions"
      description="Everything a congregation member needs to use Name Search, from opening an Excel to tracking progress."
      className="max-w-6xl"
    >
      <InstructionsTabs
        customInstructions={<CustomInstructions slug={params.slug} initialInstructions={result.rows.map(serializeInstruction)} canManage={canManage} />}
        adminInstructions={adminResult ? <CustomInstructions slug={params.slug} variant="admin" initialInstructions={adminResult.rows.map(serializeInstruction)} canManage={isPlatformAdmin} /> : undefined}
      >
        <GeneralInstructions />
      </InstructionsTabs>
    </PageFrame>
  )
}
