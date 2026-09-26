"use client"

import React from "react"
import { ExternalLink, Loader2, RefreshCw, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { forebearsSurnameUrl } from "@/lib/surname-countries"
import type { SurnameOriginEntry } from "@/lib/surname-origins"

type Props = {
  contactName: string
  surname: string
  entry: SurnameOriginEntry | null
  loading: boolean
  error: string | null
  onRefresh: () => void
  onClose: () => void
  batchActionsVisible?: boolean
}

export function OriginBottomBar({ contactName, surname, entry, loading, error, onRefresh, onClose, batchActionsVisible = false }: Props) {
  const panelRef = React.useRef<HTMLElement>(null)
  const originUnclear = !loading && !error && entry !== null && entry.origins.length === 0

  React.useEffect(() => {
    const dismissOnOutsidePointerDown = (event: PointerEvent) => {
      if (event.button !== 0) return
      const panel = panelRef.current
      if (panel && event.target instanceof Node && !panel.contains(event.target)) onClose()
    }

    // Pointer down runs before a contact's click handler, so selecting another Origin button still opens it.
    document.addEventListener("pointerdown", dismissOnOutsidePointerDown, true)
    return () => document.removeEventListener("pointerdown", dismissOnOutsidePointerDown, true)
  }, [onClose])

  return (
    <aside
      ref={panelRef}
      aria-label={`Surname origin for ${surname}`}
      className={`pointer-events-auto overflow-y-auto rounded-2xl border bg-background shadow-2xl ${batchActionsVisible ? "max-h-[40dvh] lg:max-h-[35dvh]" : "max-h-[60dvh] lg:max-h-[45dvh]"}`}
    >
      <div className="p-4 sm:p-5">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Surname origin</p>
            <div className="mt-1 flex flex-wrap items-baseline gap-x-3 gap-y-1">
              <h2 className="break-words text-lg font-semibold leading-tight">{surname}</h2>
              <p className="text-sm text-muted-foreground">Contact: {contactName}</p>
            </div>
          </div>
          <Button variant="ghost" size="icon" className="shrink-0" onClick={onClose} aria-label="Close origin panel">
            <X className="h-4 w-4" />
          </Button>
        </div>

        <div className="mt-3" aria-live="polite">
          {loading ? (
            <div role="status" className="flex items-start gap-3 rounded-xl border bg-muted/20 p-4">
              <Loader2 className="mt-0.5 h-5 w-5 shrink-0 text-primary motion-safe:animate-spin" aria-hidden="true" />
              <div>
                <p className="text-sm font-medium">Researching surname…</p>
                <p className="mt-1 text-sm text-muted-foreground">Searching web sources for likely historical origins.</p>
              </div>
            </div>
          ) : error ? (
            <div role="alert" className="rounded-lg border border-destructive/40 bg-destructive/5 p-4">
              <p className="font-medium">Research unavailable</p>
              <p className="mt-1 text-sm text-muted-foreground">{error}</p>
              <Button size="sm" variant="outline" className="mt-3" onClick={onRefresh}>Try again</Button>
            </div>
          ) : entry?.origins.length ? (
            <div>
              <p className="text-sm font-medium">Possible origins</p>
              <div className="mt-2 grid gap-3 md:grid-cols-2">
                {entry.origins.map((origin, index) => (
                  <section key={`${origin.country}-${index}`} className="min-w-0 rounded-xl border bg-muted/20 p-4">
                    <h3 className="text-base font-semibold">{index + 1}. {origin.country}</h3>
                    <p className="mt-2 text-sm leading-relaxed">{origin.explanation}</p>
                    <div className="mt-3 flex flex-wrap gap-x-3 gap-y-2">
                      {origin.sources.map((source) => (
                        <a key={source.url} href={source.url} target="_blank" rel="noopener noreferrer"
                          className="inline-flex min-w-0 items-center gap-1 text-sm text-primary underline underline-offset-2">
                          {source.title || "View source"}<ExternalLink className="h-3 w-3 shrink-0" aria-hidden="true" />
                        </a>
                      ))}
                    </div>
                  </section>
                ))}
              </div>
              <p className="mt-2 text-xs text-muted-foreground">Researched {new Date(entry.researchedAt).toLocaleDateString()}</p>
            </div>
          ) : entry ? (
            <div className="rounded-lg border bg-muted/20 p-4">
              <p className="font-medium">Origin unclear</p>
              <p className="mt-1 text-sm text-muted-foreground">
                The web sources did not support a likely country of origin for this surname. Try searching Forebears using the highlighted button below for more clues; where a surname is common does not prove its origin.
              </p>
            </div>
          ) : null}
        </div>
        <div className="mt-3 flex flex-wrap items-center justify-between gap-3 border-t pt-3">
          <p className="max-w-2xl text-xs leading-relaxed text-muted-foreground">
            These are possible origins of the surname, not evidence of this contact&apos;s ancestry or nationality.
          </p>
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="outline" disabled={loading} onClick={onRefresh}>
              <RefreshCw className="mr-2 h-4 w-4" aria-hidden="true" />Research again
            </Button>
            <Button size="sm" variant={originUnclear ? "outline" : "ghost"}
              className={originUnclear ? "origin-forebears-attention" : ""} asChild>
              <a href={forebearsSurnameUrl(surname)} target="_blank" rel="noopener noreferrer">
                Open Forebears{originUnclear && <ExternalLink className="ml-1 h-4 w-4" aria-hidden="true" />}
              </a>
            </Button>
          </div>
        </div>
      </div>
    </aside>
  )
}
