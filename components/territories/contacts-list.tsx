"use client"

import { useState, useCallback } from "react"
import type { Contact } from "@/actions/territory-actions"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Checkbox } from "@/components/ui/checkbox"
import { LayoutGrid, LayoutList, Filter, ExternalLink, CheckCircle } from "lucide-react"
import { ScrollArea } from "@/components/ui/scroll-area"
import { updateContact, bulkUpdateContacts } from "@/actions/contact-actions"
import { ExportFrenchContacts } from "./export-french-contacts"
import { ExportJsonWithVerification } from "./export-json-with-verification"

interface ContactsListProps {
  contacts: Contact[]
  territoryId: string
}

type ViewType = "list" | "grid"

// Extended contact interface to include verification tracking
interface ExtendedContact extends Contact {
  all_actions_clicked?: boolean
  verification_sites_checked?: string[]
}

export function ContactsList({ contacts: initialContacts, territoryId }: ContactsListProps) {
  const [contacts, setContacts] = useState<ExtendedContact[]>(
    initialContacts.map((contact) => ({
      ...contact,
      all_actions_clicked: false,
      verification_sites_checked: [],
    })),
  )
  const [viewType, setViewType] = useState<ViewType>("list")
  const [searchQuery, setSearchQuery] = useState("")
  const [statusFilter, setStatusFilter] = useState<"All" | "Not checked" | "Potentially French" | "Not French">("All")
  const [showUpdateNeeded, setShowUpdateNeeded] = useState(false)
  const [selectedContacts, setSelectedContacts] = useState<string[]>([])

  // Filter contacts based on search query and filters
  const filteredContacts = contacts.filter((contact) => {
    // Apply status filter
    if (statusFilter !== "All" && contact.status !== statusFilter) {
      return false
    }

    // Apply "needs update" filter if enabled
    if (showUpdateNeeded && !contact.need_address_update && !contact.need_phone_update) {
      return false
    }

    // Apply search query filter
    if (searchQuery) {
      const query = searchQuery.toLowerCase()
      return (
        contact.first_name.toLowerCase().includes(query) ||
        contact.last_name.toLowerCase().includes(query) ||
        contact.full_name.toLowerCase().includes(query) ||
        contact.address.toLowerCase().includes(query) ||
        contact.city.toLowerCase().includes(query) ||
        contact.zipcode.toLowerCase().includes(query) ||
        contact.phone.toLowerCase().includes(query) ||
        contact.notes.toLowerCase().includes(query)
      )
    }

    return true
  })

  // Handle "All Actions" button click
  const handleAllActionsClick = useCallback(
    async (contactId: string) => {
      const contact = contacts.find((c) => c.id === contactId)
      if (!contact) return

      // Simulate verification sites
      const verificationSites = ["White Pages", "Facebook", "Google", "LinkedIn", "Public Records"]

      // Mark as verified
      const updatedContact = {
        ...contact,
        all_actions_clicked: true,
        verification_sites_checked: verificationSites,
      }

      // Update local state
      setContacts((prevContacts) => prevContacts.map((c) => (c.id === contactId ? updatedContact : c)))

      // You could also update the database here if needed
      try {
        await updateContact(contactId, {
          all_actions_clicked: true,
          verification_sites_checked: verificationSites.join(","),
        })
      } catch (error) {
        console.error("Error updating verification status:", error)
      }
    },
    [contacts],
  )

  // Toggle contact expanded state
  const toggleContactExpanded = useCallback(
    async (id: string) => {
      const contact = contacts.find((c) => c.id === id)
      if (!contact) return

      try {
        await updateContact(id, { is_expanded: !contact.is_expanded })

        setContacts((prevContacts) =>
          prevContacts.map((c) => (c.id === id ? { ...c, is_expanded: !c.is_expanded } : c)),
        )
      } catch (error) {
        console.error("Error toggling contact expanded state:", error)
      }
    },
    [contacts],
  )

  // Handle status change
  const handleStatusChange = useCallback(async (id: string, newStatus: Contact["status"]) => {
    try {
      await updateContact(id, { status: newStatus })

      setContacts((prevContacts) => prevContacts.map((c) => (c.id === id ? { ...c, status: newStatus } : c)))
    } catch (error) {
      console.error("Error updating contact status:", error)
    }
  }, [])

  // Toggle contact selection
  const toggleContactSelection = useCallback((id: string) => {
    setSelectedContacts((prev) => {
      if (prev.includes(id)) {
        return prev.filter((contactId) => contactId !== id)
      } else {
        return [...prev, id]
      }
    })
  }, [])

  // Select/deselect all contacts
  const toggleSelectAll = useCallback(() => {
    if (selectedContacts.length === filteredContacts.length) {
      setSelectedContacts([])
    } else {
      setSelectedContacts(filteredContacts.map((c) => c.id))
    }
  }, [filteredContacts, selectedContacts])

  // Filter contacts that need updates
  const filterContactsNeedingUpdates = useCallback(() => {
    setShowUpdateNeeded((prev) => !prev)
  }, [])

  // Update batch status
  const updateBatchStatus = useCallback(
    async (newStatus: Contact["status"]) => {
      if (selectedContacts.length === 0) {
        alert("Please select contacts to update")
        return
      }

      try {
        await bulkUpdateContacts(selectedContacts, { status: newStatus })

        setContacts((prevContacts) =>
          prevContacts.map((contact) =>
            selectedContacts.includes(contact.id) ? { ...contact, status: newStatus } : contact,
          ),
        )

        // Show success message
        alert(`Updated ${selectedContacts.length} contacts to "${newStatus}" status`)
      } catch (error) {
        console.error("Error updating batch status:", error)
        alert("Error updating contacts. Please try again.")
      }
    },
    [selectedContacts],
  )

  return (
    <>
      <Card className="mb-4">
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle>Contacts</CardTitle>
            <CardDescription>Manage and view your contacts.</CardDescription>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="icon"
              onClick={() => setViewType("list")}
              className={viewType === "list" ? "bg-muted" : ""}
            >
              <LayoutList className="h-4 w-4" />
            </Button>
            <Button
              variant="outline"
              size="icon"
              onClick={() => setViewType("grid")}
              className={viewType === "grid" ? "bg-muted" : ""}
            >
              <LayoutGrid className="h-4 w-4" />
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap items-center justify-between gap-4 mb-4">
            <div className="flex-1">
              <Input
                id="search-contacts"
                type="search"
                placeholder="Search contacts..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>
            <div className="flex items-center gap-2">
              <ExportFrenchContacts contacts={contacts} />
              <ExportJsonWithVerification contacts={contacts} />
              <Button
                variant="outline"
                size="sm"
                onClick={filterContactsNeedingUpdates}
                className={`flex items-center gap-1 ${
                  showUpdateNeeded ? "bg-amber-100 border-amber-200 dark:bg-amber-900/20 dark:border-amber-800" : ""
                }`}
              >
                <Filter className="h-4 w-4" />
                <span className="hidden sm:inline">{showUpdateNeeded ? "Show All" : "Needs Update"}</span>
              </Button>
              <Select value={statusFilter} onValueChange={(value) => setStatusFilter(value as any)}>
                <SelectTrigger className="w-[180px]">
                  <SelectValue placeholder="Filter by Status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="All">All</SelectItem>
                  <SelectItem value="Not checked">Not checked</SelectItem>
                  <SelectItem value="Potentially French">Potentially French</SelectItem>
                  <SelectItem value="Not French">Not French</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* List View */}
          {viewType === "list" && (
            <ScrollArea className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[30px]">
                      <Checkbox
                        checked={selectedContacts.length > 0 && selectedContacts.length === filteredContacts.length}
                        onCheckedChange={toggleSelectAll}
                      />
                    </TableHead>
                    <TableHead className="w-[150px]">Name</TableHead>
                    <TableHead>Address</TableHead>
                    <TableHead>City</TableHead>
                    <TableHead>Zipcode</TableHead>
                    <TableHead>Phone</TableHead>
                    <TableHead className="w-[120px]">Status</TableHead>
                    <TableHead className="w-[100px]">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredContacts.map((contact) => (
                    <TableRow
                      key={contact.id}
                      className="cursor-pointer"
                      onClick={() => toggleContactExpanded(contact.id)}
                    >
                      <TableCell onClick={(e) => e.stopPropagation()}>
                        <Checkbox
                          checked={selectedContacts.includes(contact.id)}
                          onCheckedChange={() => toggleContactSelection(contact.id)}
                        />
                      </TableCell>
                      <TableCell className="font-medium">
                        <div className="flex items-center gap-2">
                          {contact.full_name}
                          {contact.all_actions_clicked && <CheckCircle className="h-4 w-4 text-green-500" />}
                        </div>
                      </TableCell>
                      <TableCell>{contact.address}</TableCell>
                      <TableCell>{contact.city}</TableCell>
                      <TableCell>{contact.zipcode}</TableCell>
                      <TableCell>{contact.phone}</TableCell>
                      <TableCell>
                        <Select
                          value={contact.status}
                          onValueChange={(value) => handleStatusChange(contact.id, value as any)}
                        >
                          <SelectTrigger className="w-[140px] rounded-full">
                            <SelectValue placeholder={contact.status} />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="Not checked">Not checked</SelectItem>
                            <SelectItem value="Potentially French">Potentially French</SelectItem>
                            <SelectItem value="Not French">Not French</SelectItem>
                          </SelectContent>
                        </Select>
                      </TableCell>
                      <TableCell onClick={(e) => e.stopPropagation()}>
                        {(contact.status === "Potentially French" || contact.status === "french") && (
                          <Button
                            size="sm"
                            variant={contact.all_actions_clicked ? "default" : "outline"}
                            onClick={() => handleAllActionsClick(contact.id)}
                            disabled={contact.all_actions_clicked}
                            className="flex items-center gap-1"
                          >
                            {contact.all_actions_clicked ? (
                              <>
                                <CheckCircle className="h-3 w-3" />
                                Verified
                              </>
                            ) : (
                              <>
                                <ExternalLink className="h-3 w-3" />
                                All Actions
                              </>
                            )}
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </ScrollArea>
          )}

          {/* Grid View */}
          {viewType === "grid" && (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {filteredContacts.map((contact) => (
                <Card
                  key={contact.id}
                  className="cursor-pointer hover:shadow-md transition-shadow"
                  onClick={() => toggleContactExpanded(contact.id)}
                >
                  <CardHeader className="pb-2">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Checkbox
                          checked={selectedContacts.includes(contact.id)}
                          onCheckedChange={() => toggleContactSelection(contact.id)}
                          onClick={(e) => e.stopPropagation()}
                        />
                        <CardTitle className="text-base flex items-center gap-2">
                          {contact.full_name}
                          {contact.all_actions_clicked && <CheckCircle className="h-4 w-4 text-green-500" />}
                        </CardTitle>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <div className="text-sm space-y-1">
                      <p>{contact.address}</p>
                      <p>
                        {contact.city}, {contact.zipcode}
                      </p>
                      <p>{contact.phone}</p>
                    </div>
                    <div className="mt-4 space-y-2">
                      <Select
                        value={contact.status}
                        onValueChange={(value) => handleStatusChange(contact.id, value as any)}
                      >
                        <SelectTrigger className="w-full rounded-full">
                          <SelectValue placeholder={contact.status} />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="Not checked">Not checked</SelectItem>
                          <SelectItem value="Potentially French">Potentially French</SelectItem>
                          <SelectItem value="Not French">Not French</SelectItem>
                        </SelectContent>
                      </Select>

                      {(contact.status === "Potentially French" || contact.status === "french") && (
                        <Button
                          size="sm"
                          variant={contact.all_actions_clicked ? "default" : "outline"}
                          onClick={(e) => {
                            e.stopPropagation()
                            handleAllActionsClick(contact.id)
                          }}
                          disabled={contact.all_actions_clicked}
                          className="w-full flex items-center gap-1"
                        >
                          {contact.all_actions_clicked ? (
                            <>
                              <CheckCircle className="h-3 w-3" />
                              Verified
                            </>
                          ) : (
                            <>
                              <ExternalLink className="h-3 w-3" />
                              All Actions
                            </>
                          )}
                        </Button>
                      )}
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Floating Batch Action Box */}
      {selectedContacts.length > 0 && (
        <div className="fixed bottom-0 left-0 right-0 bg-background border-t shadow-lg p-4 z-50 transition-all duration-300 ease-in-out">
          <div className="container mx-auto flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="font-medium">{selectedContacts.length} contacts selected</span>
              <Button size="sm" variant="outline" onClick={() => setSelectedContacts([])}>
                Clear Selection
              </Button>
            </div>
            <div className="flex items-center gap-2">
              <Button size="sm" variant="outline" onClick={() => updateBatchStatus("Not checked")}>
                Not Checked
              </Button>
              <Button size="sm" variant="outline" onClick={() => updateBatchStatus("Potentially French")}>
                Potentially French
              </Button>
              <Button size="sm" variant="outline" onClick={() => updateBatchStatus("Not French")}>
                Not French
              </Button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
