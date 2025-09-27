"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { FileJson, AlertTriangle, CheckCircle } from "lucide-react"
import { ScrollArea } from "@/components/ui/scroll-area"

interface Contact {
  id: string
  full_name: string
  address: string
  city: string
  zipcode: string
  phone: string
  status: string
  all_actions_clicked?: boolean // Track if all verification actions were completed
  verification_sites_checked?: string[] // Track which sites were checked
}

interface ExportJsonWithVerificationProps {
  contacts: Contact[]
}

export function ExportJsonWithVerification({ contacts }: ExportJsonWithVerificationProps) {
  const [isExporting, setIsExporting] = useState(false)
  const [showVerificationDialog, setShowVerificationDialog] = useState(false)

  // Get potentially French contacts
  const potentiallyFrenchContacts = contacts.filter(
    (contact) => contact.status === "Potentially French" || contact.status === "french",
  )

  // Get unverified contacts (those that haven't had all actions clicked)
  const unverifiedContacts = potentiallyFrenchContacts.filter((contact) => !contact.all_actions_clicked)

  const handleExport = () => {
    // Check if there are unverified contacts
    if (unverifiedContacts.length > 0) {
      setShowVerificationDialog(true)
      return
    }

    // Proceed with export if all contacts are verified
    proceedWithExport()
  }

  const proceedWithExport = () => {
    setIsExporting(true)
    setShowVerificationDialog(false)

    try {
      // Create JSON data for verified French contacts
      const exportData = potentiallyFrenchContacts.map((contact) => ({
        id: contact.id,
        name: contact.full_name,
        address: contact.address,
        city: contact.city,
        zipcode: contact.zipcode,
        phone: contact.phone,
        status: contact.status,
        verified: contact.all_actions_clicked || false,
        verification_sites: contact.verification_sites_checked || [],
      }))

      // Create and download JSON file
      const jsonString = JSON.stringify(exportData, null, 2)
      const blob = new Blob([jsonString], { type: "application/json" })
      const url = URL.createObjectURL(blob)

      const link = document.createElement("a")
      link.href = url

      const today = new Date()
      const dateStr =
        today.getFullYear() +
        "-" +
        String(today.getMonth() + 1).padStart(2, "0") +
        "-" +
        String(today.getDate()).padStart(2, "0")

      link.download = `French_Contacts_Verified_${dateStr}.json`
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)
      URL.revokeObjectURL(url)

      alert(`Successfully exported ${potentiallyFrenchContacts.length} French contacts`)
    } catch (error) {
      console.error("Export error:", error)
      alert("Error exporting contacts. Please try again.")
    } finally {
      setIsExporting(false)
    }
  }

  const forceExport = () => {
    proceedWithExport()
  }

  return (
    <>
      <Button
        onClick={handleExport}
        disabled={isExporting || potentiallyFrenchContacts.length === 0}
        variant="outline"
        className="flex items-center gap-2"
      >
        <FileJson className="h-4 w-4" />
        {isExporting ? "Exporting..." : `Export JSON (${potentiallyFrenchContacts.length})`}
      </Button>

      <Dialog open={showVerificationDialog} onOpenChange={setShowVerificationDialog}>
        <DialogContent className="max-w-2xl max-h-[80vh]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-amber-500" />
              Verification Required
            </DialogTitle>
            <DialogDescription>
              You have {unverifiedContacts.length} potentially French contact(s) that haven't been verified on all
              sites. Please verify these contacts before exporting, or proceed anyway.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-semibold">Unverified Contacts</h3>
              <Badge variant="destructive">{unverifiedContacts.length} unverified</Badge>
            </div>

            <ScrollArea className="h-[300px] w-full rounded-md border p-4">
              <div className="space-y-3">
                {unverifiedContacts.map((contact) => (
                  <Card key={contact.id} className="border-amber-200 bg-amber-50 dark:bg-amber-950/20">
                    <CardHeader className="pb-2">
                      <CardTitle className="text-base flex items-center justify-between">
                        <span>{contact.full_name}</span>
                        <Badge variant="outline" className="text-amber-700 border-amber-300">
                          Not Verified
                        </Badge>
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="text-sm space-y-1">
                        <p>
                          <strong>Address:</strong> {contact.address}
                        </p>
                        <p>
                          <strong>City:</strong> {contact.city}, {contact.zipcode}
                        </p>
                        <p>
                          <strong>Phone:</strong> {contact.phone}
                        </p>
                        <p>
                          <strong>Status:</strong> {contact.status}
                        </p>

                        {contact.verification_sites_checked && contact.verification_sites_checked.length > 0 ? (
                          <div>
                            <strong>Sites Checked:</strong>
                            <div className="flex flex-wrap gap-1 mt-1">
                              {contact.verification_sites_checked.map((site) => (
                                <Badge key={site} variant="secondary" className="text-xs">
                                  {site}
                                </Badge>
                              ))}
                            </div>
                          </div>
                        ) : (
                          <p className="text-amber-600 dark:text-amber-400">
                            <strong>No verification sites checked</strong>
                          </p>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </ScrollArea>

            <div className="bg-blue-50 dark:bg-blue-950/20 p-4 rounded-lg">
              <h4 className="font-semibold text-blue-800 dark:text-blue-200 mb-2">Verification Instructions:</h4>
              <ul className="text-sm text-blue-700 dark:text-blue-300 space-y-1">
                <li>• Click on each contact to expand their details</li>
                <li>• Use the "All Actions" button to verify the contact on all required sites</li>
                <li>• Make sure to check: White Pages, Facebook, Google, and other verification sources</li>
                <li>• Once verified, the contact will be marked as complete</li>
              </ul>
            </div>

            <div className="flex justify-between gap-3">
              <Button variant="outline" onClick={() => setShowVerificationDialog(false)}>
                Cancel
              </Button>
              <div className="flex gap-2">
                <Button variant="destructive" onClick={forceExport} className="flex items-center gap-2">
                  <FileJson className="h-4 w-4" />
                  Export Anyway
                </Button>
                <Button onClick={() => setShowVerificationDialog(false)} className="flex items-center gap-2">
                  <CheckCircle className="h-4 w-4" />
                  Verify Contacts First
                </Button>
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
}
