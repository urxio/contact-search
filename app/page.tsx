"use client"

import React from "react"
import { useEffect, useState, useCallback, useMemo, useRef } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import {
  Upload,
  Check,
  Copy,
  HelpCircle,
  ChevronDown,
  ChevronRight,
  Search,
  Phone,
  AlertCircleIcon,
  Clock,
  StickyNote,
  Keyboard,
  LayoutGrid,
  LayoutList,
  CheckCircle2,
  XCircle,
  CircleSlash,
  MapPin,
  Globe,
  RefreshCw,
  FileJson,
  FileSpreadsheet,
  Import
} from "lucide-react"

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { ThemeSwitcher } from "@/components/theme-switcher"
import { Checkbox } from "@/components/ui/checkbox"
import { Badge } from "@/components/ui/badge"
import * as XLSX from "xlsx"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogTrigger,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Alert, AlertTitle, AlertDescription } from "@/components/ui/alert"
import { loadDictionaryIfNeeded, isPotentiallyFrench } from "@/utils/french-name-detection"
import { Textarea } from "@/components/ui/textarea"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Filter } from "lucide-react"
import { ScrollArea } from "@/components/ui/scroll-area"

// Add a useRef for the file input at the top of the component with the other state variables

// Update the fixed column indices to match the new format
const FIXED_COLUMNS = {
  FIRST_NAME: 0, // 1st column
  LAST_NAME: 1, // 2nd column
  ADDRESS: 2, // 3rd column
  CITY: 3, // 4th column
  ZIPCODE: 4, // 5th column
  PHONE: 5, // 6th column
}

// Update the BaseContact interface to match the new format
interface BaseContact {
  firstName: string
  lastName: string
  fullName: string // Combined name field
  address: string
  city: string
  zipcode: string
  phone: string
}

// Update the EnhancedContact interface to include territoryStatus
interface EnhancedContact extends BaseContact {
  id: string
  status: "Not checked" | "Potentially French" | "Not French" | "Duplicate" | "Detected"
  notes: string
  isExpanded: boolean
  checkedOnTPS: boolean
  checkedOnOTM: boolean
  checkedOnForebears: boolean
  needAddressUpdate: boolean
  needPhoneUpdate: boolean
  lastInteraction?: Date // Add timestamp for last interaction
  territoryStatus: boolean // Add territory status field
  // Flag set by automated name detection (heuristic)
  frenchNameMatched?: boolean
}

// Add this debug function at the top of the file, right after the interfaces
const debugObject = (obj: any, label: string) => {
  console.log(`--- DEBUG ${label} ---`)
  for (const key in obj) {
    console.log(`${key}: ${obj[key]}`)
  }
  console.log(`--- END DEBUG ${label} ---`)
}

// Add this utility function after the debugObject function
const parseAddress = (address: string) => {
  // Default values
  let houseNumber = ""
  let direction = ""
  let streetName = ""
  let aptNum = ""

  // Try to extract components
  if (address) {
    // Extract apartment number if present
    const aptMatch = address.match(/(?:apt|unit|#|suite)\s*([a-z0-9-]+)/i)
    if (aptMatch) {
      aptNum = aptMatch[1]
      // Remove apt from the address for further processing
      address = address.replace(aptMatch[0], "").trim()
    }

    // Extract house number, direction, and street name
    // Pattern: house number + optional direction + street name
    const addressMatch = address.match(/^(\d+)\s+(?:(N|S|E|W|NE|NW|SE|SW)\s+)?(.+?)$/i)

    if (addressMatch) {
      houseNumber = addressMatch[1] || ""
      direction = addressMatch[2] || ""
      streetName = addressMatch[3] || ""
    } else {
      // If the pattern doesn't match, just use the whole address as street name
      streetName = address
    }
  }

  return { houseNumber, direction, streetName, aptNum }
}

// Define view types
type ViewType = "list" | "grid"

export default function Home() {
  const [contacts, setContacts] = useState<EnhancedContact[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [fileUploaded, setFileUploaded] = useState(false)
  const [globalNotes, setGlobalNotes] = useState("")
  const [territoryZipcode, setTerritoryZipcode] = useState("")
  const [territoryPageRange, setTerritoryPageRange] = useState("")
  const [copiedId, setCopiedId] = useState<string | null>(null)
  const [isDocOpen, setIsDocOpen] = useState(false)

  // Add new state variables for efficiency features
  const [selectedContacts, setSelectedContacts] = useState<string[]>([])
  const [showUpdateNeeded, setShowUpdateNeeded] = useState(false)
  const [viewType, setViewType] = useState<ViewType>("list")

  // Add this new state variable with the other state variables
  const [lastVerifiedId, setLastVerifiedId] = useState<string | null>(null)
  const [isDetecting, setIsDetecting] = useState(false)

  // Add a keyboard shortcuts help dialog
  // Add this state variable with the other state variables
  const [isKeyboardHelpOpen, setIsKeyboardHelpOpen] = useState(false)

  const [searchQuery, setSearchQuery] = useState("")
  // Debounced search to avoid re-filtering on every keystroke
  const [debouncedSearchQuery, setDebouncedSearchQuery] = useState(searchQuery)
  const [statusFilter, setStatusFilter] = useState<"All" | "Not checked" | "Potentially French" | "Not French" | "Duplicate" | "Detected">("All")

  // useRef hook for the file input
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Update the memoized filtered contacts
  const potentiallyFrenchContacts = useMemo(() => {
    return contacts.filter((contact) => contact.status === "Potentially French")
  }, [contacts])

  // Update debounced search query after a short delay
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearchQuery(searchQuery), 250)
    return () => clearTimeout(t)
  }, [searchQuery])

  const filteredContacts = useMemo(() => {
    return contacts.filter((contact) => {
      // Apply status filter
      if (statusFilter !== "All" && contact.status !== statusFilter) {
        return false
      }

      // Apply "needs update" filter if enabled
      if (showUpdateNeeded && !contact.needAddressUpdate && !contact.needPhoneUpdate) {
        return false
      }

      // Apply search query filter (debounced)
      if (debouncedSearchQuery) {
        const query = debouncedSearchQuery.toLowerCase()
        return (
          contact.firstName.toLowerCase().includes(query) ||
          contact.lastName.toLowerCase().includes(query) ||
          contact.fullName.toLowerCase().includes(query) ||
          contact.address.toLowerCase().includes(query) ||
          contact.city.toLowerCase().includes(query) ||
          contact.zipcode.toLowerCase().includes(query) ||
          contact.phone.toLowerCase().includes(query) ||
          contact.notes.toLowerCase().includes(query)
        )
      }

      return true
    })
  }, [contacts, debouncedSearchQuery, statusFilter, showUpdateNeeded])

  // Update statistics calculations
  const notCheckedCount = useMemo(() => contacts.filter((c) => c.status === "Not checked").length, [contacts])
  const potentiallyFrenchCount = useMemo(
    () => contacts.filter((c) => c.status === "Potentially French").length,
    [contacts],
  )
  const notFrenchCount = useMemo(() => contacts.filter((c) => c.status === "Not French").length, [contacts])

  const detectedCount = useMemo(() => contacts.filter((c) => c.status === "Detected").length, [contacts])

  const potentiallyFrenchPercentage = useMemo(
    () => (contacts.length > 0 ? Math.round((potentiallyFrenchCount / contacts.length) * 100) : 0),
    [contacts, potentiallyFrenchCount],
  )

  // Load contacts and notes from localStorage on component mount
  useEffect(() => {
    const savedContacts = localStorage.getItem("contacts")
    const savedNotes = localStorage.getItem("globalNotes")
    const savedZipcode = localStorage.getItem("territoryZipcode")
    const savedPageRange = localStorage.getItem("territoryPageRange")
    const savedViewType = localStorage.getItem("viewType") as ViewType | null

    if (savedContacts) {
      try {
        setContacts(JSON.parse(savedContacts))
      } catch (e) {
        console.error("Error loading saved contacts:", e)
      }
    }

    if (savedNotes) {
      setGlobalNotes(savedNotes)
    }

    if (savedZipcode) {
      setTerritoryZipcode(savedZipcode)
    }

    if (savedPageRange) {
      setTerritoryPageRange(savedPageRange)
    }

    if (savedViewType) {
      setViewType(savedViewType)
    }

    // Add keyboard shortcuts
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ctrl+F for search focus
      if (e.ctrlKey && e.key === "f") {
        e.preventDefault()
        document.getElementById("search-contacts")?.focus()
      }
    }

    window.addEventListener("keydown", handleKeyDown)
    return () => window.removeEventListener("keydown", handleKeyDown)
  }, [])

  // Save contacts to localStorage whenever they change
  // Debounced save of contacts to localStorage to avoid frequent writes
  useEffect(() => {
    const handle = setTimeout(() => {
      try {
        if (contacts.length > 0) {
          localStorage.setItem("contacts", JSON.stringify(contacts))
        } else {
          localStorage.removeItem("contacts")
        }
      } catch (e) {
        console.error("Failed to save contacts to localStorage", e)
      }
    }, 500)

    return () => clearTimeout(handle)
  }, [contacts])

  // Save global notes to localStorage whenever they change
  // Debounce global notes saves to avoid frequent writes
  useEffect(() => {
    const t = setTimeout(() => {
      try {
        localStorage.setItem("globalNotes", globalNotes)
      } catch (e) {
        console.error("Error saving globalNotes:", e)
      }
    }, 500)

    return () => clearTimeout(t)
  }, [globalNotes])

  // Save view type to localStorage whenever it changes
  useEffect(() => {
    localStorage.setItem("viewType", viewType)
  }, [viewType])

  // Save zipcode to localStorage whenever it changes
  useEffect(() => {
    localStorage.setItem("territoryZipcode", territoryZipcode)
  }, [territoryZipcode])

  // Save page range to localStorage whenever it changes
  useEffect(() => {
    localStorage.setItem("territoryPageRange", territoryPageRange)
  }, [territoryPageRange])

  // Reset copied state after 2 seconds
  useEffect(() => {
    if (copiedId) {
      const timer = setTimeout(() => {
        setCopiedId(null)
      }, 2000)
      return () => clearTimeout(timer)
    }
  }, [copiedId])

  // Function to toggle contact expanded state
  const toggleContactExpanded = useCallback((id: string) => {
    setContacts((prevContacts) =>
      prevContacts.map((contact) => (contact.id === id ? { ...contact, isExpanded: !contact.isExpanded } : contact)),
    )
  }, [])

  // Updated file upload function for the new format
  const handleFileUpload = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) {
      console.log("No file selected")
      return
    }

    console.log("File selected:", file.name)
    setIsLoading(true)
    setError(null)

    const reader = new FileReader()

    reader.onload = (e) => {
      try {
        const data = e.target?.result
        const workbook = XLSX.read(data, { type: "binary" })
        const sheetName = workbook.SheetNames[0]
        const worksheet = workbook.Sheets[sheetName]

        // Convert to array of arrays for simpler processing
        const rawData = XLSX.utils.sheet_to_json<any[]>(worksheet, { header: 1 })

        if (rawData.length <= 1) {
          // Check if there's data beyond the header row
          throw new Error("No data found in the Excel file")
        }

        // Skip header row (index 0) and process data rows
        const processedContacts = rawData.slice(1).map((row) => {
          // Extract values by position based on the new format
          const firstName = String(row[FIXED_COLUMNS.FIRST_NAME] || "")
          const lastName = String(row[FIXED_COLUMNS.LAST_NAME] || "")
          const address = String(row[FIXED_COLUMNS.ADDRESS] || "")
          const city = String(row[FIXED_COLUMNS.CITY] || "")
          const zipcode = String(row[FIXED_COLUMNS.ZIPCODE] || "")
          const phone = String(row[FIXED_COLUMNS.PHONE] || "")

          // Combine first and last name
          const fullName = `${firstName} ${lastName}`.trim()

          // Create enhanced contact with ID and default values
          return {
            firstName,
            lastName,
            fullName,
            address,
            city,
            zipcode,
            phone,
            id: Math.random().toString(36).substring(2, 11),
            status: "Not checked" as const,
            notes: "",
            isExpanded: false,
            checkedOnTPS: false,
            checkedOnOTM: false,
            checkedOnForebears: false,
            needAddressUpdate: false,
            needPhoneUpdate: false,
            territoryStatus: false, // Initialize territory status
          }
        })

        setContacts(processedContacts)
        setFileUploaded(true)
        // Run detection automatically after import (non-blocking)
        setTimeout(() => {
          try {
            ;(detectFrenchNames as any)?.(false, processedContacts)
          } catch (e) {
            console.warn("detectFrenchNames not available yet", e)
          }
        }, 50)
      } catch (error) {
        console.error("Error parsing Excel file:", error)
        setError(`Error parsing Excel file: ${error instanceof Error ? error.message : "Unknown error"}`)
        setContacts([])
      } finally {
        setIsLoading(false)
      }
    }

    reader.onerror = () => {
      setIsLoading(false)
      setError("Error reading file. Please try again.")
    }

    reader.readAsBinaryString(file)
  }, [])

  // Function to update last verified ID and record interaction time
  const updateLastInteraction = useCallback((id: string) => {
    setLastVerifiedId(id)
    localStorage.setItem("lastVerifiedId", id)

    // Update the contact's last interaction timestamp
    setContacts((prevContacts) => prevContacts.map((c) => (c.id === id ? { ...c, lastInteraction: new Date() } : c)))
  }, [])

  // Update the searchOnTruePeopleSearch function to use fullName and zipcode
  const searchOnTruePeopleSearch = useCallback(
    (contact: EnhancedContact) => {
      if (!contact.fullName || !contact.zipcode) {
        alert("Contact name and zipcode are required for search")
        return
      }

      // Create the search URL
      const searchUrl = `https://www.truepeoplesearch.com/results?name=${encodeURIComponent(
        contact.fullName,
      )}&citystatezip=${encodeURIComponent(contact.zipcode)}`

      // Mark as checked but don't change status
      setContacts((prevContacts) => prevContacts.map((c) => (c.id === contact.id ? { ...c, checkedOnTPS: true } : c)))

      // Set as last verified
      updateLastInteraction(contact.id)

      // Open in a new tab
      window.open(searchUrl, "_blank")
    },
    [updateLastInteraction],
  )

  // Update the copyAndSearchOTM function to copy contact name and use the new URL
  const copyAndSearchOTM = useCallback(
    async (contact: EnhancedContact) => {
      // Copy the contact name to the clipboard
      try {
        await navigator.clipboard.writeText(contact.fullName)
        setCopiedId(contact.id)
      } catch (err) {
        console.error("Failed to copy contact name: ", err)
        alert("Failed to copy contact name to clipboard")
        return
      }

      // Create the OTM search URL
      const otmSearchUrl = "https://mobile.onlineterritorymanager.com/AddrSearch.php"

      // Mark as checked but don't change status
      setContacts((prevContacts) => prevContacts.map((c) => (c.id === contact.id ? { ...c, checkedOnOTM: true } : c)))

      // Set as last verified
      updateLastInteraction(contact.id)

      // Open in a new tab
      window.open(otmSearchUrl, "_blank")
    },
    [updateLastInteraction],
  )

  // Add a new function to search on Forebears.io
  const searchOnForebears = useCallback(
    (contact: EnhancedContact) => {
      if (!contact.lastName) {
        alert("Last name is required for Forebears search")
        return
      }

      // Create the Forebears search URL
      const forebearsUrl = `https://forebears.io/surnames/${encodeURIComponent(contact.lastName)}`

      // Mark as checked on Forebears
      setContacts((prevContacts) =>
        prevContacts.map((c) => (c.id === contact.id ? { ...c, checkedOnForebears: true } : c)),
      )

      // Set as last verified
      updateLastInteraction(contact.id)

      // Open in a new tab
      window.open(forebearsUrl, "_blank")
    },
    [updateLastInteraction],
  )

  // Update the handleStatusChange function
  const handleStatusChange = useCallback(
    (id: string, newStatus: EnhancedContact["status"]) => {
      setContacts((prevContacts) =>
        prevContacts.map((contact) => (contact.id === id ? { ...contact, status: newStatus } : contact)),
      )

      // Set the last verified ID when a contact is marked as Potentially French
      if (newStatus === "Potentially French") {
        updateLastInteraction(id)
      }
    },
    [updateLastInteraction],
  )

  // Update the handleNotesChange function
  const handleNotesChange = useCallback((id: string, newNotes: string) => {
    setContacts((prevContacts) =>
      prevContacts.map((contact) => (contact.id === id ? { ...contact, notes: newNotes } : contact)),
    )
  }, [])

  // Update the handleAddressUpdateChange function
  const handleAddressUpdateChange = useCallback((id: string, needAddressUpdate: boolean) => {
    setContacts((prevContacts) =>
      prevContacts.map((contact) =>
        contact.id === id ? { ...contact, needAddressUpdate: needAddressUpdate } : contact,
      ),
    )
  }, [])

  // Update the handlePhoneUpdateChange function
  const handlePhoneUpdateChange = useCallback((id: string, needPhoneUpdate: boolean) => {
    setContacts((prevContacts) =>
      prevContacts.map((contact) => (contact.id === id ? { ...contact, needPhoneUpdate: needPhoneUpdate } : contact)),
    )
  }, [])

  // Function to update contact field
  const updateContactField = useCallback((id: string, field: keyof BaseContact, value: string) => {
    setContacts((prevContacts) =>
      prevContacts.map((contact) => {
        if (contact.id !== id) return contact

        const updatedContact = { ...contact, [field]: value }

        // Auto-check "address needs update" when address field is edited
        if (field === "address" || field === "city") {
          updatedContact.needAddressUpdate = true
          // Auto-set status to "Potentially French" when address is edited
          updatedContact.status = "Potentially French"
        }

        // Auto-check "phone needs update" when phone field is edited
        if (field === "phone") {
          updatedContact.needPhoneUpdate = true
          // Auto-set status to "Potentially French" when phone is edited
          updatedContact.status = "Potentially French"
        }

        // Set territory status when zipcode is changed
        if (field === "zipcode") {
          updatedContact.territoryStatus = true
        }

        // If we're updating first or last name, recalculate the full name
        if (field === "firstName" || field === "lastName") {
          updatedContact.fullName = `${field === "firstName" ? value : contact.firstName} ${
            field === "lastName" ? value : contact.lastName
          }`.trim()
        }

        return updatedContact
      }),
    )
  }, [])

  // Update the deleteContact function
  const deleteContact = useCallback((id: string) => {
    setContacts((prevContacts) => prevContacts.filter((contact) => contact.id !== id))
  }, [])

  // Function to handle batch status updates
  const updateBatchStatus = useCallback(
    (newStatus: EnhancedContact["status"]) => {
      if (selectedContacts.length === 0) {
        alert("Please select contacts to update")
        return
      }

      setContacts((prevContacts) =>
        prevContacts.map((contact) =>
          selectedContacts.includes(contact.id) ? { ...contact, status: newStatus } : contact,
        ),
      )

      // Show success message
      alert(`Updated ${selectedContacts.length} contacts to "${newStatus}" status`)
    },
    [selectedContacts],
  )

  // Function to toggle contact selection
  const toggleContactSelection = useCallback((id: string) => {
    setSelectedContacts((prev) => {
      if (prev.includes(id)) {
        return prev.filter((contactId) => contactId !== id)
      } else {
        return [...prev, id]
      }
    })
  }, [])

  // Function to select/deselect all contacts
  const toggleSelectAll = useCallback(() => {
    if (selectedContacts.length === filteredContacts.length) {
      setSelectedContacts([])
    } else {
      setSelectedContacts(filteredContacts.map((c) => c.id))
    }
  }, [filteredContacts, selectedContacts])

  // Function to filter contacts that need updates
  const filterContactsNeedingUpdates = useCallback(() => {
    setShowUpdateNeeded((prev) => !prev)
  }, [])

  // Add a quick navigation feature to jump to the last verified contact
  // Add this function after the filterContactsNeedingUpdates function
  const scrollToLastVerified = useCallback(() => {
    if (lastVerifiedId) {
      const element = document.getElementById(`contact-row-${lastVerifiedId}`)
      if (element) {
        element.scrollIntoView({ behavior: "smooth", block: "center" })

        // Highlight the row temporarily
        element.classList.add("bg-green-200", "dark:bg-green-800")
        setTimeout(() => {
          element.classList.remove("bg-green-200", "dark:bg-green-800")
        }, 2000)
      }
    }
  }, [lastVerifiedId])

  // Add this useEffect to load the last verified ID from localStorage
  useEffect(() => {
    const savedLastVerifiedId = localStorage.getItem("lastVerifiedId")
    if (savedLastVerifiedId) {
      setLastVerifiedId(savedLastVerifiedId)
    }
  }, [])

  // Add keyboard shortcuts for batch operations
  // Add this to the useEffect for keyboard shortcuts
  const deleteSelectedContacts = useCallback(() => {
    if (selectedContacts.length === 0) {
      alert("Please select contacts to delete")
      return
    }

    if (confirm(`Are you sure you want to delete ${selectedContacts.length} contacts?`)) {
      setContacts((prevContacts) => prevContacts.filter((contact) => !selectedContacts.includes(contact.id)))
      setSelectedContacts([])
    }
  }, [selectedContacts])

  // Function to mark selected contacts as done (Potentially French)
  const markSelectedAsDone = useCallback(() => {
    if (selectedContacts.length === 0) {
      alert("Please select contacts to mark as done")
      return
    }

    updateBatchStatus("Potentially French")
    setSelectedContacts([])
  }, [selectedContacts, updateBatchStatus])

  // Function to export data
  const exportData = useCallback(() => {
    const dataToExport = {
      contacts,
      globalNotes,
      territoryZipcode,
      territoryPageRange,
      lastVerifiedId,
      exportDate: new Date().toISOString(),
      version: "1.5",
    }

    const jsonString = JSON.stringify(dataToExport, null, 2)
    const blob = new Blob([jsonString], { type: "application/json" })
    const url = URL.createObjectURL(blob)

    const a = document.createElement("a")
    a.href = url
    a.download = `otm-helper-export-${new Date().toLocaleDateString().replace(/\//g, "-")}.json`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }, [contacts, globalNotes, territoryZipcode, territoryPageRange, lastVerifiedId])

  // Automated detection of French-looking names using utils/french-name-detection
  const detectFrenchNames = useCallback(
    async (onlySelected = false, contactsToCheck?: EnhancedContact[]) => {
      const sourceContacts = contactsToCheck ?? contacts

      if (!sourceContacts || sourceContacts.length === 0) {
        alert("No contacts loaded")
        return
      }

      setIsDetecting(true)
      await loadDictionaryIfNeeded()

      const targetIds = onlySelected && selectedContacts.length > 0 ? new Set(selectedContacts) : null

      let changed = 0

      // If contactsToCheck was provided (freshly imported), update directly from it
      if (contactsToCheck) {
        const updated = contactsToCheck.map((c) => {
          if (targetIds && !targetIds.has(c.id)) return c
          const surname = c.lastName || c.fullName || ""
          const matched = isPotentiallyFrench(surname)
          if (matched) changed++
          return { ...c, frenchNameMatched: matched, status: matched ? "Detected" : c.status }
        })
        setContacts(updated)
      } else {
        setContacts((prev) =>
          prev.map((c) => {
            if (targetIds && !targetIds.has(c.id)) return c
            const surname = c.lastName || c.fullName || ""
            const matched = isPotentiallyFrench(surname)
            if (matched) changed++
            return { ...c, frenchNameMatched: matched, status: matched ? "Detected" : c.status }
          }),
        )
      }

      setIsDetecting(false)
      alert(`Name detection completed. Marked ${changed} contacts as Detected.`)
    },
    [contacts, selectedContacts],
  )

  // Function to import data
  const importData = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return

    const reader = new FileReader()
    reader.onload = (e) => {
      try {
        const importedData = JSON.parse(e.target?.result as string)

        if (!importedData.contacts || !Array.isArray(importedData.contacts)) {
          throw new Error("Invalid data format")
        }

        setContacts(importedData.contacts)
        if (importedData.globalNotes) setGlobalNotes(importedData.globalNotes)
        if (importedData.territoryZipcode) setTerritoryZipcode(importedData.territoryZipcode)
        if (importedData.territoryPageRange) setTerritoryPageRange(importedData.territoryPageRange)
        if (importedData.lastVerifiedId) setLastVerifiedId(importedData.lastVerifiedId)

        alert("Data imported successfully!")
      } catch (error) {
        console.error("Error importing data:", error)
        alert("Error importing data. Please check the file format.")
      }
    }
    reader.readAsText(file)
  }, [])

  // Function to share data via email
  const shareData = useCallback(() => {
    const dataToExport = {
      contacts,
      globalNotes,
      territoryZipcode,
      territoryPageRange,
      lastVerifiedId,
      exportDate: new Date().toISOString(),
      version: "1.5",
    }

    const jsonString = JSON.stringify(dataToExport)
    const subject = encodeURIComponent("OTM Helper Data")
    const body = encodeURIComponent(
      "Please find attached the OTM Helper data.\n\n" +
        "To use this data:\n" +
        "1. Save the JSON content below to a file with .json extension\n" +
        "2. Import it using the Import button in the OTM Helper app\n\n" +
        "--- JSON DATA BELOW ---\n\n" +
        jsonString,
    )

    window.location.href = `mailto:?subject=${subject}&body=${body}`
  }, [contacts, globalNotes, territoryZipcode, territoryPageRange, lastVerifiedId])

  // Add this function after the shareData function
  const exportToExcel = useCallback(() => {
    if (contacts.length === 0) {
      alert("No contacts to export")
      return
    }

    // Determine which contacts to export (all or selected)
    const contactsToExport =
      selectedContacts.length > 0 ? contacts.filter((contact) => selectedContacts.includes(contact.id)) : contacts

    // Create worksheet data
    const wsData = [
      [
        "Contact Name",
        "House Number",
        "Direction",
        "Street Name",
        "Apt Num",
        "City",
        "ZIP Code",
        "Phone Number",
        "Status",
        "Notes",
      ],
    ]

    contactsToExport.forEach((contact) => {
      const { houseNumber, direction, streetName, aptNum } = parseAddress(contact.address)

      wsData.push([
        contact.fullName,
        houseNumber,
        direction,
        streetName,
        aptNum,
        contact.city,
        contact.zipcode,
        contact.phone,
        contact.status,
        contact.notes,
      ])
    })

    // Create workbook and worksheet
    const wb = XLSX.utils.book_new()
    const ws = XLSX.utils.aoa_to_sheet(wsData)

    // Add worksheet to workbook
    XLSX.utils.book_append_sheet(wb, ws, "Contacts")

    // Generate Excel file in memory
    const excelBuffer = XLSX.write(wb, { bookType: "xlsx", type: "array" })

    // Create a Blob from the buffer
    const blob = new Blob([excelBuffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" })

    // Create downloa  { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" })

    // Create download link
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = `otm-contacts-${new Date().toLocaleDateString().replace(/\//g, "-")}.xlsx`

    // Append to body, click and remove
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)

    // Clean up
    URL.revokeObjectURL(url)

    // Show success message
    const exportCount = contactsToExport.length
    const selectionText = selectedContacts.length > 0 ? "selected" : "all"
    alert(`Successfully exported ${exportCount} ${selectionText} contacts to Excel`)
  }, [contacts, selectedContacts, parseAddress])

  // Add a new function to export only Potentially French contacts
  // Add this after the exportToExcel function

  const exportPotentiallyFrenchToExcel = useCallback(() => {
    if (contacts.length === 0) {
      alert("No contacts to export")
      return
    }

    // Filter only Potentially French contacts
    const frenchContacts = contacts.filter((contact) => contact.status === "Potentially French")

    if (frenchContacts.length === 0) {
      alert("No Potentially French contacts found to export")
      return
    }

    // Create worksheet data
    const wsData = [
      [
        "Contact Name",
        "House Number",
        "Direction",
        "Street Name",
        "Apt Num",
        "City",
        "ZIP Code",
        "Phone Number",
        "Status",
        "Notes",
      ],
    ]

    frenchContacts.forEach((contact) => {
      const { houseNumber, direction, streetName, aptNum } = parseAddress(contact.address)

      wsData.push([
        contact.fullName,
        houseNumber,
        direction,
        streetName,
        aptNum,
        contact.city,
        contact.zipcode,
        contact.phone,
        contact.status,
        contact.notes,
      ])
    })

    // Create workbook and worksheet
    const wb = XLSX.utils.book_new()
    const ws = XLSX.utils.aoa_to_sheet(wsData)

    // Add worksheet to workbook
    XLSX.utils.book_append_sheet(wb, ws, "French Contacts")

    // Generate Excel file in memory
    const excelBuffer = XLSX.write(wb, { bookType: "xlsx", type: "array" })

    // Create a Blob from the buffer
    const blob = new Blob([excelBuffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" })

    // Create download link
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = `french-contacts-${new Date().toLocaleDateString().replace(/\//g, "-")}.xlsx`

    // Append to body, click and remove
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)

    // Clean up
    URL.revokeObjectURL(url)

    // Show success message
    alert(`Successfully exported ${frenchContacts.length} Potentially French contacts to Excel`)
  }, [contacts, parseAddress])

  // Modify the startNewSession function to reset the file input element
  const startNewSession = useCallback(() => {
    if (contacts.length > 0) {
      if (confirm("Are you sure you want to start a new session? This will clear all current data.")) {
        // Clear all data
        setContacts([])
        setGlobalNotes("")
        setTerritoryZipcode("")
        setTerritoryPageRange("")
        setLastVerifiedId(null)
        setSelectedContacts([])
        setSearchQuery("")
        setStatusFilter("All")
        setShowUpdateNeeded(false)
        setError(null) // Clear any previous errors

        // Reset the file input element
        if (fileInputRef.current) {
          fileInputRef.current.value = ""
        }

        // Clear localStorage
        localStorage.removeItem("contacts")
        localStorage.removeItem("globalNotes")
        localStorage.removeItem("territoryZipcode")
        localStorage.removeItem("territoryPageRange")
        localStorage.removeItem("lastVerifiedId")

        // Set fileUploaded to false
        setFileUploaded(false)

        // Show confirmation
        alert("New session started. All data has been cleared.")
      }
    } else {
      alert("No active session to clear.")
    }
  }, [contacts])

  // Function to get status icon
  const getStatusIcon = useCallback((status: EnhancedContact["status"]) => {
    switch (status) {
      case "Potentially French":
        return <CheckCircle2 className="h-4 w-4 text-green-500" />
      case "Not checked":
        return <XCircle className="h-4 w-4 text-blue-500" />
      case "Duplicate":
        return <RefreshCw className="h-4 w-4 text-amber-500" />
      case "Not French":
        return <CircleSlash className="h-4 w-4 text-red-500" />
    }
  }, [])

  // Add a new function to handle territory status changes
  const handleTerritoryStatusChange = useCallback((id: string, territoryStatus: boolean) => {
    setContacts((prevContacts) =>
      prevContacts.map((contact) => (contact.id === id ? { ...contact, territoryStatus: territoryStatus } : contact)),
    )
  }, [])

  // Function to find the most recently interacted contact
  const findMostRecentContact = useCallback(() => {
    if (contacts.length === 0) return null

    let mostRecentContact = contacts[0]
    let mostRecentTime = mostRecentContact.lastInteraction ? new Date(mostRecentContact.lastInteraction) : new Date(0)

    contacts.forEach((contact) => {
      if (contact.lastInteraction) {
        const interactionTime = new Date(contact.lastInteraction)
        if (interactionTime > mostRecentTime) {
          mostRecentContact = contact
          mostRecentTime = interactionTime
        }
      }
    })

    return mostRecentContact.id
  }, [contacts])

  // Function to jump to the most recently interacted contact
  const scrollToRecentContact = useCallback(() => {
    const recentContactId = findMostRecentContact()
    if (recentContactId) {
      const element = document.getElementById(`contact-row-${recentContactId}`)
      if (element) {
        element.scrollIntoView({ behavior: "smooth", block: "center" })

        // Highlight the row temporarily
        element.classList.add("bg-green-200", "dark:bg-green-800")
        setTimeout(() => {
          element.classList.remove("bg-green-200", "dark:bg-green-800")
        }, 2000)
      }
    } else {
      alert("No recent contact interaction found")
    }
  }, [findMostRecentContact])

  // Add keyboard shortcuts for batch operations
  // Add this to the useEffect for keyboard shortcuts
  useEffect(() => {
    // Add keyboard shortcuts
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ctrl+F for search focus
      if (e.ctrlKey && e.key === "f") {
        e.preventDefault()
        document.getElementById("search-contacts")?.focus()
      }

      // Ctrl+1 for "Not checked" status (for selected contacts)
      if (e.ctrlKey && e.key === "1" && selectedContacts.length > 0) {
        e.preventDefault()
        updateBatchStatus("Not checked")
      }

      // Ctrl+2 for "Potentially French" status (for selected contacts)
      if (e.ctrlKey && e.key === "2" && selectedContacts.length > 0) {
        e.preventDefault()
        updateBatchStatus("Potentially French")
      }

      // Ctrl+3 for "Not French" status (for selected contacts)
      if (e.ctrlKey && e.key === "3" && selectedContacts.length > 0) {
        e.preventDefault()
        updateBatchStatus("Not French")
      }

      // Ctrl+A to select/deselect all contacts
      if (e.ctrlKey && e.key === "a") {
        e.preventDefault()
        toggleSelectAll()
      }

      // Ctrl+G to toggle between grid and list view
      if (e.ctrlKey && e.key === "g") {
        e.preventDefault()
        setViewType((prev) => (prev === "list" ? "grid" : "list"))
      }
    }

    window.addEventListener("keydown", handleKeyDown)
    return () => window.removeEventListener("keydown", handleKeyDown)
  }, [toggleSelectAll, updateBatchStatus, selectedContacts, viewType])

  // Add a separate useEffect for the Excel export shortcut that runs after exportPotentiallyFrenchToExcel is defined
  useEffect(() => {
    const handleExportShortcut = (e: KeyboardEvent) => {
      // Ctrl+E to export to Excel
      if (e.ctrlKey && e.key === "e") {
        e.preventDefault()
        exportPotentiallyFrenchToExcel()
      }
    }

    window.addEventListener("keydown", handleExportShortcut)
    return () => window.removeEventListener("keydown", handleExportShortcut)
  }, [exportPotentiallyFrenchToExcel])

  return (
    <TooltipProvider>
      <main className="container mx-auto py-8 px-4 pb-24">
        <div className="flex justify-between items-center mb-6 pb-4 border-b">
          <div className="flex items-center gap-2">
            <h1 className="text-3xl font-bold bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent">
              OTMRT Helper
            </h1>
            <span className="px-2 py-1 bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200 text-xs font-medium rounded-md">
              v1.7
            </span>
          </div>

          <div className="flex items-center gap-2">
            <div className="flex items-center gap-2 mr-4">
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={exportPotentiallyFrenchToExcel}
                    className="flex items-center gap-1 bg-green-50 border-green-200 hover:bg-green-100 dark:bg-green-900/20 dark:border-green-800 dark:hover:bg-green-900/40"
                  >
                    <FileSpreadsheet className="h-4 w-4 text-green-600 dark:text-green-400" />
                    <span className="hidden sm:inline">Export</span>
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Export Potentially French contacts to Excel file</TooltipContent>
              </Tooltip>

              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={exportData}
                    className="flex items-center gap-1 bg-blue-50 border-blue-200 hover:bg-blue-100 dark:bg-blue-900/20 dark:border-blue-800 dark:hover:bg-blue-900/40"
                  >
                    <FileJson className="h-4 w-4 text-blue-600 dark:text-blue-400" />
                    <span className="hidden sm:inline">JSON</span>
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Export data to JSON file (Ctrl+J)</TooltipContent>
              </Tooltip>

              <Tooltip>
                <TooltipTrigger asChild>
                  <div>
                    <Input type="file" id="import-data" accept=".json" onChange={importData} className="hidden" />
                    <Button
                      variant="outline"
                      size="sm"
                      asChild
                      className="flex items-center gap-1 bg-amber-50 border-amber-200 hover:bg-amber-100 dark:bg-amber-900/20 dark:border-amber-800 dark:hover:bg-amber-900/40"
                    >
                      <label htmlFor="import-data" className="flex items-center cursor-pointer">
                        <Import className="h-4 w-4 text-amber-600 dark:text-amber-400" />
                        <span className="hidden sm:inline">Import</span>
                      </label>
                    </Button>
                  </div>
                </TooltipTrigger>
                <TooltipContent>Import JSON data file</TooltipContent>
              </Tooltip>
            </div>

            <Dialog open={isDocOpen} onOpenChange={setIsDocOpen}>
              <DialogTrigger asChild>
                <Button variant="outline" size="sm" className="flex items-center gap-1">
                  <HelpCircle className="h-4 w-4" />
                  <span className="hidden sm:inline">Help</span>
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto">
                <DialogHeader>
                  <DialogTitle>OTM Helper Documentation</DialogTitle>
                  <DialogDescription>
                    <Tabs defaultValue="import" className="w-full">
                      <TabsList className="grid grid-cols-5">
                        <TabsTrigger value="import">Import/Export</TabsTrigger>
                        <TabsTrigger value="statistics">Statistics</TabsTrigger>
                        <TabsTrigger value="contact">Contact Management</TabsTrigger>
                        <TabsTrigger value="verification">Verification</TabsTrigger>
                        <TabsTrigger value="shortcuts">Shortcuts</TabsTrigger>
                      </TabsList>
                      <TabsContent value="import" className="p-4">
                        <h3 className="text-lg font-medium mb-2">Import & Export</h3>
                        <p className="mb-2">The application supports several data formats:</p>

                        <h4 className="font-medium mt-4">Excel Import Format</h4>
                        <p className="mb-2">The Excel file should have the following columns in this order:</p>
                        <ol className="list-decimal pl-5 space-y-1">
                          <li>First Name</li>
                          <li>Last Name</li>
                          <li>Address</li>
                          <li>City</li>
                          <li>Zipcode</li>
                          <li>Phone</li>
                        </ol>

                        <h4 className="font-medium mt-4">JSON Export/Import</h4>
                        <p>
                          The JSON export includes all contact data, notes, and application settings. This is the best
                          format for backing up your work.
                        </p>

                        <h4 className="font-medium mt-4">Excel Export</h4>
                        <p>The Excel export creates a spreadsheet with the following columns:</p>
                        <ul className="list-disc pl-5 space-y-1">
                          <li>Contact Name</li>
                          <li>House Number (parsed from address)</li>
                          <li>Direction (N, S, E, W, etc.)</li>
                          <li>Street Name</li>
                          <li>Apt Num</li>
                          <li>City</li>
                          <li>ZIP Code</li>
                          <li>Phone Number</li>
                          <li>Status</li>
                          <li>Notes</li>
                        </ul>
                        <p className="mt-2">You can export all contacts or just selected contacts.</p>
                      </TabsContent>
                      <TabsContent value="statistics" className="p-4">
                        <h3 className="text-lg font-medium mb-2">Statistics</h3>
                        <p>The statistics section shows a summary of your contacts:</p>
                        <ul className="list-disc pl-5 space-y-1">
                          <li>
                            <span className="font-medium">Progress Bar:</span> Shows the percentage of contacts that
                            have been checked
                          </li>
                          <li>
                            <span className="font-medium">Not Checked:</span> Contacts that haven't been checked yet
                          </li>
                          <li>
                            <span className="font-medium">Potentially French:</span> Contacts marked as potentially
                            French
                          </li>
                          <li>
                            <span className="font-medium">Not French:</span> Contacts marked as not French
                          </li>
                        </ul>
                      </TabsContent>
                      <TabsContent value="contact" className="p-4">
                        <h3 className="text-lg font-medium mb-2">Contact Management</h3>
                        <p className="mb-2">The contacts table allows you to:</p>
                        <ul className="list-disc pl-5 space-y-1">
                          <li>Click on a row to expand and see more details</li>
                          <li>Edit contact information directly in the expanded view</li>
                          <li>Search for contacts using the search box</li>
                          <li>Filter contacts by status</li>
                          <li>Toggle between list and grid views</li>
                          <li>Select multiple contacts for batch operations</li>
                          <li>Mark contacts that need address or phone updates</li>
                        </ul>

                        <h4 className="font-medium mt-4">Batch Operations</h4>
                        <p>
                          When you select multiple contacts, a batch action bar appears at the bottom of the screen
                          allowing you to:
                        </p>
                        <ul className="list-disc pl-5 space-y-1">
                          <li>Mark selected contacts as "Not checked"</li>
                          <li>Mark selected contacts as "Potentially French"</li>
                          <li>Mark selected contacts as "Not French"</li>
                          <li>
                            Mark selected contacts as "Done" (sets them as "Potentially French" and clears selection)
                          </li>
                        </ul>
                      </TabsContent>
                      <TabsContent value="verification" className="p-4">
                        <h3 className="text-lg font-medium mb-2">Verification Process</h3>
                        <p className="mb-2">The application provides several tools to help verify contacts:</p>

                        <h4 className="font-medium mt-4">Search Tools</h4>
                        <ul className="list-disc pl-5 space-y-1">
                          <li>
                            <span className="font-medium">TruePeopleSearch:</span> Search for contact information by
                            name and zipcode
                          </li>
                          <li>
                            <span className="font-medium">OTM:</span> Copy the contact name and open Online Territory
                            Manager
                          </li>
                          <li>
                            <span className="font-medium">Forebears.io:</span> Search for surname origins and
                            distribution
                          </li>
                        </ul>

                        <h4 className="font-medium mt-4">Verification Status</h4>
                        <p>Each contact has a verification status bar showing which tools have been used:</p>
                        <ul className="list-disc pl-5 space-y-1">
                          <li>Left section: Forebears.io check</li>
                          <li>Middle section: TruePeopleSearch check</li>
                          <li>Right section: OTM check</li>
                        </ul>

                        <h4 className="font-medium mt-4">Recent Contact Navigation</h4>
                        <p>
                          The "Recent" button helps you navigate to the most recently interacted contact, making it easy
                          to continue where you left off.
                        </p>
                      </TabsContent>
                      <TabsContent value="shortcuts" className="p-4">
                        <h3 className="text-lg font-medium mb-2">Keyboard Shortcuts</h3>
                        <div className="grid grid-cols-2 gap-2 mt-4">
                          <div className="bg-muted p-2 rounded flex items-center">
                            <kbd className="px-2 py-1 bg-background rounded mr-2">Ctrl+F</kbd>
                            <span>Focus search</span>
                          </div>
                          <div className="bg-muted p-2 rounded flex items-center">
                            <kbd className="px-2 py-1 bg-background rounded mr-2">Ctrl+A</kbd>
                            <span>Select/deselect all</span>
                          </div>
                          <div className="bg-muted p-2 rounded flex items-center">
                            <kbd className="px-2 py-1 bg-background rounded mr-2">Ctrl+G</kbd>
                            <span>Toggle grid/list view</span>
                          </div>
                          <div className="bg-muted p-2 rounded flex items-center">
                            <kbd className="px-2 py-1 bg-background rounded mr-2">Ctrl+E</kbd>
                            <span>Export to Excel</span>
                          </div>
                          <div className="bg-muted p-2 rounded flex items-center">
                            <kbd className="px-2 py-1 bg-background rounded mr-2">Ctrl+1</kbd>
                            <span>Mark as Not checked</span>
                          </div>
                          <div className="bg-muted p-2 rounded flex items-center">
                            <kbd className="px-2 py-1 bg-background rounded mr-2">Ctrl+2</kbd>
                            <span>Mark as Potentially French</span>
                          </div>
                          <div className="bg-muted p-2 rounded flex items-center">
                            <kbd className="px-2 py-1 bg-background rounded mr-2">Ctrl+3</kbd>
                            <span>Mark as Not French</span>
                          </div>
                        </div>
                      </TabsContent>
                    </Tabs>
                  </DialogDescription>
                </DialogHeader>
              </DialogContent>
            </Dialog>
            <Dialog open={isKeyboardHelpOpen} onOpenChange={setIsKeyboardHelpOpen}>
              <DialogTrigger asChild>
                <Button variant="outline" size="sm" className="flex items-center gap-1">
                  <Keyboard className="h-4 w-4" />
                  <span className="hidden sm:inline">Keys</span>
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Keyboard Shortcuts</DialogTitle>
                  <DialogDescription>
                    <div className="grid grid-cols-2 gap-2 mt-4">
                      <div className="bg-muted p-2 rounded flex items-center">
                        <kbd className="px-2 py-1 bg-background rounded mr-2">Ctrl+F</kbd>
                        <span>Focus search</span>
                      </div>
                      <div className="bg-muted p-2 rounded flex items-center">
                        <kbd className="px-2 py-1 bg-background rounded mr-2">Ctrl+A</kbd>
                        <span>Select/deselect all</span>
                      </div>
                      <div className="bg-muted p-2 rounded flex items-center">
                        <kbd className="px-2 py-1 bg-background rounded mr-2">Ctrl+G</kbd>
                        <span>Toggle grid/list view</span>
                      </div>
                      <div className="bg-muted p-2 rounded flex items-center">
                        <kbd className="px-2 py-1 bg-background rounded mr-2">Ctrl+E</kbd>
                        <span>Export to Excel</span>
                      </div>
                      <div className="bg-muted p-2 rounded flex items-center">
                        <kbd className="px-2 py-1 bg-background rounded mr-2">Ctrl+1</kbd>
                        <span>Mark as Not checked</span>
                      </div>
                      <div className="bg-muted p-2 rounded flex items-center">
                        <kbd className="px-2 py-1 bg-background rounded mr-2">Ctrl+2</kbd>
                        <span>Mark as Potentially French</span>
                      </div>
                      <div className="bg-muted p-2 rounded flex items-center">
                        <kbd className="px-2 py-1 bg-background rounded mr-2">Ctrl+3</kbd>
                        <span>Mark as Not French</span>
                      </div>
                    </div>
                  </DialogDescription>
                </DialogHeader>
              </DialogContent>
            </Dialog>
            <ThemeSwitcher />
          </div>
        </div>

        <Card className="mb-4">
          <CardHeader>
            <CardTitle>Upload Excel File</CardTitle>
            <CardDescription>Upload an Excel file to process contacts.</CardDescription>
          </CardHeader>

          <CardContent>
            <div className="flex flex-col space-y-4">
              <div className="flex items-center space-x-4">
                <Input
                  type="file"
                  id="excel-upload"
                  accept=".xlsx, .xls"
                  onChange={handleFileUpload}
                  className="hidden"
                  ref={fileInputRef}
                />
                <div className="flex items-center gap-2">
                  <Button asChild disabled={isLoading} className="bg-purple-600 hover:bg-purple-700">
                    <label htmlFor="excel-upload" className="flex items-center space-x-2 cursor-pointer">
                      <Upload className="h-4 w-4" />
                      <span>{isLoading ? "Loading..." : "Import Excel File"}</span>
                    </label>
                  </Button>
                  {fileUploaded && <Check className="text-green-500 h-4 w-4" />}

                  {/* detection runs automatically after import; manual detect buttons removed */}
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={startNewSession}
                    className="flex items-center gap-1 bg-red-50 border-red-200 hover:bg-red-100 dark:bg-red-900/20 dark:border-red-800 dark:hover:bg-red-900/40"
                  >
                    <RefreshCw className="h-4 w-4 text-red-600 dark:text-red-400" />
                    <span>New Session</span>
                  </Button>
                </div>
                {fileUploaded && <Check className="text-green-500 h-4 w-4" />}
              </div>
              <div className="text-sm text-muted-foreground">
                <p>Required columns: First Name, Last Name, Address, City, Zipcode, Phone</p>
              </div>
              {error && (
                <Alert variant="destructive">
                  <AlertCircleIcon className="h-4 w-4" />
                  <AlertTitle>Error</AlertTitle>
                  <AlertDescription>{error}</AlertDescription>
                </Alert>
              )}
            </div>
          </CardContent>
        </Card>

        {contacts.length > 0 && (
          <Card className="mb-4">
            <CardHeader>
              <CardTitle>General Notes</CardTitle>
              <CardDescription>Add information about this territory.</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <label htmlFor="territory-zipcode" className="block text-sm font-medium mb-1">
                    Territory Zipcode
                  </label>
                  <Input
                    id="territory-zipcode"
                    placeholder="Enter zipcode..."
                    value={territoryZipcode}
                    onChange={(e) => setTerritoryZipcode(e.target.value)}
                  />
                </div>
                <div>
                  <label htmlFor="territory-page-range" className="block text-sm font-medium mb-1">
                    Page Range
                  </label>
                  <Input
                    id="territory-page-range"
                    placeholder="e.g., 1-10"
                    value={territoryPageRange}
                    onChange={(e) => setTerritoryPageRange(e.target.value)}
                  />
                </div>
                <div className="md:col-span-1">
                  <label htmlFor="territory-notes" className="block text-sm font-medium mb-1">
                    Notes
                  </label>
                  <Textarea
                    id="territory-notes"
                    placeholder="Add notes here..."
                    value={globalNotes}
                    onChange={(e) => setGlobalNotes(e.target.value)}
                    className="min-h-[80px]"
                  />
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Compact Statistics Section */}
        {contacts.length > 0 && (
          <div className="mb-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-bold">Statistics</h2>
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium">Checked:</span>
                <div className="w-48 h-2 bg-gray-100 rounded-full dark:bg-gray-800 overflow-hidden">
                  <div
                    className="h-2 bg-gradient-to-r from-blue-400 to-purple-600 rounded-full"
                    style={{
                      width: `${
                        contacts.length > 0
                          ? Math.round(((potentiallyFrenchCount + notFrenchCount + detectedCount) / contacts.length) * 100)
                          : 0
                      }%`,
                    }}
                  ></div>
                </div>
                <span className="text-sm font-medium">
                  {contacts.length > 0
                    ? Math.round(((potentiallyFrenchCount + notFrenchCount + detectedCount) / contacts.length) * 100)
                    : 0}
                  %
                </span>
              </div>
            </div>

            {/* Compact Stat Cards */}
            <div className="grid grid-cols-4 gap-3">
              <div className="flex items-center p-3 rounded-lg border bg-white dark:bg-gray-800">
                <div className="rounded-full p-2 bg-blue-100 dark:bg-blue-900/30 mr-3">
                  <XCircle className="h-4 w-4 text-blue-600 dark:text-blue-400" />
                </div>
                <div>
                  <div className="text-lg font-bold">{notCheckedCount}</div>
                  <div className="text-xs text-muted-foreground">Not Checked</div>
                </div>
              </div>

              <div className="flex items-center p-3 rounded-lg border bg-white dark:bg-gray-800">
                <div className="rounded-full p-2 bg-green-100 dark:bg-green-900/30 mr-3">
                  <CheckCircle2 className="h-4 w-4 text-green-600 dark:text-green-400" />
                </div>
                <div>
                  <div className="text-lg font-bold">{potentiallyFrenchCount}</div>
                  <div className="text-xs text-muted-foreground">Potentially French</div>
                </div>
              </div>

              <div className="flex items-center p-3 rounded-lg border bg-white dark:bg-gray-800">
                <div className="rounded-full p-2 bg-red-100 dark:bg-red-900/30 mr-3">
                  <CircleSlash className="h-4 w-4 text-red-600 dark:text-red-400" />
                </div>
                <div>
                  <div className="text-lg font-bold">{notFrenchCount}</div>
                  <div className="text-xs text-muted-foreground">Not French</div>
                </div>
              </div>

              <div className="flex items-center p-3 rounded-lg border bg-white dark:bg-gray-800">
                <div className="rounded-full p-2 bg-yellow-100 dark:bg-yellow-900/30 mr-3">
                  <Globe className="h-4 w-4 text-yellow-600 dark:text-yellow-400" />
                </div>
                <div>
                  <div className="text-lg font-bold">{detectedCount}</div>
                  <div className="text-xs text-muted-foreground">Detected</div>
                </div>
              </div>
            </div>
          </div>
        )}

        {contacts.length > 0 && (
          <Card className="mb-4">
            <CardHeader className="flex flex-row items-center justify-between">
              <div>
                <CardTitle>Contacts</CardTitle>
                <CardDescription>Manage and view your contacts.</CardDescription>
              </div>
              <div className="flex items-center gap-2">
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="outline"
                      size="icon"
                      onClick={() => setViewType("list")}
                      className={viewType === "list" ? "bg-muted" : ""}
                    >
                      <LayoutList className="h-4 w-4" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>List View (Ctrl+G)</TooltipContent>
                </Tooltip>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="outline"
                      size="icon"
                      onClick={() => setViewType("grid")}
                      className={viewType === "grid" ? "bg-muted" : ""}
                    >
                      <LayoutGrid className="h-4 w-4" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>Grid View (Ctrl+G)</TooltipContent>
                </Tooltip>
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
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={scrollToRecentContact}
                        className="flex items-center gap-1"
                      >
                        <Clock className="h-4 w-4" />
                        <span className="hidden sm:inline">Recent</span>
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>Jump to most recently interacted contact</TooltipContent>
                  </Tooltip>

                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={filterContactsNeedingUpdates}
                        className={`flex items-center gap-1 ${
                          showUpdateNeeded
                            ? "bg-amber-100 border-amber-200 dark:bg-amber-900/20 dark:border-amber-800"
                            : ""
                        }`}
                      >
                        <Filter className="h-4 w-4" />
                        <span className="hidden sm:inline">{showUpdateNeeded ? "Show All" : "Needs Update"}</span>
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>Filter contacts that need updates</TooltipContent>
                  </Tooltip>
                  <Select value={statusFilter} onValueChange={(value) => setStatusFilter(value as any)}>
                    <SelectTrigger className="w-[180px]">
                      <SelectValue placeholder="Filter by Status" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="All">All</SelectItem>
                      <SelectItem value="Not checked">Not checked</SelectItem>
                      <SelectItem value="Potentially French">Potentially French</SelectItem>
                      <SelectItem value="Detected">Detected</SelectItem>
                      <SelectItem value="Duplicate">Duplicate</SelectItem>
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
                        <TableHead className="text-right">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredContacts.map((contact) => {
                        // Determine row styling based on status
                        const rowColorClass =
                          contact.status === "Potentially French"
                            ? "bg-green-50 dark:bg-green-900/20"
                            : contact.status === "Duplicate"
                              ? "bg-amber-50 dark:bg-amber-900/20"
                              : contact.status === "Detected"
                                ? "bg-purple-50 dark:bg-purple-900/20"
                                : contact.status === "Not French"
                                ? "bg-red-50 dark:bg-red-900/20"
                                : "" // Not checked stays white/default

                        return (
                          <React.Fragment key={contact.id}>
                            {/* Add an ID to the TableRow for scrolling */}
                            <TableRow
                              id={`contact-row-${contact.id}`}
                              className={`cursor-pointer transition-colors hover:bg-muted/50 ${rowColorClass} ${
                                contact.id === lastVerifiedId
                                  ? "border-l-4 border-l-green-500 dark:border-l-green-400"
                                  : ""
                              }`}
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
                                  {contact.fullName}
                                  {contact.id === lastVerifiedId && (
                                    <Tooltip>
                                      <TooltipTrigger>
                                        <Clock className="h-4 w-4 text-green-500" />
                                      </TooltipTrigger>
                                      <TooltipContent>Last verified contact</TooltipContent>
                                    </Tooltip>
                                  )}
                                  {contact.notes && contact.notes.trim() !== "" && (
                                    <Tooltip>
                                      <TooltipTrigger>
                                        <StickyNote className="h-4 w-4 text-blue-500" />
                                      </TooltipTrigger>
                                      <TooltipContent>Has notes</TooltipContent>
                                    </Tooltip>
                                  )}
                                  {contact.needAddressUpdate && (
                                    <Tooltip>
                                      <TooltipTrigger>
                                        <AlertCircleIcon className="h-4 w-4 text-amber-500" />
                                      </TooltipTrigger>
                                      <TooltipContent>Address needs update</TooltipContent>
                                    </Tooltip>
                                  )}
                                  {contact.needPhoneUpdate && (
                                    <Tooltip>
                                      <TooltipTrigger>
                                        <Phone className="h-4 w-4 text-amber-500" />
                                      </TooltipTrigger>
                                      <TooltipContent>Phone needs update</TooltipContent>
                                    </Tooltip>
                                  )}
                                  {contact.territoryStatus && (
                                    <Tooltip>
                                      <TooltipTrigger>
                                        <MapPin className="h-4 w-4 text-purple-500" />
                                      </TooltipTrigger>
                                      <TooltipContent>Different territory</TooltipContent>
                                    </Tooltip>
                                  )}
                                </div>
                                {/* Add verification status bar with 3 distinct sections */}
                                <div className="mt-1 flex h-1.5 w-full rounded-full overflow-hidden">
                                  <div
                                    className={`h-full ${
                                      contact.checkedOnForebears ? "bg-blue-500" : "bg-gray-100 dark:bg-gray-800"
                                    } flex-1`}
                                  ></div>
                                  <div className="w-0.5 bg-white dark:bg-gray-700"></div>
                                  <div
                                    className={`h-full ${
                                      contact.checkedOnTPS ? "bg-blue-500" : "bg-gray-100 dark:bg-gray-800"
                                    } flex-1`}
                                  ></div>
                                  <div className="w-0.5 bg-white dark:bg-gray-700"></div>
                                  <div
                                    className={`h-full ${
                                      contact.checkedOnOTM ? "bg-blue-500" : "bg-gray-100 dark:bg-gray-800"
                                    } flex-1`}
                                  ></div>
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
                                              : contact.status === "Not checked"
                                              ? "bg-blue-100 dark:bg-blue-900/40 border-blue-200 dark:border-blue-800"
                                              : ""
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
                                        variant="ghost"
                                        size="icon"
                                        onClick={(e) => {
                                          e.stopPropagation()
                                          toggleContactExpanded(contact.id)
                                        }}
                                        className="hover:bg-slate-100 dark:hover:bg-slate-800"
                                      >
                                        {contact.isExpanded ? (
                                          <ChevronDown className="h-4 w-4" />
                                        ) : (
                                          <ChevronRight className="h-4 w-4" />
                                        )}
                                      </Button>
                                    </TooltipTrigger>
                                    <TooltipContent>{contact.isExpanded ? "Collapse" : "Expand"}</TooltipContent>
                                  </Tooltip>
                                  <Tooltip>
                                    <TooltipTrigger>
                                      <Button
                                        variant={contact.checkedOnForebears ? "secondary" : "outline"}
                                        size="icon"
                                        onClick={(e) => {
                                          e.stopPropagation()
                                          searchOnForebears(contact)
                                        }}
                                        className={
                                          contact.checkedOnForebears
                                            ? "bg-green-100 text-green-700 border-green-300 hover:bg-green-200 dark:bg-green-900/30 dark:text-green-400 dark:border-green-800 dark:hover:bg-green-900/50"
                                            : "bg-blue-50 hover:bg-blue-100 dark:bg-blue-900/20 dark:hover:bg-blue-900/40"
                                        }
                                      >
                                        <Globe className="h-4 w-4" />
                                      </Button>
                                    </TooltipTrigger>
                                    <TooltipContent>Search on Forebears.io</TooltipContent>
                                  </Tooltip>
                                  <Tooltip>
                                    <TooltipTrigger>
                                      <Button
                                        variant={contact.checkedOnTPS ? "secondary" : "outline"}
                                        size="icon"
                                        onClick={(e) => {
                                          e.stopPropagation()
                                          searchOnTruePeopleSearch(contact)
                                        }}
                                        className={
                                          contact.checkedOnTPS
                                            ? "bg-green-100 text-green-700 border-green-300 hover:bg-green-200 dark:bg-green-900/30 dark:text-green-400 dark:border-green-800 dark:hover:bg-green-900/50"
                                            : "bg-blue-50 hover:bg-blue-100 dark:bg-blue-900/20 dark:hover:bg-blue-900/40"
                                        }
                                      >
                                        <Search className="h-4 w-4" />
                                      </Button>
                                    </TooltipTrigger>
                                    <TooltipContent>Search on TruePeopleSearch</TooltipContent>
                                  </Tooltip>
                                  <Tooltip>
                                    <TooltipTrigger>
                                      <Button
                                        variant={contact.checkedOnOTM ? "secondary" : "outline"}
                                        size="icon"
                                        onClick={(e) => {
                                          e.stopPropagation()
                                          copyAndSearchOTM(contact)
                                        }}
                                        className={
                                          contact.checkedOnOTM
                                            ? "bg-green-100 text-green-700 border-green-300 hover:bg-green-200 dark:bg-green-900/30 dark:text-green-400 dark:border-green-800 dark:hover:bg-green-900/50"
                                            : "bg-blue-50 hover:bg-blue-100 dark:bg-blue-900/20 dark:hover:bg-blue-900/40"
                                        }
                                      >
                                        {copiedId === contact.id ? (
                                          <Check className="h-4 w-4 text-green-500" />
                                        ) : (
                                          <Copy className="h-4 w-4" />
                                        )}
                                      </Button>
                                    </TooltipTrigger>
                                    <TooltipContent>Copy Name & Open OTM</TooltipContent>
                                  </Tooltip>
                                </div>
                              </TableCell>
                            </TableRow>
                            {contact.isExpanded && (
                              <TableRow className={`${rowColorClass} border-t-0`}>
                                <TableCell colSpan={8} className="p-0">
                                  <div className="p-4 bg-background/50 rounded-b-lg shadow-inner">
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                      <div>
                                        <h3 className="text-sm font-medium mb-2">Contact Details</h3>
                                        <div className="space-y-3 text-sm">
                                          <div className="grid grid-cols-3 items-center gap-2">
                                            <span className="font-medium">First Name:</span>
                                            <Input
                                              value={contact.firstName}
                                              onChange={(e) =>
                                                updateContactField(contact.id, "firstName", e.target.value)
                                              }
                                              className="col-span-2 h-8"
                                            />
                                          </div>
                                          <div className="grid grid-cols-3 items-center gap-2">
                                            <span className="font-medium">Last Name:</span>
                                            <Input
                                              value={contact.lastName}
                                              onChange={(e) =>
                                                updateContactField(contact.id, "lastName", e.target.value)
                                              }
                                              className="col-span-2 h-8"
                                            />
                                          </div>
                                          <div className="grid grid-cols-3 items-center gap-2">
                                            <span className="font-medium">Address:</span>
                                            <Input
                                              value={contact.address}
                                              onChange={(e) =>
                                                updateContactField(contact.id, "address", e.target.value)
                                              }
                                              className="col-span-2 h-8"
                                            />
                                          </div>
                                          <div className="grid grid-cols-3 items-center gap-2">
                                            <span className="font-medium">City:</span>
                                            <Input
                                              value={contact.city}
                                              onChange={(e) => updateContactField(contact.id, "city", e.target.value)}
                                              className="col-span-2 h-8"
                                            />
                                          </div>
                                          <div className="grid grid-cols-3 items-center gap-2">
                                            <span className="font-medium">Zipcode:</span>
                                            <Input
                                              value={contact.zipcode}
                                              onChange={(e) =>
                                                updateContactField(contact.id, "zipcode", e.target.value)
                                              }
                                              className="col-span-2 h-8"
                                            />
                                          </div>
                                          <div className="grid grid-cols-3 items-center gap-2">
                                            <span className="font-medium">Phone:</span>
                                            <Input
                                              value={contact.phone}
                                              onChange={(e) => updateContactField(contact.id, "phone", e.target.value)}
                                              className="col-span-2 h-8"
                                            />
                                          </div>
                                        </div>
                                      </div>
                                      <div>
                                        <h3 className="text-sm font-medium mb-2">Notes & Status</h3>
                                        <Textarea
                                          placeholder="Add notes about this contact..."
                                          value={contact.notes}
                                          onChange={(e) => handleNotesChange(contact.id, e.target.value)}
                                          className="mb-2 min-h-[80px]"
                                        />
                                        <div className="flex items-center space-x-4">
                                          <div className="flex items-center space-x-2">
                                            <Checkbox
                                              id={`address-update-${contact.id}`}
                                              checked={contact.needAddressUpdate}
                                              onCheckedChange={(checked) =>
                                                handleAddressUpdateChange(contact.id, !!checked)
                                              }
                                            />
                                            <label htmlFor={`address-update-${contact.id}`} className="text-sm">
                                              Address updated
                                            </label>
                                          </div>
                                          <div className="flex items-center space-x-2">
                                            <Checkbox
                                              id={`phone-update-${contact.id}`}
                                              checked={contact.needPhoneUpdate}
                                              onCheckedChange={(checked) =>
                                                handlePhoneUpdateChange(contact.id, !!checked)
                                              }
                                            />
                                            <label htmlFor={`phone-update-${contact.id}`} className="text-sm">
                                              Phone updated
                                            </label>
                                          </div>
                                          <div className="flex items-center space-x-2">
                                            <Checkbox
                                              id={`territory-status-${contact.id}`}
                                              checked={contact.territoryStatus}
                                              onCheckedChange={(checked) =>
                                                handleTerritoryStatusChange(contact.id, !!checked)
                                              }
                                            />
                                            <label htmlFor={`territory-status-${contact.id}`} className="text-sm">
                                              Different territory
                                            </label>
                                          </div>
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
              )}

              {/* Grid View */}
              {viewType === "grid" && (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  {filteredContacts.map((contact) => {
                    const statusColor =
                      contact.status === "Potentially French"
                        ? "bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300"
                        : contact.status === "Duplicate"
                          ? "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300"
                          : contact.status === "Not checked"
                            ? "bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300"
                            : "bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300"

                    return (
                      <Card
                        key={contact.id}
                        id={`contact-row-${contact.id}`}
                        className={`overflow-hidden cursor-pointer ${
                          contact.id === lastVerifiedId ? "border-l-4 border-l-green-500" : ""
                        }`}
                        onClick={() => toggleContactExpanded(contact.id)}
                      >
                        <CardHeader className="pb-2">
                          <div className="flex justify-between items-start">
                            <div className="flex-1">
                              <div className="flex items-center gap-2">
                                <Checkbox
                                  checked={selectedContacts.includes(contact.id)}
                                  onCheckedChange={() => toggleContactSelection(contact.id)}
                                />
                                <CardTitle className="text-base">{contact.fullName}</CardTitle>
                              </div>
                              <CardDescription className="mt-1">{contact.address}</CardDescription>
                            </div>
                            <Badge className={statusColor}>
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
                              <span>
                                {contact.city}, {contact.zipcode}
                              </span>
                            </div>
                            {contact.phone && (
                              <div className="flex items-center gap-2">
                                <Phone className="h-3.5 w-3.5 text-muted-foreground" />
                                <span>{contact.phone}</span>
                              </div>
                            )}
                          </div>

                          {/* Add verification status bar with 3 distinct sections */}
                          <div className="mt-2 mb-1">
                            <div className="flex h-1.5 w-full rounded-full overflow-hidden">
                              <div
                                className={`h-full ${
                                  contact.checkedOnForebears ? "bg-blue-500" : "bg-gray-100 dark:bg-gray-800"
                                } flex-1`}
                              ></div>
                              <div className="w-0.5 bg-white dark:bg-gray-700"></div>
                              <div
                                className={`h-full ${
                                  contact.checkedOnTPS ? "bg-blue-500" : "bg-gray-100 dark:bg-gray-800"
                                } flex-1`}
                              ></div>
                              <div className="w-0.5 bg-white dark:bg-gray-700"></div>
                              <div
                                className={`h-full ${
                                  contact.checkedOnOTM ? "bg-blue-500" : "bg-gray-100 dark:bg-gray-800"
                                } flex-1`}
                              ></div>
                            </div>
                          </div>

                          <div className="flex gap-1 mt-2">
                            {contact.id === lastVerifiedId && (
                              <Badge
                                variant="outline"
                                className="bg-green-50 text-green-700 dark:bg-green-900/20 dark:text-green-400 border-green-200"
                              >
                                <Clock className="h-3 w-3 mr-1" /> Last verified
                              </Badge>
                            )}
                            {contact.notes && contact.notes.trim() !== "" && (
                              <Badge
                                variant="outline"
                                className="bg-blue-50 text-blue-700 dark:bg-blue-900/20 dark:text-blue-400 border-blue-200"
                              >
                                <StickyNote className="h-3 w-3 mr-1" /> Has notes
                              </Badge>
                            )}
                            {contact.needAddressUpdate && (
                              <Badge
                                variant="outline"
                                className="bg-amber-50 text-amber-700 dark:bg-amber-900/20 dark:text-amber-400 border-amber-200"
                              >
                                <AlertCircleIcon className="h-3 w-3 mr-1" /> Address update
                              </Badge>
                            )}
                            {contact.needPhoneUpdate && (
                              <Badge
                                variant="outline"
                                className="bg-amber-50 text-amber-700 dark:bg-amber-900/20 dark:text-amber-400 border-amber-200"
                              >
                                <Phone className="h-3 w-3 mr-1" /> Phone update
                              </Badge>
                            )}
                            {contact.territoryStatus && (
                              <Badge
                                variant="outline"
                                className="bg-purple-50 text-purple-700 dark:bg-purple-900/20 dark:text-purple-400 border-purple-200"
                              >
                                <MapPin className="h-3 w-3 mr-1" /> Different territory
                              </Badge>
                            )}
                          </div>
                        </CardContent>
                        <CardFooter className="flex justify-between pt-2">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={(e) => {
                              e.stopPropagation()
                              toggleContactExpanded(contact.id)
                            }}
                            className="hover:bg-slate-100 dark:hover:bg-slate-800"
                          >
                            {contact.isExpanded ? "Less" : "More"}
                          </Button>
                          <div className="flex gap-1">
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Button
                                  variant={contact.checkedOnForebears ? "secondary" : "outline"}
                                  size="icon"
                                  onClick={(e) => {
                                    e.stopPropagation()
                                    searchOnForebears(contact)
                                  }}
                                  className={
                                    contact.checkedOnForebears
                                      ? "bg-green-100 text-green-700 border-green-300 hover:bg-green-200 dark:bg-green-900/30 dark:text-green-400 dark:border-green-800 dark:hover:bg-green-900/50"
                                      : "bg-blue-50 hover:bg-blue-100 dark:bg-blue-900/20 dark:hover:bg-blue-900/40"
                                  }
                                >
                                  <Globe className="h-4 w-4" />
                                </Button>
                              </TooltipTrigger>
                              <TooltipContent>Search on Forebears.io</TooltipContent>
                            </Tooltip>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Button
                                  variant={contact.checkedOnTPS ? "secondary" : "outline"}
                                  size="icon"
                                  onClick={(e) => {
                                    e.stopPropagation()
                                    searchOnTruePeopleSearch(contact)
                                  }}
                                  className={
                                    contact.checkedOnTPS
                                      ? "bg-green-100 text-green-700 border-green-300 hover:bg-green-200 dark:bg-green-900/30 dark:text-green-400 dark:border-green-800 dark:hover:bg-green-900/50"
                                      : "bg-blue-50 hover:bg-blue-100 dark:bg-blue-900/20 dark:hover:bg-blue-900/40"
                                  }
                                >
                                  <Search className="h-4 w-4" />
                                </Button>
                              </TooltipTrigger>
                              <TooltipContent>Search on TruePeopleSearch</TooltipContent>
                            </Tooltip>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Button
                                  variant={contact.checkedOnOTM ? "secondary" : "outline"}
                                  size="icon"
                                  onClick={(e) => {
                                    e.stopPropagation()
                                    copyAndSearchOTM(contact)
                                  }}
                                  className={
                                    contact.checkedOnOTM
                                      ? "bg-green-100 text-green-700 border-green-300 hover:bg-green-200 dark:bg-green-900/30 dark:text-green-400 dark:border-green-800 dark:hover:bg-green-900/50"
                                      : "bg-blue-50 hover:bg-blue-100 dark:bg-blue-900/20 dark:hover:bg-blue-900/40"
                                  }
                                >
                                  {copiedId === contact.id ? (
                                    <Check className="h-4 w-4 text-green-500" />
                                  ) : (
                                    <Copy className="h-4 w-4" />
                                  )}
                                </Button>
                              </TooltipTrigger>
                              <TooltipContent>Copy Name & Open OTM</TooltipContent>
                            </Tooltip>
                          </div>
                        </CardFooter>

                        {contact.isExpanded && (
                          <div className="p-4 bg-muted/30 border-t">
                            <div className="grid grid-cols-1 gap-4">
                              <div>
                                <h3 className="text-sm font-medium mb-2">Contact Details</h3>
                                <div className="space-y-3 text-sm">
                                  <div className="grid grid-cols-3 items-center gap-2">
                                    <span className="font-medium">First Name:</span>
                                    <Input
                                      value={contact.firstName}
                                      onChange={(e) => updateContactField(contact.id, "firstName", e.target.value)}
                                      className="col-span-2 h-8"
                                    />
                                  </div>
                                  <div className="grid grid-cols-3 items-center gap-2">
                                    <span className="font-medium">Last Name:</span>
                                    <Input
                                      value={contact.lastName}
                                      onChange={(e) => updateContactField(contact.id, "lastName", e.target.value)}
                                      className="col-span-2 h-8"
                                    />
                                  </div>
                                  <div className="grid grid-cols-3 items-center gap-2">
                                    <span className="font-medium">Address:</span>
                                    <Input
                                      value={contact.address}
                                      onChange={(e) => updateContactField(contact.id, "address", e.target.value)}
                                      className="col-span-2 h-8"
                                    />
                                  </div>
                                  <div className="grid grid-cols-3 items-center gap-2">
                                    <span className="font-medium">City:</span>
                                    <Input
                                      value={contact.city}
                                      onChange={(e) => updateContactField(contact.id, "city", e.target.value)}
                                      className="col-span-2 h-8"
                                    />
                                  </div>
                                  <div className="grid grid-cols-3 items-center gap-2">
                                    <span className="font-medium">Zipcode:</span>
                                    <Input
                                      value={contact.zipcode}
                                      onChange={(e) => updateContactField(contact.id, "zipcode", e.target.value)}
                                      className="col-span-2 h-8"
                                    />
                                  </div>
                                  <div className="grid grid-cols-3 items-center gap-2">
                                    <span className="font-medium">Phone:</span>
                                    <Input
                                      value={contact.phone}
                                      onChange={(e) => updateContactField(contact.id, "phone", e.target.value)}
                                      className="col-span-2 h-8"
                                    />
                                  </div>
                                </div>
                              </div>
                              <div>
                                <h3 className="text-sm font-medium mb-2">Notes & Status</h3>
                                <Textarea
                                  placeholder="Add notes about this contact..."
                                  value={contact.notes}
                                  onChange={(e) => handleNotesChange(contact.id, e.target.value)}
                                  className="mb-2 min-h-[80px]"
                                />
                                <div className="flex items-center space-x-4">
                                  <div className="flex items-center space-x-2">
                                    <Checkbox
                                      id={`address-update-grid-${contact.id}`}
                                      checked={contact.needAddressUpdate}
                                      onCheckedChange={(checked) => handleAddressUpdateChange(contact.id, !!checked)}
                                    />
                                    <label htmlFor={`address-update-grid-${contact.id}`} className="text-sm">
                                      Address updated
                                    </label>
                                  </div>
                                  <div className="flex items-center space-x-2">
                                    <Checkbox
                                      id={`phone-update-grid-${contact.id}`}
                                      checked={contact.needPhoneUpdate}
                                      onCheckedChange={(checked) => handlePhoneUpdateChange(contact.id, !!checked)}
                                    />
                                    <label htmlFor={`phone-update-grid-${contact.id}`} className="text-sm">
                                      Phone updated
                                    </label>
                                  </div>
                                  <div className="flex items-center space-x-2">
                                    <Checkbox
                                      id={`territory-status-grid-${contact.id}`}
                                      checked={contact.territoryStatus}
                                      onCheckedChange={(checked) => handleTerritoryStatusChange(contact.id, !!checked)}
                                    />
                                    <label htmlFor={`territory-status-grid-${contact.id}`} className="text-sm">
                                      Different territory
                                    </label>
                                  </div>
                                </div>
                                <div className="mt-2">
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
                                </div>
                              </div>
                            </div>
                          </div>
                        )}
                      </Card>
                    )
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        )}
      </main>

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
              <Button
                size="sm"
                variant="outline"
                onClick={() => updateBatchStatus("Not checked")}
                className="bg-blue-50 border-blue-200 hover:bg-blue-100 dark:bg-blue-900/20 dark:border-blue-800 dark:hover:bg-blue-900/40"
              >
                <XCircle className="h-4 w-4 mr-2 text-blue-600 dark:text-blue-400" />
                Not Checked
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => updateBatchStatus("Potentially French")}
                className="bg-green-50 border-green-200 hover:bg-green-100 dark:bg-green-900/20 dark:border-green-800 dark:hover:bg-green-900/40"
              >
                <CheckCircle2 className="h-4 w-4 mr-2 text-green-600 dark:text-green-400" />
                Potentially French
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => updateBatchStatus("Duplicate")}
                className="bg-amber-50 border-amber-200 hover:bg-amber-100 dark:bg-amber-900/20 dark:border-amber-800 dark:hover:bg-amber-900/40"
              >
                <RefreshCw className="h-4 w-4 mr-2 text-amber-600 dark:text-amber-400" />
                Duplicate
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => updateBatchStatus("Detected")}
                className="bg-purple-50 border-purple-200 hover:bg-purple-100 dark:bg-purple-900/20 dark:border-purple-800 dark:hover:bg-purple-900/40"
              >
                <Badge className="h-4 w-4 mr-2 text-purple-600 dark:text-purple-400" />
                Detected
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => updateBatchStatus("Not French")}
                className="bg-red-50 border-red-200 hover:bg-red-100 dark:bg-red-900/20 dark:border-red-800 dark:hover:bg-red-900/40"
              >
                <CircleSlash className="h-4 w-4 mr-2 text-red-600 dark:text-red-400" />
                Not French
              </Button>
              <Button
                size="sm"
                variant="default"
                className="bg-green-600 hover:bg-green-700"
                onClick={() => setSelectedContacts([])}
              >
                <Check className="h-4 w-4 mr-2" />
                Done
              </Button>
            </div>
          </div>
        </div>
      )}
    </TooltipProvider>
  )
}
