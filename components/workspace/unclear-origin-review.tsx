"use client"

import { FormEvent, useEffect, useState } from "react"
import { ExternalLink, Globe2, Loader2, Save } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { forebearsSurnameUrl } from "@/lib/surname-countries"

type ReviewEntry = {
  surname: string
  origins: Array<{ country: string }>
  researchedAt: string
  reviewedAt: string | null
  contacts: Array<{ name: string; congregation: string }>
}

export function UnclearOriginReview() {
  const [entries, setEntries] = useState<ReviewEntry[]>([])
  const [drafts, setDrafts] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState<string | null>(null)

  async function load() {
    try {
      const response = await fetch("/api/platform/surname-origins", { cache: "no-store" })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || "Could not load origin reviews")
      const nextEntries = data.entries as ReviewEntry[]
      setEntries(nextEntries)
      setDrafts((current) => Object.fromEntries(nextEntries.map((entry) => [
        entry.surname, current[entry.surname] ?? entry.origins[0]?.country ?? "",
      ])))
      setError(null)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not load origin reviews")
    } finally { setLoading(false) }
  }

  useEffect(() => { void load() }, [])

  async function save(event: FormEvent, entry: ReviewEntry) {
    event.preventDefault()
    const country = drafts[entry.surname]?.trim()
    if (!country) return
    setSaving(entry.surname)
    try {
      const response = await fetch("/api/platform/surname-origins", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ surname: entry.surname, country }),
      })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || "Could not cache country")
      toast.success(`${entry.surname} origin cached as ${country}`)
      setDrafts((current) => ({ ...current, [entry.surname]: country }))
      await load()
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : "Could not cache country")
    } finally { setSaving(null) }
  }

  const pending = entries.filter((entry) => !entry.reviewedAt && entry.origins.length === 0)
  const reviewed = entries.filter((entry) => Boolean(entry.reviewedAt))

  function reviewCard(entry: ReviewEntry) {
    const inputId = `country-${encodeURIComponent(entry.surname)}`
    return (
      <li key={entry.surname} className="rounded-xl border p-4 sm:p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h3 className="text-base font-semibold">{entry.surname}</h3>
            <p className="mt-1 text-xs text-muted-foreground">
              {entry.reviewedAt ? `Reviewed ${new Date(entry.reviewedAt).toLocaleDateString()}` : `Luna checked ${new Date(entry.researchedAt).toLocaleDateString()}`}
            </p>
          </div>
          <Button variant="outline" size="sm" asChild>
            <a href={forebearsSurnameUrl(entry.surname)} target="_blank" rel="noopener noreferrer"
              aria-label={`Check ${entry.surname} on Forebears`}>
              <Globe2 className="mr-2 h-4 w-4" aria-hidden="true" />Forebears
              <ExternalLink className="ml-2 h-3 w-3" aria-hidden="true" />
            </a>
          </Button>
        </div>
        {entry.contacts.length > 0 ? (
          <div className="mt-3 text-sm">
            <p className="font-medium">Contacts researched with this surname</p>
            <ul className="mt-1 space-y-1 text-muted-foreground">
              {entry.contacts.map((contact, index) => (
                <li key={`${contact.congregation}-${contact.name}-${index}`}>{contact.name} · {contact.congregation}</li>
              ))}
            </ul>
          </div>
        ) : <p className="mt-3 text-sm text-muted-foreground">Contact details were not recorded for this research.</p>}
        <form onSubmit={(event) => void save(event, entry)} className="mt-4 flex flex-col gap-2 sm:flex-row sm:items-end">
          <div className="flex-1 space-y-1.5">
            <Label htmlFor={inputId}>Country of surname origin</Label>
            <Input id={inputId} value={drafts[entry.surname] ?? ""} maxLength={80}
              onChange={(event) => setDrafts((current) => ({ ...current, [entry.surname]: event.target.value }))}
              placeholder="Enter country after review" className="h-11 rounded-xl" required />
          </div>
          <Button type="submit" disabled={saving !== null || !drafts[entry.surname]?.trim()} className="min-h-11 rounded-xl">
            {saving === entry.surname ? <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" /> : <Save className="mr-2 h-4 w-4" aria-hidden="true" />}
            Cache country
          </Button>
        </form>
      </li>
    )
  }

  return <div className="space-y-6">
    <Card className="admin-card rounded-2xl">
      <CardHeader>
        <CardTitle className="text-base font-semibold">Origin unclear</CardTitle>
        <CardDescription>
          {pending.length} surname{pending.length === 1 ? "" : "s"} awaiting review. Open Forebears for each surname, then set a country to cache your decision for every workspace.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {loading ? <div className="h-28 animate-pulse rounded-xl bg-muted" aria-label="Loading origin reviews" aria-busy="true" />
          : error ? <p role="alert" className="text-sm text-destructive">{error}</p>
          : pending.length ? <ul className="space-y-3">{pending.map(reviewCard)}</ul>
          : <p className="rounded-xl border border-dashed px-4 py-8 text-center text-sm text-muted-foreground">No unclear surname origins to review.</p>}
      </CardContent>
    </Card>
    {reviewed.length > 0 && <Card className="admin-card rounded-2xl">
      <CardHeader>
        <CardTitle className="text-base font-semibold">Manually cached origins</CardTitle>
        <CardDescription>Review or correct countries you previously set. Luna uses these cached results across workspaces.</CardDescription>
      </CardHeader>
      <CardContent><ul className="space-y-3">{reviewed.map(reviewCard)}</ul></CardContent>
    </Card>}
  </div>
}
