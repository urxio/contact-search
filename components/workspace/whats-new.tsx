import { Copy, Globe, Sparkles } from "lucide-react"
import type { LucideIcon } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Card, CardContent } from "@/components/ui/card"
import { PageFrame } from "./page-frame"

type Change = { icon: LucideIcon; tone: string; title: string; body: string }
type Video = { id: string; title: string; description: string }
type Release = { id: string; date: string; title: string; summary: string; changes: Change[]; videos?: Video[] }

// Newest first. Add a new entry here for each announcement.
const releases: Release[] = [
  {
    id: "forebears-copy-luna-2026-10",
    date: "October 2026",
    title: "Smoother surname searches",
    summary: "Changes to help prevent 403 errors on Forebears, plus Luna as a fallback.",
    changes: [
      {
        icon: Globe,
        tone: "bg-blue-100 text-blue-600 dark:bg-blue-500/15 dark:text-blue-300",
        title: "Forebears opens in one reused tab",
        body: "Opening a new Forebears page for every contact could trigger a 403 error. The globe button now reuses a single tab and copies the surname for you.",
      },
      {
        icon: Copy,
        tone: "bg-emerald-100 text-emerald-600 dark:bg-emerald-500/15 dark:text-emerald-300",
        title: "Copy a surname in one click",
        body: "Use the small copy icon next to a contact's name, then paste it into Forebears kept open beside this page.",
      },
      {
        icon: Sparkles,
        tone: "bg-violet-100 text-violet-600 dark:bg-violet-500/15 dark:text-violet-300",
        title: "Luna is your Forebears fallback",
        body: "Tap the sparkle button to have Luna research a surname's likely origin, with sources. It's a helpful clue, so double-check unclear results on Forebears.",
      },
    ],
    videos: [
      { id: "forebears-tab-switch", title: "Search with one Forebears tab", description: "Click the globe, then switch to your open Forebears tab." },
      { id: "luna-fallback", title: "Luna when Forebears shows a 403", description: "Click the sparkle button to research the surname origin." },
    ],
  },
]

export function WhatsNew() {
  return (
    <PageFrame eyebrow="Updates" title="What's new" description="Recent improvements to Name Search.">
      <ol className="space-y-6">
        {releases.map((release, index) => (
          <li key={release.id}>
            <Card className="overflow-hidden">
              <CardContent className="p-6">
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="text-lg font-semibold">{release.title}</h2>
                  {index === 0 ? <Badge>Latest</Badge> : null}
                  <span className="text-sm text-muted-foreground sm:ml-auto">{release.date}</span>
                </div>
                <p className="mt-1 text-sm text-muted-foreground">{release.summary}</p>
                <ul className="mt-5 space-y-4">
                  {release.changes.map(({ icon: Icon, tone, title, body }) => (
                    <li key={title} className="flex gap-3">
                      <span className={`mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${tone}`}>
                        <Icon className="h-[18px] w-[18px]" aria-hidden="true" />
                      </span>
                      <div>
                        <p className="text-sm font-semibold">{title}</p>
                        <p className="mt-0.5 text-sm leading-relaxed text-muted-foreground">{body}</p>
                      </div>
                    </li>
                  ))}
                </ul>
                {release.videos?.length ? (
                  <div className="mt-6 border-t pt-5">
                    <h3 className="text-sm font-semibold">See how it works</h3>
                    <div className="mt-3 grid gap-4 md:grid-cols-2">
                      {release.videos.map((video) => (
                        <figure key={video.id} className="overflow-hidden rounded-xl border bg-slate-900">
                          <video
                            className="aspect-video w-full"
                            poster={`/whats-new/${video.id}.jpg`}
                            controls muted loop playsInline preload="metadata"
                            aria-label={video.title}
                          >
                            <source src={`/whats-new/${video.id}.webm`} type="video/webm" />
                            <source src={`/whats-new/${video.id}.mp4`} type="video/mp4" />
                          </video>
                          <figcaption className="bg-background px-4 py-3">
                            <p className="text-sm font-semibold">{video.title}</p>
                            <p className="mt-0.5 text-sm text-muted-foreground">{video.description}</p>
                          </figcaption>
                        </figure>
                      ))}
                    </div>
                  </div>
                ) : null}
              </CardContent>
            </Card>
          </li>
        ))}
      </ol>
    </PageFrame>
  )
}
