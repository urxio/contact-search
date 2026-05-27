"use client"

import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { MapPin } from "lucide-react"

interface TerritoryNotesProps {
  territoryZipcode: string
  onZipcodeChange: (v: string) => void
  territoryPageRange: string
  onPageRangeChange: (v: string) => void
  globalNotes: string
  onNotesChange: (v: string) => void
}

export function TerritoryNotes({
  territoryZipcode,
  onZipcodeChange,
  territoryPageRange,
  onPageRangeChange,
  globalNotes,
  onNotesChange,
}: TerritoryNotesProps) {
  return (
    <div className="mb-4 rounded-2xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 shadow-sm overflow-hidden">
      <div className="flex items-center gap-2 px-5 py-3 border-b border-gray-100 dark:border-gray-800">
        <MapPin className="h-4 w-4 text-indigo-500" />
        <span className="text-sm font-semibold text-gray-700 dark:text-gray-300">Territory & Notes</span>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 px-5 py-4">
        <div>
          <label htmlFor="territory-zipcode" className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1.5 uppercase tracking-wide">
            Territory Zipcode
          </label>
          <Input
            id="territory-zipcode"
            placeholder="Enter zipcode…"
            value={territoryZipcode}
            onChange={(e) => onZipcodeChange(e.target.value)}
            className="h-9 text-sm"
          />
        </div>
        <div>
          <label htmlFor="territory-page-range" className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1.5 uppercase tracking-wide">
            Page Range
          </label>
          <Input
            id="territory-page-range"
            placeholder="e.g. 1–10"
            value={territoryPageRange}
            onChange={(e) => onPageRangeChange(e.target.value)}
            className="h-9 text-sm"
          />
        </div>
        <div>
          <label htmlFor="territory-notes" className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1.5 uppercase tracking-wide">
            Notes
          </label>
          <Textarea
            id="territory-notes"
            placeholder="Add notes here…"
            value={globalNotes}
            onChange={(e) => onNotesChange(e.target.value)}
            className="min-h-[72px] text-sm resize-none"
          />
        </div>
      </div>
    </div>
  )
}
