"use client"

import React, { useMemo } from "react"
import { FixedSizeList as List } from "react-window"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Checkbox } from "@/components/ui/checkbox"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import {
  Clock, StickyNote, AlertCircleIcon, Phone, MapPin, Globe, Search,
  ChevronDown, ChevronRight,
} from "lucide-react"
import type { EnhancedContact, BaseContact } from "@/types/contact"

const ITEM_HEIGHT = 53          // px — height of a single non-expanded row
const LIST_HEIGHT = 600         // px — height of the virtual scroll window
const VIRTUALIZE_THRESHOLD = 50 // switch to virtual rendering above this count

interface ContactTableProps {
  contacts: EnhancedContact[]
  selectedContacts: string[]
  lastVerifiedId: string | null
  onToggleSelectAll: () => void
  onToggleSelection: (id: string) => void
  onToggleExpanded: (id: string) => void
  onStatusChange: (id: string, status: EnhancedContact["status"]) => void
  onNotesChange: (id: string, notes: string) => void
  onFieldChange: (id: string, field: keyof BaseContact, value: string) => void
  onAddressUpdateChange: (id: string, v: boolean) => void
  onPhoneUpdateChange: (id: string, v: boolean) => void
  onTerritoryStatusChange: (id: string, v: boolean) => void
  onSearchForebears: (contact: EnhancedContact) => void
  onSearchTPS: (contact: EnhancedContact) => void
}

/** Shared colgroup keeps header and virtual-row body columns aligned. */
function ColGroup() {
  return (
    <colgroup>
      <col style={{ width: 34 }} />
      <col style={{ width: 160 }} />
      <col />
      <col style={{ width: 110 }} />
      <col style={{ width: 85 }} />
      <col style={{ width: 115 }} />
      <col style={{ width: 160 }} />
      <col style={{ width: 135 }} />
    </colgroup>
  )
}

/** A single table row — used in both virtualized and plain render paths. */
function ContactRow({
  contact,
  selectedContacts,
  lastVerifiedId,
  onToggleSelection,
  onToggleExpanded,
  onStatusChange,
  onSearchForebears,
  onSearchTPS,
}: {
  contact: EnhancedContact
  selectedContacts: string[]
  lastVerifiedId: string | null
  onToggleSelection: (id: string) => void
  onToggleExpanded: (id: string) => void
  onStatusChange: (id: string, status: EnhancedContact["status"]) => void
  onSearchForebears: (contact: EnhancedContact) => void
  onSearchTPS: (contact: EnhancedContact) => void
}) {
  const rowColorClass =
    contact.status === "Potentially French"
      ? "bg-green-50 dark:bg-green-900/20"
      : contact.status === "Duplicate"
        ? "bg-amber-50 dark:bg-amber-900/20"
        : contact.status === "Detected"
          ? "bg-purple-50 dark:bg-purple-900/20"
          : contact.status === "Not French"
            ? "bg-red-50 dark:bg-red-900/20"
            : ""

  return (
    <TableRow
      id={`contact-row-${contact.id}`}
      className={`cursor-pointer transition-colors hover:bg-muted/50 ${rowColorClass} ${
        contact.id === lastVerifiedId ? "border-l-4 border-l-green-500 dark:border-l-green-400" : ""
      }`}
      onClick={() => onToggleExpanded(contact.id)}
    >
      <TableCell onClick={(e) => e.stopPropagation()}>
        <Checkbox
          checked={selectedContacts.includes(contact.id)}
          onCheckedChange={() => onToggleSelection(contact.id)}
        />
      </TableCell>

      <TableCell className="font-medium">
        <div className="flex items-center gap-2 flex-wrap">
          {contact.fullName}
          {contact.id === lastVerifiedId && (
            <Tooltip>
              <TooltipTrigger><Clock className="h-4 w-4 text-green-500" /></TooltipTrigger>
              <TooltipContent>Last verified contact</TooltipContent>
            </Tooltip>
          )}
          {contact.notes && contact.notes.trim() !== "" && (
            <Tooltip>
              <TooltipTrigger><StickyNote className="h-4 w-4 text-blue-500" /></TooltipTrigger>
              <TooltipContent>Has notes</TooltipContent>
            </Tooltip>
          )}
          {contact.needAddressUpdate && (
            <Tooltip>
              <TooltipTrigger><AlertCircleIcon className="h-4 w-4 text-amber-500" /></TooltipTrigger>
              <TooltipContent>Address needs update</TooltipContent>
            </Tooltip>
          )}
          {contact.needPhoneUpdate && (
            <Tooltip>
              <TooltipTrigger><Phone className="h-4 w-4 text-amber-500" /></TooltipTrigger>
              <TooltipContent>Phone needs update</TooltipContent>
            </Tooltip>
          )}
          {contact.territoryStatus && (
            <Tooltip>
              <TooltipTrigger><MapPin className="h-4 w-4 text-red-500" /></TooltipTrigger>
              <TooltipContent>Different territory</TooltipContent>
            </Tooltip>
          )}
        </div>
      </TableCell>

      <TableCell>{contact.address}</TableCell>
      <TableCell>{contact.city}</TableCell>
      <TableCell>{contact.zipcode}</TableCell>
      <TableCell>{contact.phone}</TableCell>

      <TableCell>
        <Select
          value={contact.status}
          onValueChange={(value) => onStatusChange(contact.id, value as EnhancedContact["status"])}
        >
          <SelectTrigger
            className={`w-[140px] rounded-full ${
              contact.status === "Potentially French"
                ? "bg-green-100 dark:bg-green-900/40 border-green-200 dark:border-green-800"
                : contact.status === "Not French"
                  ? "bg-red-100 dark:bg-red-900/40 border-red-200 dark:border-red-800"
                  : contact.status === "Detected"
                    ? "bg-purple-100 dark:bg-purple-900/40 border-purple-200 dark:border-purple-800"
                    : contact.status === "Duplicate"
                      ? "bg-amber-100 dark:bg-amber-900/40 border-amber-200 dark:border-amber-800"
                      : "bg-blue-100 dark:bg-blue-900/40 border-blue-200 dark:border-blue-800"
            }`}
          >
            <SelectValue placeholder={contact.status} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="Not checked">Not checked</SelectItem>
            <SelectItem value="Potentially French">Potentially French</SelectItem>
            <SelectItem value="Detected">Detected</SelectItem>
            <SelectItem value="Duplicate">Duplicate</SelectItem>
            <SelectItem value="Not French">Not French</SelectItem>
          </SelectContent>
        </Select>
      </TableCell>

      <TableCell className="text-right">
        <div className="flex justify-end space-x-2">
          <Tooltip>
            <TooltipTrigger>
              <Button
                variant="ghost" size="icon"
                onClick={(e) => { e.stopPropagation(); onToggleExpanded(contact.id) }}
                className="hover:bg-slate-100 dark:hover:bg-slate-800"
              >
                {contact.isExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
              </Button>
            </TooltipTrigger>
            <TooltipContent>{contact.isExpanded ? "Collapse" : "Expand"}</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger>
              <Button
                variant={contact.checkedOnForebears ? "secondary" : "outline"} size="icon"
                onClick={(e) => { e.stopPropagation(); onSearchForebears(contact) }}
                className={contact.checkedOnForebears
                  ? "bg-green-100 text-green-700 border-green-300 hover:bg-green-200 dark:bg-green-900/30 dark:text-green-400"
                  : "bg-blue-50 hover:bg-blue-100 dark:bg-blue-900/20"}
              >
                <Globe className="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Search on Forebears.io</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger>
              <Button
                variant={contact.checkedOnTPS ? "secondary" : "outline"} size="icon"
                onClick={(e) => { e.stopPropagation(); onSearchTPS(contact) }}
                className={contact.checkedOnTPS
                  ? "bg-green-100 text-green-700 border-green-300 hover:bg-green-200 dark:bg-green-900/30 dark:text-green-400"
                  : "bg-blue-50 hover:bg-blue-100 dark:bg-blue-900/20"}
              >
                <Search className="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Search on TruePeopleSearch</TooltipContent>
          </Tooltip>
        </div>
      </TableCell>
    </TableRow>
  )
}

export function ContactTable({
  contacts,
  selectedContacts,
  lastVerifiedId,
  onToggleSelectAll,
  onToggleSelection,
  onToggleExpanded,
  onStatusChange,
  onNotesChange,
  onFieldChange,
  onAddressUpdateChange,
  onPhoneUpdateChange,
  onTerritoryStatusChange,
  onSearchForebears,
  onSearchTPS,
}: ContactTableProps) {
  // Virtualize only when the list is large AND no row is expanded
  // (expanded rows have variable height, which FixedSizeList can't handle)
  const hasExpandedContact = contacts.some((c) => c.isExpanded)
  const useVirtualization = contacts.length > VIRTUALIZE_THRESHOLD && !hasExpandedContact

  // Shared table header (rendered once whether virtualised or not)
  const tableHeader = (
    <TableHeader>
      <TableRow>
        <TableHead className="w-[30px]">
          <Checkbox
            checked={selectedContacts.length > 0 && selectedContacts.length === contacts.length}
            onCheckedChange={onToggleSelectAll}
          />
        </TableHead>
        <TableHead className="w-[150px]">Name</TableHead>
        <TableHead>Address</TableHead>
        <TableHead>City</TableHead>
        <TableHead>Zipcode</TableHead>
        <TableHead>Phone</TableHead>
        <TableHead className="w-[120px]">Status</TableHead>
        <TableHead className="text-right">Actions</TableHead>
      </TableRow>
    </TableHeader>
  )

  // Shared row props (avoids repetition in both render paths)
  const rowProps = useMemo(() => ({
    selectedContacts,
    lastVerifiedId,
    onToggleSelection,
    onToggleExpanded,
    onStatusChange,
    onSearchForebears,
    onSearchTPS,
  }), [selectedContacts, lastVerifiedId, onToggleSelection, onToggleExpanded, onStatusChange, onSearchForebears, onSearchTPS])

  /* ── VIRTUALISED PATH ───────────────────────────────────────────────────── */
  if (useVirtualization) {
    return (
      <div className="rounded-md border overflow-hidden">
        {/* Sticky header rendered as its own table so it doesn't scroll */}
        <Table style={{ tableLayout: "fixed" }} className="mb-0">
          <ColGroup />
          {tableHeader}
        </Table>

        {/* Virtualised body — only DOM-present rows are rendered */}
        <List
          height={LIST_HEIGHT}
          itemCount={contacts.length}
          itemSize={ITEM_HEIGHT}
          width="100%"
        >
          {({ index, style }) => (
            <div style={style}>
              <Table style={{ tableLayout: "fixed" }}>
                <ColGroup />
                <TableBody>
                  <ContactRow contact={contacts[index]} {...rowProps} />
                </TableBody>
              </Table>
            </div>
          )}
        </List>
      </div>
    )
  }

  /* ── PLAIN PATH (small list or expanded row present) ────────────────────── */
  return (
    <ScrollArea className="rounded-md border">
      <Table>
        {tableHeader}
        <TableBody>
          {contacts.map((contact) => {
            const rowColorClass =
              contact.status === "Potentially French"
                ? "bg-green-50 dark:bg-green-900/20"
                : contact.status === "Duplicate"
                  ? "bg-amber-50 dark:bg-amber-900/20"
                  : contact.status === "Detected"
                    ? "bg-purple-50 dark:bg-purple-900/20"
                    : contact.status === "Not French"
                      ? "bg-red-50 dark:bg-red-900/20"
                      : ""

            return (
              <React.Fragment key={contact.id}>
                <ContactRow contact={contact} {...rowProps} />

                {contact.isExpanded && (
                  <TableRow className={`${rowColorClass} border-t-0`}>
                    <TableCell colSpan={8} className="p-0">
                      <div className="p-4 bg-background/50 rounded-b-lg shadow-inner">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          <div>
                            <h3 className="text-sm font-medium mb-2">Contact Details</h3>
                            <div className="space-y-3 text-sm">
                              {(["firstName", "lastName", "address", "city", "zipcode", "phone"] as (keyof BaseContact)[]).map((field) => (
                                <div key={field} className="grid grid-cols-3 items-center gap-2">
                                  <span className="font-medium capitalize">
                                    {field === "firstName" ? "First Name" : field === "lastName" ? "Last Name" : field.charAt(0).toUpperCase() + field.slice(1)}:
                                  </span>
                                  <Input
                                    value={contact[field] as string}
                                    onChange={(e) => onFieldChange(contact.id, field, e.target.value)}
                                    className="col-span-2 h-8"
                                  />
                                </div>
                              ))}
                            </div>
                          </div>
                          <div>
                            <h3 className="text-sm font-medium mb-2">Notes & Status</h3>
                            <Textarea
                              placeholder="Add notes about this contact..."
                              value={contact.notes}
                              onChange={(e) => onNotesChange(contact.id, e.target.value)}
                              className="mb-2 min-h-[80px]"
                            />
                            <div className="flex items-center space-x-4">
                              <label className="flex items-center gap-2 text-sm cursor-pointer">
                                <Checkbox
                                  id={`address-update-${contact.id}`}
                                  checked={contact.needAddressUpdate}
                                  onCheckedChange={(checked) => onAddressUpdateChange(contact.id, !!checked)}
                                />
                                Address updated
                              </label>
                              <label className="flex items-center gap-2 text-sm cursor-pointer">
                                <Checkbox
                                  id={`phone-update-${contact.id}`}
                                  checked={contact.needPhoneUpdate}
                                  onCheckedChange={(checked) => onPhoneUpdateChange(contact.id, !!checked)}
                                />
                                Phone updated
                              </label>
                              <label className="flex items-center gap-2 text-sm cursor-pointer">
                                <Checkbox
                                  id={`territory-status-${contact.id}`}
                                  checked={contact.territoryStatus}
                                  onCheckedChange={(checked) => onTerritoryStatusChange(contact.id, !!checked)}
                                />
                                Different territory
                              </label>
                            </div>
                          </div>
                        </div>
                      </div>
                    </TableCell>
                  </TableRow>
                )}
              </React.Fragment>
            )
          })}
        </TableBody>
      </Table>
    </ScrollArea>
  )
}
