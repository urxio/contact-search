"use client"

import { useEffect, useState } from "react"
import { Globe } from "lucide-react"

export type ForebearsNoticeState = { surname: string; id: number } | null

// Brief, non-blocking card in the middle of the screen. Clicks pass through it
// and it fades on its own, so repeated searches never need dismissing.
export function ForebearsNotice({ notice, onDone }: { notice: ForebearsNoticeState; onDone: () => void }) {
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    if (!notice) return
    setVisible(true)
    const hide = window.setTimeout(() => setVisible(false), 4000)
    const clear = window.setTimeout(onDone, 4400)
    return () => { window.clearTimeout(hide); window.clearTimeout(clear) }
  }, [notice, onDone])

  if (!notice) return null
  return (
    <div className="pointer-events-none fixed inset-0 z-[60] flex items-center justify-center p-4" role="status" aria-live="polite">
      <div
        className={`flex w-full max-w-xl items-center gap-5 rounded-3xl border border-white/50 bg-white/25 px-8 py-7 shadow-[0_8px_32px_rgba(15,23,42,0.25)] ring-1 ring-inset ring-white/30 backdrop-blur-2xl backdrop-saturate-150 dark:border-white/15 dark:bg-slate-900/30 dark:ring-white/10 transition-all duration-300 motion-reduce:transition-none ${visible ? "scale-100 opacity-100" : "scale-95 opacity-0"}`}
      >
        <span className="flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl bg-white/40 text-blue-600 shadow-inner ring-1 ring-white/50 dark:bg-white/10 dark:text-blue-300 dark:ring-white/15">
          <Globe className="h-8 w-8" aria-hidden="true" />
        </span>
        <div className="min-w-0">
          <p className="truncate text-2xl font-semibold text-slate-900 dark:text-white">&ldquo;{notice.surname}&rdquo; searched on Forebears</p>
          <p className="mt-1.5 text-xl font-bold text-slate-900 dark:text-white">Switch to your open Forebears tab.</p>
        </div>
      </div>
    </div>
  )
}
