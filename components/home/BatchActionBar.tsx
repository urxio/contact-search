"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Check, ThumbsDown } from "lucide-react"
import type { EnhancedContact } from "@/types/contact"

interface BatchActionBarProps {
  selectedCount: number
  onClearSelection: () => void
  onUpdateBatch: (status: EnhancedContact["status"]) => void
  onMarkAsNotFrenchName: () => void
  canMarkNotFrench: boolean
}

export function BatchActionBar({
  selectedCount,
  onClearSelection,
  onUpdateBatch,
  onMarkAsNotFrenchName,
  canMarkNotFrench,
}: BatchActionBarProps) {
  // Not bound to any contact field — just a one-shot trigger that resets
  // back to the placeholder after each selection.
  const [pendingStatus, setPendingStatus] = useState("")

  if (selectedCount === 0) return null

  return (
    <div className="fixed bottom-0 left-0 right-0 bg-background border-t shadow-lg p-4 z-50 transition-all duration-300 ease-in-out">
      <div className="container mx-auto flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <span className="font-medium whitespace-nowrap">{selectedCount} selected</span>
          <Button size="sm" variant="ghost" onClick={onClearSelection}>
            Clear
          </Button>
        </div>

        <div className="flex items-center gap-2">
          <Select
            value={pendingStatus}
            onValueChange={(value) => {
              onUpdateBatch(value as EnhancedContact["status"])
              setPendingStatus("")
            }}
          >
            <SelectTrigger className="w-[170px] h-9">
              <SelectValue placeholder="Set status…" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="Not checked">Not checked</SelectItem>
              <SelectItem value="Potentially French">Potentially French</SelectItem>
              <SelectItem value="Detected">Detected</SelectItem>
              <SelectItem value="Duplicate">Duplicate</SelectItem>
              <SelectItem value="Not French">Not French</SelectItem>
            </SelectContent>
          </Select>

          {canMarkNotFrench && (
            <Button
              size="sm"
              variant="outline"
              onClick={onMarkAsNotFrenchName}
              className="bg-rose-50 border-rose-200 hover:bg-rose-100 dark:bg-rose-900/20 dark:border-rose-800 dark:hover:bg-rose-900/40"
            >
              <ThumbsDown className="h-4 w-4 mr-2 text-rose-600 dark:text-rose-400" />
              Mark as Not French
            </Button>
          )}

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
