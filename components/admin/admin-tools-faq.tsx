import React from "react"
import Link from "next/link"
import {
  ArrowLeft,
  BookOpen,
  Check,
  CheckSquare,
  CircleSlash,
  Copy,
  Database,
  Download,
  Eraser,
  ExternalLink,
  EyeOff,
  Filter,
  Globe,
  Layers,
  ListFilter,
  MapPin,
  Minus,
  Pencil,
  Play,
  Plus,
  RefreshCw,
  RotateCcw,
  ScanSearch,
  Search,
  SearchCheck,
  SpellCheck,
  Trash2,
  Upload,
  UserRound,
  X,
  type LucideIcon,
} from "lucide-react"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"

type Action = {
  label: string
  description: string
  icon: LucideIcon
  impact?: "none" | "updates" | "deletes"
}

type Tool = {
  id: string
  title: string
  summary: string
  icon: LucideIcon
  actions: Action[]
}

const tools: Tool[] = [
  {
    id: "potential-french",
    title: "Potential French contacts",
    summary: "Shows every contact currently marked Potentially French across active submissions and helps resolve duplicate names or addresses.",
    icon: SearchCheck,
    actions: [
      { label: "Search", description: "Filters the list by contact name, address, or submitting user.", icon: Search },
      { label: "Duplicates only", description: "Shows only contacts that share a name or address with another result.", icon: ListFilter },
      { label: "Auto-remove duplicates", description: "Opens a review screen to choose one contact to keep per address. The others are marked Duplicate; they are not deleted.", icon: Copy, impact: "updates" },
      { label: "Export CSV", description: "Downloads all Potentially French contacts in the congregation export format.", icon: Download },
      { label: "Duplicate badge", description: "Opens every contact at that address so you can select the correct record to keep.", icon: MapPin },
      { label: "Not French", description: "Changes the contact status to Not French and removes it from this list.", icon: CircleSlash, impact: "updates" },
      { label: "Duplicate", description: "Changes the contact status to Duplicate and removes it from this list.", icon: Copy, impact: "updates" },
    ],
  },
  {
    id: "missed-contacts",
    title: "Find missed French contacts",
    summary: "Scans non-archived submissions for contacts whose surname is in the shared dictionary but whose status is not Potentially French.",
    icon: ScanSearch,
    actions: [
      { label: "Search", description: "Filters scan results by contact name, city, or submitting user.", icon: Search },
      { label: "Auto-remove duplicates", description: "Opens duplicate-address review. After you choose a keeper, the other contacts are marked Duplicate and removed from the scan—not deleted.", icon: Copy, impact: "updates" },
      { label: "Rescan & Mark Reviewed", description: "Runs the scan again and marks all active submissions as Reviewed.", icon: RefreshCw, impact: "updates" },
      { label: "View submission", description: "Opens the complete submission that contains the contact.", icon: ExternalLink },
      { label: "Address count badge", description: "Opens contacts sharing that address so you can choose which one to keep.", icon: MapPin },
      { label: "Globe", description: "Searches the surname on Forebears in a new tab.", icon: Globe },
      { label: "Person search", description: "Searches the contact name and ZIP code on TruePeopleSearch in a new tab.", icon: UserRound },
      { label: "Green check", description: "Marks the contact Potentially French and removes it from the missed-results list.", icon: Check, impact: "updates" },
      { label: "Red X", description: "Removes the matched surname from the shared dictionary. This affects detection for every contact with that surname.", icon: X, impact: "updates" },
      { label: "Edit / Save", description: "Updates the submitted contact's name, address, city, ZIP code, phone, or notes.", icon: Pencil, impact: "updates" },
      { label: "Gray X", description: "Dismisses this scan result without changing the contact status or dictionary.", icon: EyeOff },
    ],
  },
  {
    id: "dictionary",
    title: "Manage name dictionary",
    summary: "Reviews surname suggestions created by differences between contact statuses and the shared dictionary used for automatic detection.",
    icon: SpellCheck,
    actions: [
      { label: "Add to Dictionary tab", description: "Shows surnames manually marked Potentially French that are missing from the dictionary.", icon: Plus },
      { label: "Remove from Dictionary tab", description: "Shows dictionary surnames found on contacts marked Not French.", icon: Minus },
      { label: "Select all / checkboxes", description: "Selects multiple surname suggestions for one batch action.", icon: CheckSquare },
      { label: "Globe", description: "Searches the surname on Forebears before you decide.", icon: Globe },
      { label: "Add to dictionary", description: "Adds the surname to future automatic French detection.", icon: Plus, impact: "updates" },
      { label: "Remove from dictionary", description: "Removes the surname from future automatic French detection. Existing contact statuses do not change.", icon: Minus, impact: "updates" },
      { label: "Dismiss / X", description: "Permanently hides the suggestion without changing the dictionary or any contact.", icon: EyeOff },
      { label: "Batch action", description: "Applies Add, Remove, or Dismiss to every selected surname at once.", icon: Layers, impact: "updates" },
    ],
  },
  {
    id: "duplicates",
    title: "Database Duplicates Check",
    summary: "Compares Potentially French contacts in non-archived submissions with a congregation address file and reports exact or possible matches.",
    icon: Database,
    actions: [
      { label: "Upload congregation addresses", description: "Selects an Excel or CSV address file and makes it available for comparison.", icon: Upload },
      { label: "Run Comparison", description: "Scans current submissions against the selected file and saves the file for reuse.", icon: Play },
      { label: "Run with saved file", description: "Runs a new comparison using the most recently saved address file.", icon: Database },
      { label: "Re-run Check", description: "Clears restored results and asks you to choose a file for a fresh comparison.", icon: RotateCcw },
      { label: "Clear saved", description: "Clears the restored report from this browser. It does not change submissions or delete the server-saved address file.", icon: Eraser },
      { label: "Search / match filter", description: "Narrows results by contact details or by Exact and Loose match type.", icon: Filter },
      { label: "View", description: "Opens the complete submission containing the matched contact.", icon: ExternalLink },
      { label: "Clear", description: "Hides one match from the current report and saved browser results. The contact remains unchanged.", icon: EyeOff },
      { label: "Clear all names", description: "Hides every visible match from the report without changing submissions.", icon: Layers },
      { label: "Remove", description: "Permanently deletes that contact from its submission.", icon: Trash2, impact: "deletes" },
      { label: "Remove all", description: "Permanently deletes every visible matched contact from its submission after confirmation.", icon: Trash2, impact: "deletes" },
    ],
  },
]

function Impact({ value }: { value: Action["impact"] }) {
  if (!value || value === "none") return null
  return (
    <span className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold ${value === "deletes" ? "bg-destructive/10 text-destructive" : "bg-amber-500/10 text-amber-700 dark:text-amber-300"}`}>
      {value === "deletes" ? "Deletes data" : "Changes data"}
    </span>
  )
}

export function AdminToolsFaq({ backHref }: { backHref: string }) {
  return (
    <main className="admin-shell min-h-screen">
      <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6 lg:py-12">
        <Button asChild variant="outline" className="mb-6 min-h-11 rounded-xl">
          <Link href={backHref}><ArrowLeft aria-hidden="true" />Back to Admin</Link>
        </Button>

        <header className="mb-8">
          <div className="admin-icon-well mb-4 flex h-11 w-11 items-center justify-center rounded-2xl text-primary">
            <BookOpen className="h-5 w-5" aria-hidden="true" />
          </div>
          <h1 className="text-3xl font-bold tracking-tight">Admin tools FAQ</h1>
          <p className="mt-2 max-w-3xl text-sm leading-relaxed text-muted-foreground">
            Learn what each review tool checks and what every action does. Labels identify actions that change saved data or permanently delete a contact.
          </p>
        </header>

        <nav className="admin-material mb-8 flex flex-wrap gap-2 rounded-2xl p-3" aria-label="FAQ sections">
          {tools.map((tool) => <a key={tool.id} href={`#${tool.id}`} className="rounded-xl px-3 py-2 text-sm font-medium text-muted-foreground hover:bg-muted hover:text-foreground">{tool.title}</a>)}
        </nav>

        <div className="space-y-8">
          {tools.map((tool) => {
            const Icon = tool.icon
            return (
              <Card key={tool.id} id={tool.id} className="admin-card scroll-mt-6 rounded-2xl">
                <CardHeader>
                  <div className="admin-icon-well mb-2 flex h-10 w-10 items-center justify-center rounded-xl text-primary"><Icon className="h-5 w-5" aria-hidden="true" /></div>
                  <CardTitle className="text-xl">{tool.title}</CardTitle>
                  <CardDescription className="max-w-3xl leading-relaxed">{tool.summary}</CardDescription>
                </CardHeader>
                <CardContent>
                  <h2 className="mb-3 text-sm font-semibold">Buttons and controls</h2>
                  <dl className="divide-y rounded-xl border">
                    {tool.actions.map((action) => (
                      <div key={action.label} className="grid gap-1 p-4 sm:grid-cols-[190px_1fr_auto] sm:items-start sm:gap-4">
                        <dt className="flex items-center gap-2 text-sm font-semibold">
                          <span className={`admin-icon-well flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${action.impact === "deletes" ? "text-destructive" : action.impact === "updates" ? "text-amber-600 dark:text-amber-300" : "text-primary"}`}>
                            <action.icon className="h-4 w-4" aria-hidden="true" />
                          </span>
                          {action.label}
                        </dt>
                        <dd className="text-sm leading-relaxed text-muted-foreground">{action.description}</dd>
                        <Impact value={action.impact} />
                      </div>
                    ))}
                  </dl>
                </CardContent>
              </Card>
            )
          })}
        </div>
      </div>
    </main>
  )
}
