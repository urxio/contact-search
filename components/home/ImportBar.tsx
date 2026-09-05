"use client"

import React from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Upload, Check, RefreshCw, AlertCircleIcon, Loader2, Send, PackageOpen } from "lucide-react"

interface ImportBarProps {
  isLoading: boolean
  fileUploaded: boolean
  error: string | null
  fileInputRef: React.RefObject<HTMLInputElement>
  onFileUpload: (e: React.ChangeEvent<HTMLInputElement>) => void
  onNewSession: () => void
  showSubmitForReview?: boolean
  isSubmittingReview?: boolean
  canSubmitForReview?: boolean
  onSubmitForReview?: () => void
  packagesEnabled?: boolean
  onBrowsePackages?: () => void
  ownActivePackages?: Array<{ id: number; name: string }>
  assignedPackages?: Array<{ id: number; name: string }>
  currentPackageId?: number | null
  onOpenAssignedPackage?: (packageId: number) => void
}

export function ImportBar({
  isLoading,
  fileUploaded,
  error,
  fileInputRef,
  onFileUpload,
  onNewSession,
  showSubmitForReview = false,
  isSubmittingReview = false,
  canSubmitForReview = false,
  onSubmitForReview,
  packagesEnabled = false,
  onBrowsePackages,
  ownActivePackages = [],
  assignedPackages = [],
  currentPackageId = null,
  onOpenAssignedPackage,
}: ImportBarProps) {
  const currentActivePackage = ownActivePackages.find((item) => item.id === currentPackageId)
  const continuablePackages = ownActivePackages.filter((item) => item.id !== currentPackageId)

  return (
    <div className="admin-card mb-4 overflow-hidden rounded-2xl">
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
        <Button asChild disabled={isLoading} className="admin-primary-button min-h-11 shrink-0 rounded-xl text-white">
          <label htmlFor="excel-upload" className="flex items-center gap-2 cursor-pointer">
            <Upload className="h-4 w-4" aria-hidden="true" />
            <span>{isLoading ? "Loading…" : packagesEnabled ? "Upload Excel" : "Import Excel File"}</span>
          </label>
        </Button>

        {packagesEnabled ? (
          <Button type="button" variant="outline" className="min-h-11 shrink-0 rounded-xl" onClick={onBrowsePackages}>
            <PackageOpen className="h-4 w-4" aria-hidden="true" />
            Browse Excels
          </Button>
        ) : null}

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
        <div className="flex shrink-0 flex-wrap items-center gap-2 sm:ml-auto">
          {showSubmitForReview ? (
            <Button
              size="sm"
              onClick={onSubmitForReview}
              disabled={!canSubmitForReview || isSubmittingReview}
              className="bg-indigo-600 text-white shadow-sm hover:bg-indigo-700 disabled:opacity-50"
            >
              {isSubmittingReview ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Send className="h-4 w-4" aria-hidden="true" />}
              {isSubmittingReview ? "Submitting…" : "Submit for review"}
            </Button>
          ) : null}
          <Button
            variant="ghost"
            size="sm"
            onClick={onNewSession}
            className="flex items-center gap-1.5 text-red-500 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20"
          >
            <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />
            New Session
          </Button>
        </div>
      </div>

      {currentActivePackage ? (
        <div className="flex min-w-0 items-center gap-3 border-t border-sky-100 bg-sky-50/70 px-5 py-3 text-sky-950 dark:border-sky-900/50 dark:bg-sky-950/30 dark:text-sky-100">
          <PackageOpen className="h-5 w-5 shrink-0 text-sky-600 dark:text-sky-300" aria-hidden="true" />
          <p className="min-w-0 truncate text-sm font-semibold" title={currentActivePackage.name}>Excel: {currentActivePackage.name}</p>
        </div>
      ) : null}

      {continuablePackages.length > 0 ? (
        <div className="flex flex-col gap-3 border-t border-sky-100 bg-sky-50/70 px-5 py-3 text-sky-950 dark:border-sky-900/50 dark:bg-sky-950/30 dark:text-sky-100 sm:flex-row sm:items-center">
          <PackageOpen className="mt-0.5 h-5 w-5 shrink-0 text-sky-600 dark:text-sky-300 sm:mt-0" aria-hidden="true" />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold">{continuablePackages.length === 1 ? "Your Excel is in progress" : `${continuablePackages.length} of your Excels are in progress`}</p>
            <p className="mt-0.5 text-xs text-sky-800/80 dark:text-sky-200/80">Continue reviewing an Excel you started.</p>
            <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-xs text-sky-900 dark:text-sky-100">
              {continuablePackages.map((item) => <span key={item.id} className="font-semibold">Excel: {item.name}</span>)}
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            {continuablePackages.map((item) => (
              <Button key={item.id} type="button" size="sm" variant="outline" className="border-sky-200 bg-background text-sky-700 hover:bg-sky-100 dark:border-sky-800 dark:bg-background/10 dark:text-sky-200" onClick={() => onOpenAssignedPackage?.(item.id)}>
                Continue reviewing
              </Button>
            ))}
          </div>
        </div>
      ) : null}

      {assignedPackages.length > 0 ? (
        <div className="flex flex-col gap-3 border-t border-indigo-100 bg-indigo-50/70 px-5 py-3 text-indigo-950 dark:border-indigo-900/50 dark:bg-indigo-950/30 dark:text-indigo-100 sm:flex-row sm:items-center">
          <PackageOpen className="mt-0.5 h-5 w-5 shrink-0 text-indigo-600 dark:text-indigo-300 sm:mt-0" aria-hidden="true" />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold">{assignedPackages.length === 1 ? "An Excel has been assigned to you by an admin" : `${assignedPackages.length} Excels have been assigned to you by an admin`}</p>
            <p className="mt-0.5 text-xs text-indigo-800/80 dark:text-indigo-200/80">Open an assigned Excel to begin or continue reviewing its contacts.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            {assignedPackages.map((item) => (
              <Button key={item.id} type="button" size="sm" variant="outline" className="border-indigo-200 bg-background text-indigo-700 hover:bg-indigo-100 dark:border-indigo-800 dark:bg-background/10 dark:text-indigo-200" onClick={() => onOpenAssignedPackage?.(item.id)}>
                Open {item.name}
              </Button>
            ))}
          </div>
        </div>
      ) : null}

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
