import { PlayCircle } from "lucide-react"

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"

export function OnboardingVideo({ className }: { className?: string }) {
  return (
    <Card className={className}>
      <CardHeader>
        <div className="mb-2 flex h-11 w-11 items-center justify-center rounded-xl bg-primary/10 text-primary">
          <PlayCircle className="h-5 w-5" aria-hidden="true" />
        </div>
        <CardTitle>Watch the 2-minute walkthrough</CardTitle>
        <CardDescription>
          How to open an Excel, verify contacts with Forebears and TruePeopleSearch, and submit your work for review.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <video
          className="aspect-video w-full rounded-xl border bg-slate-900"
          poster="/videos/name-search-onboarding-poster.jpg"
          controls playsInline preload="metadata"
          aria-label="Name Search onboarding walkthrough, narrated with captions"
        >
          <source src="/videos/name-search-onboarding.mp4" type="video/mp4" />
        </video>
      </CardContent>
    </Card>
  )
}
