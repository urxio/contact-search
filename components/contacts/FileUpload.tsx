import React, { useRef } from "react"
import { Upload, Check, RefreshCw, AlertCircleIcon } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Alert, AlertTitle, AlertDescription } from "@/components/ui/alert"
import * as XLSX from "xlsx"
import { EnhancedContact } from "@/hooks/useContacts"

interface FileUploadProps {
    onContactsLoaded: (contacts: EnhancedContact[]) => void
    onNewSession: () => void
    isLoading: boolean
    fileUploaded: boolean
    error: string | null
    setFileUploaded: (uploaded: boolean) => void
    setIsLoading: (loading: boolean) => void
    setError: (error: string | null) => void
}

const FIXED_COLUMNS = {
    FIRST_NAME: 0,
    LAST_NAME: 1,
    ADDRESS: 2,
    CITY: 3,
    ZIPCODE: 4,
    PHONE: 5,
}

// Validation helper functions
function isValidPhoneNumber(phone: string): boolean {
    if (!phone || phone.trim() === "") return false
    // Allow phone numbers with digits, spaces, hyphens, parentheses, and +
    const phoneRegex = /^[+]?[(]?[0-9]{1,4}[)]?[-\s.]?[(]?[0-9]{1,4}[)]?[-\s.]?[0-9]{1,9}$/
    return phoneRegex.test(phone.replace(/\s/g, ""))
}

function isValidZipcode(zipcode: string): boolean {
    if (!zipcode || zipcode.trim() === "") return false
    // Allow US zipcodes (5 or 9 digits), French zipcodes (5 digits), and other formats with digits/letters
    const zipcodeRegex = /^[A-Z0-9]{2,10}(-[A-Z0-9]{1,4})?$/i
    return zipcodeRegex.test(zipcode.trim())
}

function isValidCity(city: string): boolean {
    // City should have at least 2 characters and contain letters
    return city && city.trim().length >= 2 && /[a-zA-Z]/.test(city)
}

function isValidAddress(address: string): boolean {
    // Address should have at least 3 characters
    return address && address.trim().length >= 3
}

function isValidName(name: string): boolean {
    // Name should have at least 2 characters and contain letters
    return name && name.trim().length >= 2 && /[a-zA-Z]/.test(name)
}

export function FileUpload({
    onContactsLoaded,
    onNewSession,
    isLoading,
    fileUploaded,
    error,
    setFileUploaded,
    setIsLoading,
    setError,
}: FileUploadProps) {
    const fileInputRef = useRef<HTMLInputElement>(null)

    const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0]
        if (!file) return

        setIsLoading(true)
        setError(null)

        const reader = new FileReader()

        reader.onload = (e) => {
            try {
                const data = e.target?.result
                const workbook = XLSX.read(data, { type: "binary" })
                const sheetName = workbook.SheetNames[0]
                const worksheet = workbook.Sheets[sheetName]
                const rawData = XLSX.utils.sheet_to_json<any[]>(worksheet, { header: 1 })

                if (rawData.length <= 1) {
                    throw new Error("No data found in the Excel file")
                }

                // Validate and process contacts
                const validationErrors: string[] = []
                const processedContacts = rawData.slice(1).map((row, rowIndex) => {
                    const firstName = String(row[FIXED_COLUMNS.FIRST_NAME] || "").trim()
                    const lastName = String(row[FIXED_COLUMNS.LAST_NAME] || "").trim()
                    const address = String(row[FIXED_COLUMNS.ADDRESS] || "").trim()
                    const city = String(row[FIXED_COLUMNS.CITY] || "").trim()
                    const zipcode = String(row[FIXED_COLUMNS.ZIPCODE] || "").trim()
                    const phone = String(row[FIXED_COLUMNS.PHONE] || "").trim()

                    // Validate required fields
                    if (!isValidName(firstName)) {
                        validationErrors.push(`Row ${rowIndex + 2}: Invalid first name "${firstName}"`)
                    }
                    if (!isValidName(lastName)) {
                        validationErrors.push(`Row ${rowIndex + 2}: Invalid last name "${lastName}"`)
                    }
                    if (!isValidAddress(address)) {
                        validationErrors.push(`Row ${rowIndex + 2}: Invalid address "${address}" (min 3 characters)`)
                    }
                    if (!isValidCity(city)) {
                        validationErrors.push(`Row ${rowIndex + 2}: Invalid city "${city}" (min 2 characters)`)
                    }
                    if (!isValidZipcode(zipcode)) {
                        validationErrors.push(`Row ${rowIndex + 2}: Invalid zipcode "${zipcode}" (expected format: 5-10 alphanumeric)`)
                    }
                    if (!isValidPhoneNumber(phone)) {
                        validationErrors.push(`Row ${rowIndex + 2}: Invalid phone number "${phone}" (expected format: +1 (555) 123-4567 or similar)`)
                    }

                    const fullName = `${firstName} ${lastName}`.trim()

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
                        territoryStatus: false,
                    }
                })

                // If there are validation errors, display them but still load the contacts
                if (validationErrors.length > 0) {
                    const errorSummary = `Format validation issues found (${validationErrors.length} errors):\n\n${validationErrors.slice(0, 5).join("\n")}${validationErrors.length > 5 ? `\n... and ${validationErrors.length - 5} more errors` : ""}`
                    setError(errorSummary)
                    console.warn("Validation warnings:", validationErrors)
                }

                onContactsLoaded(processedContacts)
                setFileUploaded(true)
            } catch (error) {
                console.error("Error parsing Excel file:", error)
                setError(`Error parsing Excel file: ${error instanceof Error ? error.message : "Unknown error"}`)
                onContactsLoaded([])
            } finally {
                setIsLoading(false)
            }
        }

        reader.onerror = () => {
            setIsLoading(false)
            setError("Error reading file. Please try again.")
        }

        reader.readAsBinaryString(file)
    }

    return (
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

                            <Button
                                variant="outline"
                                size="sm"
                                onClick={() => {
                                    if (fileInputRef.current) fileInputRef.current.value = ""
                                    onNewSession()
                                }}
                                className="flex items-center gap-1 bg-red-50 border-red-200 hover:bg-red-100 dark:bg-red-900/20 dark:border-red-800 dark:hover:bg-red-900/40"
                            >
                                <RefreshCw className="h-4 w-4 text-red-600 dark:text-red-400" />
                                <span>New Session</span>
                            </Button>
                        </div>
                    </div>
                    <div className="text-sm text-muted-foreground">
                        <p className="mb-2"><strong>Required columns:</strong> First Name, Last Name, Address, City, Zipcode, Phone</p>
                        <p className="text-xs">
                            <strong>Expected formats:</strong><br/>
                            • Names: min 2 characters with letters<br/>
                            • Address: min 3 characters<br/>
                            • City: min 2 characters with letters<br/>
                            • Zipcode: 5-10 alphanumeric (e.g., 75001 or AB12 3CD)<br/>
                            • Phone: valid format (e.g., +1 (555) 123-4567 or 555-123-4567)
                        </p>
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
    )
}
