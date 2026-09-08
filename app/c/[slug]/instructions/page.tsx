import { notFound, redirect } from "next/navigation"
import {
  BarChart3,
  CheckCircle2,
  ExternalLink,
  FileSpreadsheet,
  ListChecks,
  Presentation,
  Search,
  Settings,
  UsersRound,
} from "lucide-react"
import type { LucideIcon } from "lucide-react"
import type { ReactNode } from "react"

import { AuthError, requireMembership } from "@/lib/auth"
import { pool } from "@/lib/db"
import { serializeInstruction } from "@/lib/congregation-instructions"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { PageFrame } from "@/components/workspace/page-frame"
import { CustomInstructions } from "@/components/instructions/custom-instructions"

const presentationUrl =
  "https://docs.google.com/presentation/d/1ycSduWrylr_MVjJFY58KAG2TLTpiN7vR_4G7Jdrugww/edit?usp=sharing"

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
  const result = await pool.query(`SELECT id,title,body,position,revision,created_at,updated_at FROM congregation_instructions WHERE congregation_id=$1 ORDER BY position,id`, [access.congregation.id])

  return (
    <PageFrame
      eyebrow="Getting started"
      title="Instructions"
      description="Everything a congregation member needs to use Name Search, from opening an Excel to tracking progress."
      className="max-w-6xl"
    >
      <Card className="max-w-3xl">
        <CardHeader>
          <div className="mb-2 flex h-11 w-11 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <Presentation className="h-5 w-5" aria-hidden="true" />
          </div>
          <CardTitle>Training presentation</CardTitle>
          <CardDescription>
            Open the Google Slides guide in a new tab to follow the step-by-step instructions.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button asChild className="gap-2">
            <a href={presentationUrl} target="_blank" rel="noreferrer">
              Open Google Slides
              <ExternalLink className="h-4 w-4" aria-hidden="true" />
            </a>
          </Button>
        </CardContent>
      </Card>

      <section className="mt-10 max-w-4xl" aria-labelledby="quick-start-heading">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <ListChecks className="h-5 w-5" aria-hidden="true" />
          </div>
          <div>
            <h2 id="quick-start-heading" className="text-xl font-semibold">Quick start</h2>
            <p className="text-sm text-muted-foreground">Your usual workflow in Name Search.</p>
          </div>
        </div>
        <ol className="mt-5 grid gap-4 sm:grid-cols-2">
          {[
            ["1", "Open an Excel", "On Search, select Upload Excel to use your own file, or Browse Excels to open a congregation Excel that is available or assigned to you."],
            ["2", "Review each contact", "Check the contact details, make corrections when needed, add notes, and choose the appropriate status."],
            ["3", "Save your progress", "Your work is saved as you go. Return to Search and choose Continue reviewing whenever you need to pick up an in-progress Excel."],
            ["4", "Submit when finished", "When every contact is reviewed, select Submit for review. Your congregation’s administrators can then review the completed work."],
          ].map(([number, title, description]) => (
            <li key={number} className="admin-card flex gap-4 rounded-2xl p-5">
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary text-sm font-semibold text-primary-foreground">{number}</span>
              <div>
                <h3 className="font-semibold">{title}</h3>
                <p className="mt-1 text-sm leading-6 text-muted-foreground">{description}</p>
              </div>
            </li>
          ))}
        </ol>
      </section>

      <section className="mt-12" aria-labelledby="features-heading">
        <h2 id="features-heading" className="text-xl font-semibold">Using each feature</h2>
        <p className="mt-1 text-sm text-muted-foreground">A reference for the tools available to congregation members.</p>
        <div className="mt-5 grid gap-4 md:grid-cols-2">
          <GuideCard icon={FileSpreadsheet} title="Search and Excels">
            Upload Excel files with columns for first name, last name, address, city, ZIP code, and phone. Browse Excels lets you claim a shared congregation file or open one assigned to you. Use New Session only when you are ready to start different work.
          </GuideCard>
          <GuideCard icon={Search} title="Contacts and statuses">
            Use search and filters to focus on contacts. Set a contact to Potentially French when it may be French-speaking, Not French when it is not, or leave it Not checked until reviewed. Detected and Duplicate labels are applied by the site to help with review.
          </GuideCard>
          <GuideCard icon={CheckCircle2} title="Notes and corrections">
            Open a contact to review its details. You can update the contact information, add notes for your team, and flag an address or phone number that needs updating before you submit the work.
          </GuideCard>
          <GuideCard icon={UsersRound} title="Team Progress">
            Open Team Progress from the header to see your congregation’s territory progress. Your completed work contributes to the shared view; any assigned Excel can be opened from Search to continue working.
          </GuideCard>
          <GuideCard icon={BarChart3} title="My stats">
            Select your name in the top-right corner, then My stats, to see your own focused search time and activity.
          </GuideCard>
          <GuideCard icon={Settings} title="My settings">
            Select your name, then My settings, to update your profile, choose your default workspace view, change your password, and set your display preference.
          </GuideCard>
        </div>
      </section>

      <section className="mt-12 max-w-4xl" aria-labelledby="tips-heading">
        <h2 id="tips-heading" className="text-xl font-semibold">Helpful tips</h2>
        <ul className="mt-4 space-y-3 text-sm leading-6 text-muted-foreground">
          <li><strong className="text-foreground">Work one Excel at a time.</strong> The active Excel is shown on the Search page, and in-progress work can be resumed later.</li>
          <li><strong className="text-foreground">Review before submitting.</strong> Use the filters and progress information to find contacts that are still Not checked.</li>
          <li><strong className="text-foreground">Use notes for context.</strong> Notes make it easier for another member or an administrator to understand an unusual record.</li>
          <li><strong className="text-foreground">Need a refresher?</strong> This page is always available from your profile menu under Instructions.</li>
        </ul>
      </section>
      <CustomInstructions slug={params.slug} initialInstructions={result.rows.map(serializeInstruction)} canManage={access.user.isPlatformAdmin || access.membership?.role === "admin"} />
    </PageFrame>
  )
}

function GuideCard({
  icon: Icon,
  title,
  children,
}: {
  icon: LucideIcon
  title: string
  children: ReactNode
}) {
  return (
    <Card className="h-full">
      <CardHeader className="space-y-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-muted text-primary">
          <Icon className="h-5 w-5" aria-hidden="true" />
        </div>
        <CardTitle className="text-base">{title}</CardTitle>
        <CardDescription className="leading-6">{children}</CardDescription>
      </CardHeader>
    </Card>
  )
}
