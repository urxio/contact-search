"use client"

import { useState, useCallback, useMemo } from "react"
// Local Contact shape used by this component. We declare it here to avoid
// depending on an external type that may not match the runtime shape.
// Keep this narrow: expand only if new compiler errors indicate missing fields.
interface Contact {
  id: string
  first_name: string
  last_name: string
  full_name: string
  address: string
  city: string
  zipcode: string
  phone: string
  notes: string
  status: "Not checked" | "Potentially French" | "Duplicate" | "Not French" | "french"
  | "Detected"
  need_address_update?: boolean
  need_phone_update?: boolean
  is_expanded?: boolean
}
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Checkbox } from "@/components/ui/checkbox"
import { LayoutGrid, LayoutList, Filter, ExternalLink, CheckCircle } from "lucide-react"
import { ScrollArea } from "@/components/ui/scroll-area"
import { FixedSizeList as List } from "react-window"
import { updateContact, bulkUpdateContacts, createContact } from "@/actions/contact-actions"
import { loadDictionaryIfNeeded, isPotentiallyFrench } from "@/utils/french-name-detection"
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
  const [statusFilter, setStatusFilter] = useState<"All" | "Not checked" | "Potentially French" | "Not French" | "Duplicate" | "Detected">("All")
  const [showUpdateNeeded, setShowUpdateNeeded] = useState(false)
  const [selectedContacts, setSelectedContacts] = useState<string[]>([])
  const [isAddContactOpen, setIsAddContactOpen] = useState(false)
  const [newContact, setNewContact] = useState<Partial<Contact>>({
    first_name: "",
    last_name: "",
    full_name: "",
    address: "",
    city: "",
    zipcode: "",
    phone: "",
    notes: "",
  })

  // Keyboard shortcut to open Add dialog (Ctrl+J) — ignore when typing in inputs
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const active = document.activeElement as HTMLElement | null
      const tag = active?.tagName?.toLowerCase()
      const isTyping = tag === "input" || tag === "textarea" || active?.isContentEditable

      if (e.ctrlKey && (e.key === "j" || e.key === "J")) {
        if (isTyping) return
        e.preventDefault()
        setIsAddContactOpen(true)
      }
    }

    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [])

  // Filter contacts based on search query and filters (memoized)
  const filteredContacts = useMemo(() => {
    return contacts.filter((contact) => {
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
  }, [contacts, statusFilter, showUpdateNeeded, searchQuery])

  
  
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
    // Optimistic update: update UI immediately, then persist in background
    setContacts((prevContacts) => prevContacts.map((c) => (c.id === id ? { ...c, status: newStatus } : c)))

    updateContact(id, { status: newStatus }).catch((error: any) => {
      console.error("Error updating contact status:", error)
      // Optionally revert UI on failure (simple strategy: no revert here, but could be implemented)
    })
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
    (newStatus: Contact["status"]) => {
      if (selectedContacts.length === 0) {
        alert("Please select contacts to update")
        return
      }

      // Optimistic update: update UI immediately
      setContacts((prevContacts) =>
        prevContacts.map((contact) =>
          selectedContacts.includes(contact.id) ? { ...contact, status: newStatus } : contact,
        ),
      )

      // Fire-and-forget bulk update; report errors but don't block UI
      bulkUpdateContacts(selectedContacts, { status: newStatus })
        .then(() => {
          // Optionally show success feedback (kept silent to avoid excessive alerts)
        })
        .catch((error: any) => {
          console.error("Error updating batch status:", error)
          alert("Error updating contacts. Some changes may not have been saved.")
        })
    },
    [selectedContacts],
  )

  // Memoize rendered list rows to avoid rebuilding large arrays on unrelated state changes
  const listRows = useMemo(() => {
    return filteredContacts.map((contact) => (
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
              <SelectItem value="Duplicate">Duplicate</SelectItem>
              <SelectItem value="Not French">Not French</SelectItem>
            </SelectContent>
          </Select>
        </TableCell>
        <TableCell onClick={(e) => e.stopPropagation()}>
          {(contact.status === "Potentially French" || contact.status === "french" || contact.status === "Detected") && (
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
    ))
  }, [filteredContacts, selectedContacts, toggleContactExpanded, toggleContactSelection, handleStatusChange, handleAllActionsClick])

  // Memoize grid cards to reduce re-renders
  const gridCards = useMemo(() => {
    return filteredContacts.map((contact) => (
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
                  <SelectItem value="Detected">Detected</SelectItem>
                  <SelectItem value="Duplicate">Duplicate</SelectItem>
                  <SelectItem value="Not French">Not French</SelectItem>
                </SelectContent>
            </Select>

            {(contact.status === "Potentially French" || contact.status === "french" || contact.status === "Detected") && (
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
    ))
  }, [filteredContacts, selectedContacts, toggleContactExpanded, toggleContactSelection, handleStatusChange, handleAllActionsClick])

  return (
    <>
      <Card className="mb-4">
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle>Contacts</CardTitle>
            <CardDescription>Manage and view your contacts.</CardDescription>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => setIsAddContactOpen(true)} className="flex items-center gap-2">
              Add contact
            </Button>
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

          <Dialog open={isAddContactOpen} onOpenChange={setIsAddContactOpen}>
            <DialogContent className="sm:max-w-[720px]">
              <DialogHeader>
                <DialogTitle>Add a new contact</DialogTitle>
                <DialogDescription>Fill out the fields and save to add this contact.</DialogDescription>
              </DialogHeader>

              <div className="grid gap-2 py-4 grid-cols-1 sm:grid-cols-2">
                <Input placeholder="First name" value={newContact.first_name || ""} onChange={(e) => setNewContact((s) => ({ ...s, first_name: e.target.value }))} />
                <Input placeholder="Last name" value={newContact.last_name || ""} onChange={(e) => setNewContact((s) => ({ ...s, last_name: e.target.value }))} />
                <Input placeholder="Address" value={newContact.address || ""} onChange={(e) => setNewContact((s) => ({ ...s, address: e.target.value }))} />
                <Input placeholder="City" value={newContact.city || ""} onChange={(e) => setNewContact((s) => ({ ...s, city: e.target.value }))} />
                <Input placeholder="Zipcode" value={newContact.zipcode || ""} onChange={(e) => setNewContact((s) => ({ ...s, zipcode: e.target.value }))} />
                <Input placeholder="Phone" value={newContact.phone || ""} onChange={(e) => setNewContact((s) => ({ ...s, phone: e.target.value }))} />
                <div className="sm:col-span-2">
                  <Textarea placeholder="Notes" value={newContact.notes || ""} onChange={(e) => setNewContact((s) => ({ ...s, notes: e.target.value }))} />
                </div>
              </div>

              <div className="flex justify-end gap-2 mt-2">
                <Button variant="outline" onClick={() => setIsAddContactOpen(false)}>Cancel</Button>
                <Button onClick={async () => {
                  // minimal validation
                  const fn = (newContact.first_name || "").trim()
                  const ln = (newContact.last_name || "").trim()
                  if (!fn && !ln) {
                    alert('Please provide at least a first or last name')
                    return
                  }

                  const created: Contact = {
                    id: Math.random().toString(36).substring(2, 11),
                    first_name: fn,
                    last_name: ln,
                    full_name: `${fn} ${ln}`.trim(),
                    address: newContact.address || "",
                    city: newContact.city || "",
                    zipcode: newContact.zipcode || "",
                    phone: newContact.phone || "",
                    notes: newContact.notes || "",
                    status: "Not checked",
                  }

                  // run detection if available
                  try {
                    await loadDictionaryIfNeeded()
                    if (isPotentiallyFrench(created.last_name || created.full_name)) {
                      created.status = "Detected"
                    }
                  } catch (e) {
                    console.warn('detection not available', e)
                  }

                  setContacts((prev) => [created, ...prev])
                  try {
                    await createContact(created)
                  } catch (e) {
                    console.warn('failed to persist new contact', e)
                  }

                  setNewContact({ first_name: "", last_name: "", full_name: "", address: "", city: "", zipcode: "", phone: "", notes: "" })
                  setIsAddContactOpen(false)
                  alert('Contact added')
                }}>Create</Button>
              </div>
            </DialogContent>
          </Dialog>
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
                      <Button variant="outline" size="sm" onClick={() => setIsAddContactOpen(true)} className="flex items-center gap-2">
                        <Plus className="h-4 w-4" />
                        <span className="hidden sm:inline">Add contact</span>
                      </Button>
                  <SelectItem value="Not French">Not French</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* List View */}
          {viewType === "list" && (
            <div className="rounded-md border">
              {/* Header */}
              <div className="overflow-hidden">
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
                </Table>
              </div>

              {/* Virtualized body for large lists */}
              {filteredContacts.length > 50 ? (
                <List
                  height={400}
                  itemCount={listRows.length}
                  itemSize={62}
                  width="100%"
                >
                  {({ index, style }: { index: number; style: React.CSSProperties }) => (
                    <div style={style} key={(filteredContacts[index] && filteredContacts[index].id) || index}>
                      <Table>
                        <TableBody>{listRows[index]}</TableBody>
                      </Table>
                    </div>
                  )}
                </List>
              ) : (
                <ScrollArea className="rounded-b-md">
                  <Table>
                    <TableBody>{listRows}</TableBody>
                  </Table>
                </ScrollArea>
              )}
            </div>
          )}

          {/* Grid View */}
              {viewType === "grid" && <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">{gridCards}</div>}
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
              <Button size="sm" variant="outline" onClick={() => updateBatchStatus("Duplicate")}>
                Duplicate
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
