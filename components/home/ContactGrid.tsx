"use client"

import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import {
  Clock, StickyNote, AlertCircleIcon, Phone, MapPin, Globe, Search,
  CheckCircle2, XCircle, RefreshCw, CircleSlash,
} from "lucide-react"
import type { EnhancedContact, BaseContact } from "@/types/contact"

interface ContactGridProps {
  contacts: EnhancedContact[]
  selectedContacts: string[]
  lastVerifiedId: string | null
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

function getStatusIcon(status: EnhancedContact["status"]) {
  switch (status) {
    case "Potentially French": return <CheckCircle2 className="h-4 w-4 text-green-500" />
    case "Not checked":        return <XCircle className="h-4 w-4 text-blue-500" />
    case "Duplicate":          return <RefreshCw className="h-4 w-4 text-amber-500" />
    case "Not French":         return <CircleSlash className="h-4 w-4 text-red-500" />
    default:                   return null
  }
}

function getStatusColor(status: EnhancedContact["status"]) {
  switch (status) {
    case "Potentially French": return "bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300"
    case "Duplicate":          return "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300"
    case "Not checked":        return "bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300"
    default:                   return "bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300"
  }
}

export function ContactGrid({
  contacts,
  selectedContacts,
  lastVerifiedId,
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
}: ContactGridProps) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
      {contacts.map((contact) => (
        <Card
          key={contact.id}
          id={`contact-row-${contact.id}`}
          className={`overflow-hidden cursor-pointer ${contact.id === lastVerifiedId ? "border-l-4 border-l-green-500" : ""}`}
          onClick={() => onToggleExpanded(contact.id)}
        >
          <CardHeader className="pb-2">
            <div className="flex justify-between items-start">
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <Checkbox
                    checked={selectedContacts.includes(contact.id)}
                    onCheckedChange={() => onToggleSelection(contact.id)}
                    onClick={(e) => e.stopPropagation()}
                  />
                  <CardTitle className="text-base">{contact.fullName}</CardTitle>
                </div>
                <CardDescription className="mt-1">{contact.address}</CardDescription>
              </div>
              <Badge className={getStatusColor(contact.status)}>
                <div className="flex items-center gap-1">
                  {getStatusIcon(contact.status)}
                  <span>{contact.status}</span>
                </div>
              </Badge>
            </div>
          </CardHeader>

          <CardContent className="pb-2 pt-0">
            <div className="text-sm space-y-1">
              <div className="flex items-center gap-2">
                <MapPin className="h-3.5 w-3.5 text-muted-foreground" />
                <span>{contact.city}, {contact.zipcode}</span>
              </div>
              {contact.phone && (
                <div className="flex items-center gap-2">
                  <Phone className="h-3.5 w-3.5 text-muted-foreground" />
                  <span>{contact.phone}</span>
                </div>
              )}
            </div>

            <div className="flex flex-wrap gap-1 mt-2">
              {contact.id === lastVerifiedId && (
                <Badge variant="outline" className="bg-green-50 text-green-700 dark:bg-green-900/20 dark:text-green-400 border-green-200">
                  <Clock className="h-3 w-3 mr-1" /> Last verified
                </Badge>
              )}
              {contact.notes && contact.notes.trim() !== "" && (
                <Badge variant="outline" className="bg-blue-50 text-blue-700 dark:bg-blue-900/20 dark:text-blue-400 border-blue-200">
                  <StickyNote className="h-3 w-3 mr-1" /> Has notes
                </Badge>
              )}
              {contact.needAddressUpdate && (
                <Badge variant="outline" className="bg-amber-50 text-amber-700 dark:bg-amber-900/20 dark:text-amber-400 border-amber-200">
                  <AlertCircleIcon className="h-3 w-3 mr-1" /> Address update
                </Badge>
              )}
              {contact.needPhoneUpdate && (
                <Badge variant="outline" className="bg-amber-50 text-amber-700 dark:bg-amber-900/20 dark:text-amber-400 border-amber-200">
                  <Phone className="h-3 w-3 mr-1" /> Phone update
                </Badge>
              )}
              {contact.territoryStatus && (
                <Badge variant="outline" className="bg-red-50 text-red-700 dark:bg-red-900/20 dark:text-red-400 border-red-200">
                  <MapPin className="h-3 w-3 mr-1" /> Different territory
                </Badge>
              )}
            </div>
          </CardContent>

          <CardFooter className="flex justify-between pt-2">
            <Button
              variant="ghost" size="sm"
              onClick={(e) => { e.stopPropagation(); onToggleExpanded(contact.id) }}
              className="hover:bg-slate-100 dark:hover:bg-slate-800"
            >
              {contact.isExpanded ? "Less" : "More"}
            </Button>
            <div className="flex gap-1">
              <Tooltip>
                <TooltipTrigger asChild>
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
                <TooltipTrigger asChild>
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
          </CardFooter>

          {contact.isExpanded && (
            <div className="p-4 bg-muted/30 border-t" onClick={(e) => e.stopPropagation()}>
              <div className="grid grid-cols-1 gap-4">
                <div>
                  <h3 className="text-sm font-medium mb-2">Contact Details</h3>
                  <div className="space-y-3 text-sm">
                    {(["firstName", "lastName", "address", "city", "zipcode", "phone"] as (keyof BaseContact)[]).map((field) => (
                      <div key={field} className="grid grid-cols-3 items-center gap-2">
                        <span className="font-medium">{field === "firstName" ? "First Name" : field === "lastName" ? "Last Name" : field.charAt(0).toUpperCase() + field.slice(1)}:</span>
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
                  <div className="flex items-center space-x-4 mb-2">
                    <label className="flex items-center gap-2 text-sm cursor-pointer">
                      <Checkbox
                        id={`address-update-grid-${contact.id}`}
                        checked={contact.needAddressUpdate}
                        onCheckedChange={(checked) => onAddressUpdateChange(contact.id, !!checked)}
                      />
                      Address updated
                    </label>
                    <label className="flex items-center gap-2 text-sm cursor-pointer">
                      <Checkbox
                        id={`phone-update-grid-${contact.id}`}
                        checked={contact.needPhoneUpdate}
                        onCheckedChange={(checked) => onPhoneUpdateChange(contact.id, !!checked)}
                      />
                      Phone updated
                    </label>
                    <label className="flex items-center gap-2 text-sm cursor-pointer">
                      <Checkbox
                        id={`territory-status-grid-${contact.id}`}
                        checked={contact.territoryStatus}
                        onCheckedChange={(checked) => onTerritoryStatusChange(contact.id, !!checked)}
                      />
                      Different territory
                    </label>
                  </div>
                  <Select
                    value={contact.status}
                    onValueChange={(value) => onStatusChange(contact.id, value as EnhancedContact["status"])}
                  >
                    <SelectTrigger className="w-full rounded-full">
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
                </div>
              </div>
            </div>
          )}
        </Card>
      ))}
    </div>
  )
}
