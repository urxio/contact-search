import { PlayCircle } from "lucide-react"

import { cn } from "@/lib/utils"

export function OnboardingVideo({ className }: { className?: string }) {
  return (
    <section aria-labelledby="onboarding-video-heading" className={cn("flex flex-col rounded-xl border bg-card p-4 shadow-sm sm:p-5", className)}>
      <div className="mb-4 flex items-start gap-3 px-1">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
          <PlayCircle className="h-[18px] w-[18px]" aria-hidden="true" />
        </span>
        <div>
          <h2 id="onboarding-video-heading" className="text-base font-semibold">Watch the 2-minute walkthrough</h2>
          <p className="mt-0.5 text-sm text-muted-foreground">
            Open an Excel, verify contacts with Forebears and TruePeopleSearch, and submit your work.
          </p>
        </div>
      </div>
      <video
        className="my-auto aspect-video w-full rounded-lg bg-slate-900"
        poster="/videos/name-search-onboarding-poster.jpg"
        controls playsInline preload="metadata"
        aria-label="Name Search onboarding walkthrough, narrated with captions"
      >
        <source src="/videos/name-search-onboarding.mp4" type="video/mp4" />
      </video>
    </section>
  )
}
