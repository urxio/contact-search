import {
  BarChart3,
  CheckCircle2,
  ExternalLink,
  FileSpreadsheet,
  Lightbulb,
  Search,
  Settings,
  UsersRound,
} from "lucide-react"
import type { LucideIcon } from "lucide-react"

import { Button } from "@/components/ui/button"
import { OnboardingVideo } from "@/components/instructions/onboarding-video"

const presentationUrl =
  "https://docs.google.com/presentation/d/1ycSduWrylr_MVjJFY58KAG2TLTpiN7vR_4G7Jdrugww/edit?usp=sharing"

const steps = [
  ["Open an Excel", "Use Upload Excel for your own file, or Browse Excels to open one assigned to you."],
  ["Review each contact", "Check the details, fix anything wrong, add notes, and set a status."],
  ["Save your progress", "Work saves as you go. Choose Continue reviewing on Search to pick up later."],
  ["Submit when finished", "Once every contact is reviewed, select Submit for review."],
]

const features: { icon: LucideIcon; title: string; body: string }[] = [
  { icon: FileSpreadsheet, title: "Search and Excels", body: "Upload Excel files with first name, last name, address, city, ZIP code, and phone columns. Browse Excels lets you claim a shared congregation file or open one assigned to you. Use New Session only when you are ready to start different work." },
  { icon: Search, title: "Contacts and statuses", body: "Use search and filters to focus on contacts. Mark a contact Potentially French or Not French, or leave it Not checked until reviewed. Detected and Duplicate labels are added by the site to help with review." },
  { icon: CheckCircle2, title: "Notes and corrections", body: "Open a contact to update its information, add notes for your team, and flag an address or phone number that needs updating before you submit." },
  { icon: UsersRound, title: "Team Progress", body: "Open Team Progress from the header to see your congregation’s territory progress. Your completed work contributes to the shared view." },
  { icon: BarChart3, title: "My stats", body: "Select your name in the top-right corner, then My stats, to see your focused search time and activity." },
  { icon: Settings, title: "My settings", body: "Select your name, then My settings, to update your profile, default workspace view, password, and display preference." },
]

const tips = [
  ["Work one Excel at a time.", "The active Excel is shown on the Search page, and in-progress work can be resumed later."],
  ["Review before submitting.", "Use the filters and progress information to find contacts that are still Not checked."],
  ["Use notes for context.", "Notes help another member or an administrator understand an unusual record."],
  ["Need a refresher?", "This page is always available from your profile menu under Instructions."],
]

export function GeneralInstructions() {
  return (
    <div className="space-y-12">
      <div className="grid gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <OnboardingVideo />

        <section aria-labelledby="quick-start-heading" className="flex flex-col rounded-xl border bg-card p-6 shadow-sm">
          <h2 id="quick-start-heading" className="text-base font-semibold">Quick start</h2>
          <ol className="mt-5 flex-1 space-y-4">
            {steps.map(([title, description], index) => (
              <li key={title} className="relative flex gap-4">
                {index < steps.length - 1 ? (
                  <span className="absolute left-[13px] top-8 h-[calc(100%-4px)] w-px bg-border" aria-hidden="true" />
                ) : null}
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-semibold text-primary-foreground">
                  {index + 1}
                </span>
                <div>
                  <p className="text-sm font-semibold">{title}</p>
                  <p className="mt-0.5 text-sm leading-6 text-muted-foreground">{description}</p>
                </div>
              </li>
            ))}
          </ol>
          <Button asChild variant="outline" className="mt-6 w-full gap-2">
            <a href={presentationUrl} target="_blank" rel="noreferrer">
              Open training slides
              <ExternalLink className="h-4 w-4" aria-hidden="true" />
            </a>
          </Button>
        </section>
      </div>

      <section aria-labelledby="features-heading">
        <h2 id="features-heading" className="text-lg font-semibold">Using each feature</h2>
        <p className="mt-1 text-sm text-muted-foreground">A reference for the tools available to congregation members.</p>
        <div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {features.map(({ icon: Icon, title, body }) => (
            <div key={title} className="rounded-xl border bg-card p-5">
              <div className="flex items-center gap-3">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                  <Icon className="h-[18px] w-[18px]" aria-hidden="true" />
                </span>
                <h3 className="text-sm font-semibold">{title}</h3>
              </div>
              <p className="mt-3 text-sm leading-6 text-muted-foreground">{body}</p>
            </div>
          ))}
        </div>
      </section>

      <section aria-labelledby="tips-heading" className="rounded-xl border bg-muted/40 p-6">
        <h2 id="tips-heading" className="flex items-center gap-2 text-lg font-semibold">
          <Lightbulb className="h-5 w-5 text-primary" aria-hidden="true" />
          Helpful tips
        </h2>
        <ul className="mt-4 grid gap-x-8 gap-y-4 sm:grid-cols-2">
          {tips.map(([title, body]) => (
            <li key={title} className="flex gap-3 text-sm leading-6 text-muted-foreground">
              <CheckCircle2 className="mt-1 h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
              <span><strong className="font-semibold text-foreground">{title}</strong> {body}</span>
            </li>
          ))}
        </ul>
      </section>
    </div>
  )
}
