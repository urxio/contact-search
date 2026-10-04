"use client"

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

type Props = { open: boolean; onDismiss: () => void }

export function UpdateAnnouncement({ open, onDismiss }: Props) {
  return (
    <Dialog open={open} onOpenChange={(next) => { if (!next) onDismiss() }}>
      <DialogContent className="max-w-md gap-0 overflow-hidden border-0 p-0 shadow-2xl sm:rounded-2xl">
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
