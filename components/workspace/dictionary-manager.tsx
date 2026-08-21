"use client"

import { FormEvent, useEffect, useMemo, useState } from "react"
import { Database, Loader2, Plus, Search, Trash2 } from "lucide-react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

export function DictionaryManager() {
  const [names, setNames] = useState<string[]>([])
  const [query, setQuery] = useState("")
  const [newName, setNewName] = useState("")
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  function load() {
    fetch("/api/platform/dictionary", { cache: "no-store" })
      .then((response) => (response.ok ? response.json() : null))
      .then((data) => setNames(data?.names ?? data?.lines ?? []))
      .catch(() => setNames([]))
      .finally(() => setLoading(false))
  }

  useEffect(load, [])

  const filteredNames = useMemo(
    () => names.filter((name) => name.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase())).slice(0, 200),
    [names, query],
  )

  async function mutate(action: "add" | "remove", name: string) {
    setSaving(true)
    try {
      const response = await fetch("/api/platform/dictionary", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, name }),
      })
      if (!response.ok) throw new Error("The shared dictionary could not be updated")
      setNewName("")
      load()
      toast.success(action === "add" ? "Surname added" : "Surname removed")
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "The shared dictionary could not be updated")
    } finally {
      setSaving(false)
    }
  }

  function addName(event: FormEvent) {
    event.preventDefault()
    const value = newName.trim()
    if (value) void mutate("add", value)
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[20rem_1fr]">
      <Card className="admin-card h-fit rounded-2xl">
        <CardHeader>
          <div className="admin-icon-well mb-2 flex h-10 w-10 items-center justify-center rounded-xl text-primary">
            <Database className="h-5 w-5" aria-hidden="true" />
          </div>
          <CardTitle className="text-base font-semibold">Add surname</CardTitle>
          <CardDescription>Changes apply to all congregations. Local admins can dismiss suggestions without changing this list.</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={addName} className="space-y-3">
            <div className="space-y-2">
              <Label htmlFor="dictionary-name">Surname</Label>
              <Input id="dictionary-name" value={newName} onChange={(event) => setNewName(event.target.value)} className="h-11 rounded-xl" autoComplete="off" />
            </div>
            <Button type="submit" disabled={saving || !newName.trim()} className="admin-primary-button min-h-11 w-full rounded-xl">
              {saving ? <Loader2 className="animate-spin" aria-hidden="true" /> : <Plus aria-hidden="true" />}
              Add to dictionary
            </Button>
          </form>
        </CardContent>
      </Card>

      <Card className="admin-card rounded-2xl">
        <CardHeader>
          <CardTitle className="text-base font-semibold">Shared surnames</CardTitle>
          <CardDescription>{names.length.toLocaleString()} entries in the platform dictionary.</CardDescription>
          <div className="relative pt-3">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 translate-y-0 text-muted-foreground" aria-hidden="true" />
            <Input value={query} onChange={(event) => setQuery(event.target.value)} className="h-11 rounded-xl pl-10" placeholder="Search surnames" aria-label="Search surnames" />
          </div>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="h-40 animate-pulse rounded-xl bg-muted" aria-label="Loading dictionary" aria-busy="true" />
          ) : filteredNames.length ? (
            <ul className="divide-y rounded-xl border" aria-label="Dictionary surnames">
              {filteredNames.map((name) => (
                <li key={name} className="flex min-h-12 items-center justify-between gap-3 px-4">
                  <span className="truncate text-sm font-normal">{name}</span>
                  <Button type="button" variant="ghost" size="icon" disabled={saving} onClick={() => mutate("remove", name)} className="h-11 w-11 shrink-0 rounded-xl text-muted-foreground hover:text-destructive" aria-label={`Remove ${name} from dictionary`}>
                    <Trash2 aria-hidden="true" />
                  </Button>
                </li>
              ))}
            </ul>
          ) : (
            <div className="rounded-xl border border-dashed px-6 py-10 text-center">
              <p className="text-base font-semibold">No matching surnames</p>
              <p className="mt-2 text-sm font-normal leading-relaxed text-muted-foreground">Try a different search or add a new surname.</p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
