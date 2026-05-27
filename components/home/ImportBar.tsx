"use client"

import React from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Upload, Check, RefreshCw, AlertCircleIcon } from "lucide-react"

interface ImportBarProps {
  isLoading: boolean
  fileUploaded: boolean
  error: string | null
  fileInputRef: React.RefObject<HTMLInputElement>
  onFileUpload: (e: React.ChangeEvent<HTMLInputElement>) => void
  onNewSession: () => void
}

export function ImportBar({
  isLoading,
  fileUploaded,
  error,
  fileInputRef,
  onFileUpload,
  onNewSession,
}: ImportBarProps) {
  return (
    <div className="mb-4 rounded-2xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 shadow-sm overflow-hidden">
      <div className="flex flex-col sm:flex-row sm:items-center gap-4 px-5 py-4">
        <Input
          type="file"
          id="excel-upload"
          accept=".xlsx, .xls"
          onChange={onFileUpload}
          className="hidden"
          ref={fileInputRef}
        />

        {/* Import button */}
        <Button asChild disabled={isLoading} className="bg-indigo-600 hover:bg-indigo-700 text-white shadow-sm shrink-0">
          <label htmlFor="excel-upload" className="flex items-center gap-2 cursor-pointer">
            <Upload className="h-4 w-4" />
            <span>{isLoading ? "Loading…" : "Import Excel File"}</span>
          </label>
        </Button>

        {/* Uploaded indicator */}
        {fileUploaded && (
          <span className="inline-flex items-center gap-1.5 text-xs font-medium text-green-700 dark:text-green-400 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-full px-2.5 py-1">
            <Check className="h-3.5 w-3.5" />
            File loaded
          </span>
        )}

        {/* Column hint */}
        <p className="text-xs text-gray-400 dark:text-gray-500 hidden sm:block">
          Columns: First Name · Last Name · Address · City · Zipcode · Phone
        </p>

        {/* New Session */}
        <div className="sm:ml-auto shrink-0">
          <Button
            variant="ghost"
            size="sm"
            onClick={onNewSession}
            className="flex items-center gap-1.5 text-red-500 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20"
          >
            <RefreshCw className="h-3.5 w-3.5" />
            New Session
          </Button>
        </div>
      </div>

      {/* Error banner */}
      {error && (
        <div className="border-t border-red-100 dark:border-red-900/40 bg-red-50 dark:bg-red-900/10 px-5 py-3 flex items-start gap-2">
          <AlertCircleIcon className="h-4 w-4 text-red-500 mt-0.5 shrink-0" />
          <p className="text-sm text-red-700 dark:text-red-400">{error}</p>
        </div>
      )}
    </div>
  )
}
