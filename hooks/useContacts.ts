"use client"

import { useState, useEffect, useCallback, useMemo } from "react"
import { loadDictionaryIfNeeded, isPotentiallyFrench } from "@/utils/french-name-detection"

// Define interfaces here or import them if they are in a shared types file
// For now, I will define them here to match page.tsx
export interface BaseContact {
  firstName: string
  lastName: string
  fullName: string
  address: string
  city: string
  zipcode: string
  phone: string
}

export interface EnhancedContact extends BaseContact {
  id: string
  status: "Not checked" | "Potentially French" | "Not French" | "Duplicate" | "Detected"
  notes: string
  isExpanded: boolean
  checkedOnTPS: boolean
  checkedOnOTM: boolean
  checkedOnForebears: boolean
  needAddressUpdate: boolean
  needPhoneUpdate: boolean
  lastInteraction?: Date
  territoryStatus: boolean
  frenchNameMatched?: boolean
}

export function useContacts() {
  const [contacts, setContacts] = useState<EnhancedContact[]>([])
  const [selectedContacts, setSelectedContacts] = useState<string[]>([])
  const [lastVerifiedId, setLastVerifiedId] = useState<string | null>(null)
  const [isDetecting, setIsDetecting] = useState(false)

  // Load contacts from localStorage
  useEffect(() => {
    const savedContacts = localStorage.getItem("contacts")
    if (savedContacts) {
      try {
        setContacts(JSON.parse(savedContacts))
      } catch (e) {
        console.error("Error loading saved contacts:", e)
      }
    }

    const savedLastVerifiedId = localStorage.getItem("lastVerifiedId")
    if (savedLastVerifiedId) {
      setLastVerifiedId(savedLastVerifiedId)
    }
  }, [])

  // Save contacts to localStorage
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

  const updateLastInteraction = useCallback((id: string) => {
    setLastVerifiedId(id)
    localStorage.setItem("lastVerifiedId", id)
    setContacts((prev) => prev.map((c) => (c.id === id ? { ...c, lastInteraction: new Date() } : c)))
  }, [])

  const handleStatusChange = useCallback(
    (id: string, newStatus: EnhancedContact["status"]) => {
      setContacts((prev) => prev.map((c) => (c.id === id ? { ...c, status: newStatus } : c)))
      if (newStatus === "Potentially French") {
        updateLastInteraction(id)
      }
    },
    [updateLastInteraction],
  )

  const handleNotesChange = useCallback((id: string, newNotes: string) => {
    setContacts((prev) => prev.map((c) => (c.id === id ? { ...c, notes: newNotes } : c)))
  }, [])

  const handleAddressUpdateChange = useCallback((id: string, needAddressUpdate: boolean) => {
    setContacts((prev) => prev.map((c) => (c.id === id ? { ...c, needAddressUpdate } : c)))
  }, [])

  const handlePhoneUpdateChange = useCallback((id: string, needPhoneUpdate: boolean) => {
    setContacts((prev) => prev.map((c) => (c.id === id ? { ...c, needPhoneUpdate } : c)))
  }, [])

  const handleTerritoryStatusChange = useCallback((id: string, territoryStatus: boolean) => {
    setContacts((prev) => prev.map((c) => (c.id === id ? { ...c, territoryStatus } : c)))
  }, [])

  const updateContactField = useCallback((id: string, field: keyof BaseContact, value: string) => {
    setContacts((prev) =>
      prev.map((contact) => {
        if (contact.id !== id) return contact

        const updatedContact = { ...contact, [field]: value }

        if (field === "address" || field === "city") {
          updatedContact.needAddressUpdate = true
          updatedContact.status = "Potentially French"
        }

        if (field === "phone") {
          updatedContact.needPhoneUpdate = true
          updatedContact.status = "Potentially French"
        }

        if (field === "zipcode") {
          updatedContact.territoryStatus = true
        }

        if (field === "firstName" || field === "lastName") {
          updatedContact.fullName = `${field === "firstName" ? value : contact.firstName} ${
            field === "lastName" ? value : contact.lastName
          }`.trim()
        }

        return updatedContact
      }),
    )
  }, [])

  const deleteContact = useCallback((id: string) => {
    setContacts((prev) => prev.filter((c) => c.id !== id))
  }, [])

  const toggleContactExpanded = useCallback((id: string) => {
    setContacts((prev) => prev.map((c) => (c.id === id ? { ...c, isExpanded: !c.isExpanded } : c)))
  }, [])

  const toggleContactSelection = useCallback((id: string) => {
    setSelectedContacts((prev) => {
      if (prev.includes(id)) {
        return prev.filter((contactId) => contactId !== id)
      } else {
        return [...prev, id]
      }
    })
  }, [])

  const toggleSelectAll = useCallback(
    (filteredContacts: EnhancedContact[]) => {
      if (selectedContacts.length === filteredContacts.length) {
        setSelectedContacts([])
      } else {
        setSelectedContacts(filteredContacts.map((c) => c.id))
      }
    },
    [selectedContacts],
  )

  const updateBatchStatus = useCallback(
    (newStatus: EnhancedContact["status"]) => {
      if (selectedContacts.length === 0) return

      setContacts((prev) =>
        prev.map((c) => (selectedContacts.includes(c.id) ? { ...c, status: newStatus } : c)),
      )
    },
    [selectedContacts],
  )

  const deleteSelectedContacts = useCallback(() => {
    if (selectedContacts.length === 0) return

    if (confirm(`Are you sure you want to delete ${selectedContacts.length} contacts?`)) {
      setContacts((prev) => prev.filter((c) => !selectedContacts.includes(c.id)))
      setSelectedContacts([])
    }
  }, [selectedContacts])

  const detectFrenchNames = useCallback(
    async (onlySelected = false, contactsToCheck?: EnhancedContact[]) => {
      const sourceContacts = contactsToCheck ?? contacts

      if (!sourceContacts || sourceContacts.length === 0) {
        return
      }

      setIsDetecting(true)
      await loadDictionaryIfNeeded()

      const targetIds = onlySelected && selectedContacts.length > 0 ? new Set(selectedContacts) : null

      let changed = 0

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
      return changed
    },
    [contacts, selectedContacts],
  )

  return {
    contacts,
    setContacts,
    selectedContacts,
    setSelectedContacts,
    lastVerifiedId,
    setLastVerifiedId,
    isDetecting,
    updateLastInteraction,
    handleStatusChange,
    handleNotesChange,
    handleAddressUpdateChange,
    handlePhoneUpdateChange,
    handleTerritoryStatusChange,
    updateContactField,
    deleteContact,
    toggleContactExpanded,
    toggleContactSelection,
    toggleSelectAll,
    updateBatchStatus,
    deleteSelectedContacts,
    detectFrenchNames,
  }
}
