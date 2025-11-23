import React from "react"
import { CheckCircle2, XCircle, CircleSlash } from "lucide-react"
import { EnhancedContact } from "@/hooks/useContacts"

interface StatsPanelProps {
    contacts: EnhancedContact[]
    onFilterChange: (status: string) => void
    currentFilter: string
}

export function StatsPanel({ contacts, onFilterChange, currentFilter }: StatsPanelProps) {
    const notCheckedCount = contacts.filter((c) => c.status === "Not checked").length
    const potentiallyFrenchCount = contacts.filter((c) => c.status === "Potentially French").length
    const notFrenchCount = contacts.filter((c) => c.status === "Not French").length
    const detectedCount = contacts.filter((c) => c.status === "Detected").length

    const totalChecked = potentiallyFrenchCount + notFrenchCount + detectedCount
    const progressPercentage = contacts.length > 0 ? Math.round((totalChecked / contacts.length) * 100) : 0

    if (contacts.length === 0) return null

    const getCardClass = (status: string) => {
        const isActive = currentFilter === status
        return `flex items-center p-3 rounded-lg border cursor-pointer transition-all hover:shadow-md ${isActive
                ? "bg-gray-50 border-gray-400 ring-1 ring-gray-400 dark:bg-gray-800 dark:border-gray-500"
                : "bg-white border-gray-200 dark:bg-gray-800 dark:border-gray-700"
            }`
    }

    return (
        <div className="mb-6">
            <div className="flex items-center justify-between mb-4">
                <h2 className="text-xl font-bold">Statistics</h2>
                <div className="flex items-center gap-2">
                    <span className="text-sm font-medium">Checked:</span>
                    <div className="w-48 h-2 bg-gray-100 rounded-full dark:bg-gray-800 overflow-hidden">
                        <div
                            className="h-2 bg-gradient-to-r from-blue-400 to-purple-600 rounded-full"
                            style={{ width: `${progressPercentage}%` }}
                        ></div>
                    </div>
                    <span className="text-sm font-medium">{progressPercentage}%</span>
                </div>
            </div>

            <div className="grid grid-cols-4 gap-3">
                <div
                    className={getCardClass("Not checked")}
                    onClick={() => onFilterChange("Not checked")}
                >
                    <div className="rounded-full p-2 bg-blue-100 dark:bg-blue-900/30 mr-3">
                        <XCircle className="h-4 w-4 text-blue-600 dark:text-blue-400" />
                    </div>
                    <div>
                        <div className="text-lg font-bold">{notCheckedCount}</div>
                        <div className="text-xs text-muted-foreground">Not Checked</div>
                    </div>
                </div>

                <div
                    className={getCardClass("Potentially French")}
                    onClick={() => onFilterChange("Potentially French")}
                >
                    <div className="rounded-full p-2 bg-green-100 dark:bg-green-900/30 mr-3">
                        <CheckCircle2 className="h-4 w-4 text-green-600 dark:text-green-400" />
                    </div>
                    <div>
                        <div className="text-lg font-bold">{potentiallyFrenchCount}</div>
                        <div className="text-xs text-muted-foreground">Potentially French</div>
                    </div>
                </div>

                <div
                    className={getCardClass("Not French")}
                    onClick={() => onFilterChange("Not French")}
                >
                    <div className="rounded-full p-2 bg-red-100 dark:bg-red-900/30 mr-3">
                        <CircleSlash className="h-4 w-4 text-red-600 dark:text-red-400" />
                    </div>
                    <div>
                        <div className="text-lg font-bold">{notFrenchCount}</div>
                        <div className="text-xs text-muted-foreground">Not French</div>
                    </div>
                </div>

                <div
                    className={getCardClass("Detected")}
                    onClick={() => onFilterChange("Detected")}
                >
                    <div className="rounded-full p-2 bg-purple-200 dark:bg-purple-800/50 mr-3">
                        <CheckCircle2 className="h-4 w-4 text-purple-700 dark:text-purple-300" />
                    </div>
                    <div>
                        <div className="text-lg font-bold">{detectedCount}</div>
                        <div className="text-xs text-muted-foreground">Detected</div>
                    </div>
                </div>
            </div>
        </div>
    )
}
