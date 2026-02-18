"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { FileSpreadsheet } from "lucide-react"
// XLSX is dynamically imported on export to reduce initial bundle size (~500KB+)

interface Contact {
  id: string
  full_name: string
  address: string
  city: string
  zipcode: string
  phone: string
  status: string
}

interface ExportFrenchContactsProps {
  contacts: Contact[]
}

export function ExportFrenchContacts({ contacts }: ExportFrenchContactsProps) {
  const [isExporting, setIsExporting] = useState(false)

  const parseAddress = (address: string) => {
    // Default values
    let houseNumber = ""
    let direction = ""
    let streetName = ""
    let aptNumber = ""

    if (address && address.trim()) {
      // First, extract apartment number if present
      const aptMatch = address.match(/(?:apt|unit|#|suite)\s*([a-z0-9-]+)/i)
      if (aptMatch) {
        aptNumber = aptMatch[1]
        // Remove apartment info from address for further processing
        address = address.replace(aptMatch[0], "").trim()
      }

      // Split address into parts
      const parts = address.split(" ")

      if (parts.length > 0) {
        // First part should be house number
        const firstPart = parts[0]
        if (/^\d+/.test(firstPart)) {
          houseNumber = firstPart

          // Check if second part is a direction
          if (parts.length > 1) {
            const secondPart = parts[1].toUpperCase()
            const directions = ["N", "S", "E", "W", "NE", "NW", "SE", "SW", "NORTH", "SOUTH", "EAST", "WEST"]

            if (directions.includes(secondPart)) {
              direction = secondPart
              // Street name is everything after direction
              streetName = parts.slice(2).join(" ")
            } else {
              // No direction, street name is everything after house number
              streetName = parts.slice(1).join(" ")
            }
          }
        } else {
          // If first part is not a number, treat whole thing as street name
          streetName = address
        }
      }
    }

    return {
      houseNumber,
      direction,
      streetName,
      aptNumber,
    }
  }

  const handleExport = async () => {
    setIsExporting(true)

    try {
      const XLSX = await import("xlsx")

      // Filter only French contacts
      const frenchContacts = contacts.filter(
        (contact) => contact.status === "Potentially French" || contact.status === "french",
      )

      if (frenchContacts.length === 0) {
        alert("No French contacts to export")
        setIsExporting(false)
        return
      }

      // Prompt for State
      const stateInput = window.prompt("Please enter the State for these contacts (e.g., VA):", "VA")
      if (stateInput === null) {
        // User cancelled
        setIsExporting(false)
        return
      }
      const state = stateInput.trim()

      // Create the data array with headers
      const exportData = []

      // Add headers - exactly as requested
      exportData.push([
        "Contact name",
        "House number",
        "Direction",
        "Street name",
        "Apt number",
        "City",
        "Zipcode",
        "State",
        "Phone",
      ])

      // Add contact data
      frenchContacts.forEach((contact) => {
        const addressParts = parseAddress(contact.address)

        exportData.push([
          contact.full_name,
          addressParts.houseNumber,
          addressParts.direction,
          addressParts.streetName,
          addressParts.aptNumber,
          contact.city,
          contact.zipcode,
          state, // Use user-provided state
          contact.phone,
        ])
      })

      // Create workbook and worksheet
      const wb = XLSX.utils.book_new()
      const ws = XLSX.utils.aoa_to_sheet(exportData)

      // Set column widths
      ws["!cols"] = [
        { wch: 20 }, // Contact name
        { wch: 12 }, // House number
        { wch: 10 }, // Direction
        { wch: 25 }, // Street name
        { wch: 12 }, // Apt number
        { wch: 15 }, // City
        { wch: 10 }, // Zipcode
        { wch: 8 }, // State
        { wch: 15 }, // Phone
      ]

      // Add worksheet to workbook
      XLSX.utils.book_append_sheet(wb, ws, "French Contacts")

      // Generate filename
      const today = new Date()
      const dateStr =
        today.getFullYear() +
        "-" +
        String(today.getMonth() + 1).padStart(2, "0") +
        "-" +
        String(today.getDate()).padStart(2, "0")
      const filename = `French_Contacts_${dateStr}.xlsx`

      // Download the file
      XLSX.writeFile(wb, filename)

      alert(`Successfully exported ${frenchContacts.length} French contacts`)
    } catch (error) {
      console.error("Export error:", error)
      alert("Error exporting contacts. Please try again.")
    } finally {
      setIsExporting(false)
    }
  }

  // Count French contacts
  const frenchCount = contacts.filter(
    (contact) => contact.status === "Potentially French" || contact.status === "french",
  ).length

  return (
    <Button onClick={handleExport} disabled={isExporting || frenchCount === 0} className="flex items-center gap-2">
      <FileSpreadsheet className="h-4 w-4" />
      {isExporting ? "Exporting..." : `Export French (${frenchCount})`}
    </Button>
  )
}
