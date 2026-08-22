"use client"

import React, { type ReactNode, useMemo, useState } from "react"
import { Globe, Pencil, Search, X } from "lucide-react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"
import {
  ADMIN_CONTACT_STATUSES,
  type AdminContactEdits,
  type AdminCheckedSource,
  type AdminContactStatus,
} from "@/lib/submission-contacts"

export type AdminReviewContact = {
  id?: string
  firstName?: string
  lastName?: string
  fullName?: string
  address?: string
  city?: string
  zipcode?: string
  phone?: string
  status?: string
  notes?: string
  checkedOnTPS?: boolean
  checkedOnOTM?: boolean
  checkedOnForebears?: boolean
  territoryStatus?: boolean
}

type Props = {
  submissionId: number
  initialContacts: AdminReviewContact[]
  apiUrl: string
  children?: ReactNode
}

const STATUS_COLORS: Record<string, string> = {
  "Potentially French": "border-green-200 bg-green-50 text-green-700 dark:border-green-800 dark:bg-green-950/50 dark:text-green-300",
  "Not French": "border-red-200 bg-red-50 text-red-700 dark:border-red-800 dark:bg-red-950/50 dark:text-red-300",
  Duplicate: "border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-800 dark:bg-amber-950/50 dark:text-amber-300",
  "Not checked": "border-blue-200 bg-blue-50 text-blue-700 dark:border-blue-800 dark:bg-blue-950/50 dark:text-blue-300",
  Detected: "border-purple-200 bg-purple-50 text-purple-700 dark:border-purple-800 dark:bg-purple-950/50 dark:text-purple-300",
}

function normalizeSurname(lastName: string) {
  return lastName
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0000-\u001f\u007f-\u009f]/g, "")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/[\u0300-\u036f]/g, "")
}

export function AdminContactReview({ submissionId, initialContacts, apiUrl, children }: Props) {
  const [contacts, setContacts] = useState(initialContacts)
  const [busy, setBusy] = useState<Record<string, boolean>>({})
  const [searchText, setSearchText] = useState("")
  const [statusFilter, setStatusFilter] = useState("all")
  const [editingContact, setEditingContact] = useState<AdminReviewContact | null>(null)
  const [editFields, setEditFields] = useState<AdminContactEdits>({})
  const [savingEdit, setSavingEdit] = useState(false)

  const metrics = useMemo(() => ({
    total: contacts.length,
    potential: contacts.filter((contact) => contact.status === "Potentially French").length,
    notFrench: contacts.filter((contact) => contact.status === "Not French").length,
    duplicate: contacts.filter((contact) => contact.status === "Duplicate").length,
    unchecked: contacts.filter((contact) => contact.status === "Not checked").length,
  }), [contacts])

  const availableStatuses = useMemo(() => Array.from(new Set(contacts.map((contact) => contact.status || "Not checked"))).sort(), [contacts])
  const visibleContacts = useMemo(() => {
    const query = searchText.trim().toLowerCase()
    return contacts.filter((contact) => {
      if (statusFilter !== "all" && (contact.status || "Not checked") !== statusFilter) return false
      if (!query) return true
      return [contact.fullName, contact.firstName, contact.lastName, contact.address, contact.city, contact.zipcode, contact.phone, contact.notes]
        .some((value) => value?.toLowerCase().includes(query))
    })
  }, [contacts, searchText, statusFilter])

  async function saveContact(contact: AdminReviewContact, update: { status: AdminContactStatus } | { checkedSource: AdminCheckedSource } | { fields: AdminContactEdits }) {
    if (!contact.id) return false
    const key = contact.id
    setBusy((current) => ({ ...current, [key]: true }))
    try {
      const response = await fetch(apiUrl, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: submissionId, contactId: contact.id, ...update }),
      })
      const result = await response.json()
      if (!response.ok) throw new Error(result?.error || "Unable to update contact")
      setContacts((current) => current.map((item) => item.id === contact.id ? result.contact : item))
      return true
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Unable to update contact")
      return false
    } finally {
      setBusy((current) => {
        const next = { ...current }
        delete next[key]
        return next
      })
    }
  }

  function openEditor(contact: AdminReviewContact) {
    setEditingContact(contact)
    setEditFields({
      firstName: contact.firstName || "",
      lastName: contact.lastName || "",
      fullName: contact.fullName || "",
      address: contact.address || "",
      city: contact.city || "",
      zipcode: contact.zipcode || "",
      phone: contact.phone || "",
      notes: contact.notes || "",
    })
  }

  async function submitEdit(event: React.FormEvent) {
    event.preventDefault()
    if (!editingContact) return
    setSavingEdit(true)
    const saved = await saveContact(editingContact, { fields: editFields })
    setSavingEdit(false)
    if (saved) setEditingContact(null)
  }

  async function changeStatus(contact: AdminReviewContact, status: AdminContactStatus) {
    if (!contact.id || contact.status === status) return
    const previous = contact
    setContacts((current) => current.map((item) => item.id === contact.id ? { ...item, status } : item))
    if (!await saveContact(contact, { status })) {
      setContacts((current) => current.map((item) => item.id === contact.id ? previous : item))
    }
  }

  function research(contact: AdminReviewContact, source: AdminCheckedSource) {
    if (!contact.id) return
    const url = source === "forebears"
      ? `https://forebears.io/surnames/${encodeURIComponent(normalizeSurname(contact.lastName || ""))}`
      : `https://www.truepeoplesearch.com/results?name=${encodeURIComponent(contact.fullName || "")}&citystatezip=${encodeURIComponent(contact.zipcode || "")}`
    const opened = window.open(url, "_blank")
    if (!opened) {
      toast.error("Your browser blocked the research tab. Allow pop-ups and try again.")
      return
    }
    opened.opener = null
    const field = source === "forebears" ? "checkedOnForebears" : "checkedOnTPS"
    const previous = contact
    setContacts((current) => current.map((item) => item.id === contact.id ? { ...item, [field]: true } : item))
    void saveContact(contact, { checkedSource: source }).then((saved) => {
      if (!saved) setContacts((current) => current.map((item) => item.id === contact.id ? previous : item))
    })
  }

  return (
    <TooltipProvider delayDuration={300}>
      <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-5">
        {[
          ["Total", metrics.total],
          ["Potential", metrics.potential],
          ["Not French", metrics.notFrench],
          ["Duplicates", metrics.duplicate],
          ["Unchecked", metrics.unchecked],
        ].map(([label, value]) => (
          <Card key={String(label)} className="admin-card rounded-2xl">
            <CardContent className="p-4">
              <p className="text-xl font-semibold tabular-nums">{value}</p>
              <p className="text-xs text-muted-foreground">{label}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {children}

      <div className="mb-3 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="relative w-full sm:max-w-md">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
          <Input
            type="search"
            value={searchText}
            onChange={(event) => setSearchText(event.target.value)}
            placeholder="Search contacts…"
            aria-label="Search contacts in this submission"
            className="pl-9 pr-9"
          />
          {searchText ? (
            <button type="button" onClick={() => setSearchText("")} aria-label="Clear contact search" className="absolute right-2 top-1/2 inline-flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground">
              <X className="h-4 w-4" aria-hidden="true" />
            </button>
          ) : null}
        </div>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
          <Label htmlFor={`contact-status-filter-${submissionId}`} className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Contact status</Label>
          <select
            id={`contact-status-filter-${submissionId}`}
            value={statusFilter}
            onChange={(event) => setStatusFilter(event.target.value)}
            className="admin-field h-10 min-w-40 rounded-md px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
            aria-label="Filter contacts by status"
          >
            <option value="all">All statuses</option>
            {availableStatuses.map((status) => <option key={status} value={status}>{status}</option>)}
          </select>
          <span className="whitespace-nowrap text-xs text-muted-foreground">{visibleContacts.length} of {contacts.length}</span>
        </div>
      </div>

      <Card className="admin-card overflow-hidden rounded-2xl">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[820px] text-sm">
            <thead>
              <tr className="border-b bg-muted/40 text-left text-xs text-muted-foreground">
                <th className="px-4 py-3">Name</th>
                <th className="px-4 py-3">Location</th>
                <th className="px-4 py-3">Phone</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Research</th>
                <th className="px-4 py-3"><span className="sr-only">Edit</span></th>
              </tr>
            </thead>
            <tbody>
              {visibleContacts.length === 0 ? (
                <tr><td colSpan={6} className="px-6 py-12 text-center text-muted-foreground">No contacts match these filters.</td></tr>
              ) : visibleContacts.map((contact, index) => {
                const key = contact.id || String(index)
                const disabled = !contact.id || !!busy[key]
                const forebearsDisabled = disabled || !contact.lastName?.trim()
                const tpsDisabled = disabled || !contact.fullName?.trim() || !contact.zipcode?.trim()
                const currentStatus = contact.status || "Not checked"
                const assignable = ADMIN_CONTACT_STATUSES.includes(currentStatus as AdminContactStatus)
                return (
                  <tr key={key} className="border-b transition-colors last:border-0 hover:bg-muted/30">
                    <td className="px-4 py-3 font-medium">
                      {contact.fullName || "—"}
                      {contact.territoryStatus ? <span className="ml-2 rounded bg-destructive/10 px-1.5 py-0.5 text-xs font-semibold text-destructive">Territory</span> : null}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {contact.address || "—"}
                      <span className="block text-xs">{[contact.city, contact.zipcode].filter(Boolean).join(", ")}</span>
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">{contact.phone || "—"}</td>
                    <td className="px-4 py-3">
                      <Select value={currentStatus} disabled={disabled} onValueChange={(value) => changeStatus(contact, value as AdminContactStatus)}>
                        <SelectTrigger className={`w-[170px] rounded-full text-xs font-semibold ${STATUS_COLORS[currentStatus] || "border-border bg-muted text-muted-foreground"}`}>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {!assignable ? <SelectItem value={currentStatus} disabled>{currentStatus}</SelectItem> : null}
                          {ADMIN_CONTACT_STATUSES.map((status) => <SelectItem key={status} value={status}>{status}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex gap-2">
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <span>
                              <Button
                                type="button"
                                size="icon"
                                variant={contact.checkedOnForebears ? "secondary" : "outline"}
                                disabled={forebearsDisabled}
                                onClick={() => research(contact, "forebears")}
                                aria-label="Search surname on Forebears"
                                className={`h-10 w-10 ${contact.checkedOnForebears ? "border-green-300 bg-green-100 text-green-700 hover:bg-green-200 dark:bg-green-900/30 dark:text-green-400" : ""}`}
                              >
                                <Globe className="h-4 w-4" aria-hidden="true" />
                              </Button>
                            </span>
                          </TooltipTrigger>
                          <TooltipContent>{contact.lastName?.trim() ? "Search surname on Forebears" : "A last name is required"}</TooltipContent>
                        </Tooltip>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <span>
                              <Button
                                type="button"
                                size="icon"
                                variant={contact.checkedOnTPS ? "secondary" : "outline"}
                                disabled={tpsDisabled}
                                onClick={() => research(contact, "truePeopleSearch")}
                                aria-label="Search name and ZIP on TruePeopleSearch"
                                className={`h-10 w-10 ${contact.checkedOnTPS ? "border-green-300 bg-green-100 text-green-700 hover:bg-green-200 dark:bg-green-900/30 dark:text-green-400" : ""}`}
                              >
                                <Search className="h-4 w-4" aria-hidden="true" />
                              </Button>
                            </span>
                          </TooltipTrigger>
                          <TooltipContent>{contact.fullName?.trim() && contact.zipcode?.trim() ? "Search name and ZIP on TruePeopleSearch" : "A full name and ZIP code are required"}</TooltipContent>
                        </Tooltip>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <Button type="button" size="sm" variant="outline" disabled={disabled} onClick={() => openEditor(contact)}>
                        <Pencil aria-hidden="true" />Edit
                      </Button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </Card>

      <Dialog open={!!editingContact} onOpenChange={(open) => { if (!open && !savingEdit) setEditingContact(null) }}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
          <form onSubmit={submitEdit}>
            <DialogHeader>
              <DialogTitle>Edit contact</DialogTitle>
              <DialogDescription>Update the saved information for this submitted contact.</DialogDescription>
            </DialogHeader>
            <div className="grid gap-4 py-5 sm:grid-cols-2">
              {([
                ["firstName", "First name"],
                ["lastName", "Last name"],
                ["fullName", "Full name"],
                ["phone", "Phone"],
                ["address", "Address"],
                ["city", "City"],
                ["zipcode", "ZIP code"],
              ] as const).map(([field, label]) => (
                <div key={field} className={field === "address" || field === "fullName" ? "space-y-2 sm:col-span-2" : "space-y-2"}>
                  <Label htmlFor={`edit-contact-${field}`}>{label}</Label>
                  <Input
                    id={`edit-contact-${field}`}
                    value={editFields[field] || ""}
                    maxLength={field === "address" ? 300 : field === "city" ? 100 : field === "zipcode" ? 20 : field === "phone" ? 50 : 200}
                    onChange={(event) => setEditFields((current) => ({ ...current, [field]: event.target.value }))}
                  />
                </div>
              ))}
              <div className="space-y-2 sm:col-span-2">
                <Label htmlFor="edit-contact-notes">Notes</Label>
                <Textarea id="edit-contact-notes" value={editFields.notes || ""} maxLength={2000} onChange={(event) => setEditFields((current) => ({ ...current, notes: event.target.value }))} className="min-h-28" />
              </div>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" disabled={savingEdit} onClick={() => setEditingContact(null)}>Cancel</Button>
              <Button type="submit" disabled={savingEdit}>{savingEdit ? "Saving…" : "Save changes"}</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </TooltipProvider>
  )
}
