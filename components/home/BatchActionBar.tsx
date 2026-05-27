"use client"

import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Check, XCircle, CheckCircle2, RefreshCw, CircleSlash } from "lucide-react"
import type { EnhancedContact } from "@/types/contact"

interface BatchActionBarProps {
  selectedCount: number
  onClearSelection: () => void
  onUpdateBatch: (status: EnhancedContact["status"]) => void
}

export function BatchActionBar({ selectedCount, onClearSelection, onUpdateBatch }: BatchActionBarProps) {
  if (selectedCount === 0) return null

  return (
    <div className="fixed bottom-0 left-0 right-0 bg-background border-t shadow-lg p-4 z-50 transition-all duration-300 ease-in-out">
      <div className="container mx-auto flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="font-medium">{selectedCount} contacts selected</span>
          <Button size="sm" variant="outline" onClick={onClearSelection}>
            Clear Selection
          </Button>
        </div>
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant="outline"
            onClick={() => onUpdateBatch("Not checked")}
            className="bg-blue-50 border-blue-200 hover:bg-blue-100 dark:bg-blue-900/20 dark:border-blue-800 dark:hover:bg-blue-900/40"
          >
            <XCircle className="h-4 w-4 mr-2 text-blue-600 dark:text-blue-400" />
            Not Checked
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() => onUpdateBatch("Potentially French")}
            className="bg-green-50 border-green-200 hover:bg-green-100 dark:bg-green-900/20 dark:border-green-800 dark:hover:bg-green-900/40"
          >
            <CheckCircle2 className="h-4 w-4 mr-2 text-green-600 dark:text-green-400" />
            Potentially French
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() => onUpdateBatch("Duplicate")}
            className="bg-amber-50 border-amber-200 hover:bg-amber-100 dark:bg-amber-900/20 dark:border-amber-800 dark:hover:bg-amber-900/40"
          >
            <RefreshCw className="h-4 w-4 mr-2 text-amber-600 dark:text-amber-400" />
            Duplicate
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() => onUpdateBatch("Detected")}
            className="bg-purple-50 border-purple-200 hover:bg-purple-100 dark:bg-purple-900/20 dark:border-purple-800 dark:hover:bg-purple-900/40"
          >
            <Badge className="h-4 w-4 mr-2 text-purple-600 dark:text-purple-400" />
            Detected
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() => onUpdateBatch("Not French")}
            className="bg-red-50 border-red-200 hover:bg-red-100 dark:bg-red-900/20 dark:border-red-800 dark:hover:bg-red-900/40"
          >
            <CircleSlash className="h-4 w-4 mr-2 text-red-600 dark:text-red-400" />
            Not French
          </Button>
          <Button
            size="sm"
            variant="default"
            className="bg-green-600 hover:bg-green-700"
            onClick={onClearSelection}
          >
            <Check className="h-4 w-4 mr-2" />
            Done
          </Button>
        </div>
      </div>
    </div>
  )
}
