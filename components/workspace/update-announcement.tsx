"use client"

import { useState } from "react"
import { Copy, Globe, ShieldCheck, Sparkles } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog"

// Bump this id for each new announcement; users who dismissed an older one see the new card once.
export const CURRENT_UPDATE_ID = "forebears-copy-luna-2026-10"

const highlights = [
  {
    icon: Globe,
    tone: "bg-blue-100 text-blue-600 dark:bg-blue-500/15 dark:text-blue-300",
    title: "Forebears opens in one reused tab",
    body: "Opening a new Forebears page for every contact could trigger a 403 error. The globe now reuses a single tab and copies the surname for you.",
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
]

const clips = [
  { id: "forebears-tab-switch", label: "Forebears tab", alt: "Animation: click the globe, then switch to your open Forebears tab to see the search." },
  { id: "luna-fallback", label: "Luna fallback", alt: "Animation: if Forebears shows a 403 error, click the sparkle button to have Luna research the surname origin." },
] as const

type Props = { open: boolean; onDismiss: () => void }

export function UpdateAnnouncement({ open, onDismiss }: Props) {
  const [clipId, setClipId] = useState<(typeof clips)[number]["id"]>(clips[0].id)
  const clip = clips.find((item) => item.id === clipId) ?? clips[0]
  return (
    <Dialog open={open} onOpenChange={(next) => { if (!next) onDismiss() }}>
      <DialogContent className="max-h-[92vh] max-w-lg gap-0 overflow-y-auto border-0 p-0 shadow-2xl sm:rounded-2xl">
        <div className="relative bg-gradient-to-br from-blue-600 via-indigo-600 to-violet-600 px-6 pb-6 pt-8 text-white">
          <div className="pointer-events-none absolute -right-8 -top-10 h-36 w-36 rounded-full bg-white/10 blur-2xl" aria-hidden />
          <div className="mb-4 flex h-11 w-11 items-center justify-center rounded-xl bg-white/20 ring-1 ring-white/30">
            <ShieldCheck className="h-6 w-6" />
          </div>
          <p className="text-xs font-semibold uppercase tracking-widest text-white/80">What&apos;s new</p>
          <DialogTitle className="mt-1 text-2xl font-semibold leading-tight">Smoother surname searches</DialogTitle>
          <DialogDescription className="mt-2 text-sm text-white/85">
            We changed how Forebears opens to help prevent 403 errors, and added Luna as a fallback.
          </DialogDescription>
        </div>
        <div className="border-b bg-slate-900">
          <div className="flex gap-1 px-4 pt-3" role="tablist" aria-label="Update walkthroughs">
            {clips.map((item) => (
              <button
                key={item.id} type="button" role="tab" aria-selected={item.id === clipId}
                onClick={() => setClipId(item.id)}
                className={`rounded-full px-3 py-1 text-xs font-semibold transition-colors ${item.id === clipId ? "bg-white text-slate-900" : "text-white/70 hover:bg-white/10 hover:text-white"}`}
              >
                {item.label}
              </button>
            ))}
          </div>
          <video
            key={clip.id}
            className="mt-3 aspect-video w-full"
            poster={`/whats-new/${clip.id}.jpg`}
            autoPlay muted loop playsInline preload="metadata"
            aria-label={clip.alt}
          >
            <source src={`/whats-new/${clip.id}.webm`} type="video/webm" />
            <source src={`/whats-new/${clip.id}.mp4`} type="video/mp4" />
          </video>
        </div>
        <ul className="space-y-4 px-6 py-6">
          {highlights.map(({ icon: Icon, tone, title, body }) => (
            <li key={title} className="flex gap-3">
              <span className={`mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${tone}`}>
                <Icon className="h-[18px] w-[18px]" />
              </span>
              <div>
                <p className="text-sm font-semibold text-foreground">{title}</p>
                <p className="mt-0.5 text-sm leading-relaxed text-muted-foreground">{body}</p>
              </div>
            </li>
          ))}
        </ul>
        <div className="border-t bg-muted/40 px-6 py-4">
          <Button className="w-full" onClick={onDismiss}>Got it</Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
