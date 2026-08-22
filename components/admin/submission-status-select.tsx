"use client"

import React, { useState } from "react"
import { toast } from "sonner"

import { Label } from "@/components/ui/label"

export type SubmissionReviewStatus = "pending" | "in_review" | "reviewed"

const SUBMISSION_STATUSES: { value: SubmissionReviewStatus; label: string }[] = [
  { value: "pending", label: "Pending" },
  { value: "in_review", label: "In review" },
  { value: "reviewed", label: "Reviewed" },
]

type Props = {
  submissionId: number
  initialStatus: SubmissionReviewStatus
  apiUrl: string
}

export function SubmissionStatusSelect({ submissionId, initialStatus, apiUrl }: Props) {
  const [status, setStatus] = useState(initialStatus)
  const [saving, setSaving] = useState(false)

  async function changeStatus(nextStatus: SubmissionReviewStatus) {
    if (nextStatus === status || saving) return
    const previousStatus = status
    setStatus(nextStatus)
    setSaving(true)
    try {
      const response = await fetch(apiUrl, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: submissionId, review_status: nextStatus }),
      })
      const result = await response.json()
      if (!response.ok) throw new Error(result?.error || "Unable to update submission status")
      toast.success(`Submission marked ${SUBMISSION_STATUSES.find((item) => item.value === nextStatus)?.label.toLowerCase()}.`)
    } catch (error) {
      setStatus(previousStatus)
      toast.error(error instanceof Error ? error.message : "Unable to update submission status")
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="flex items-center gap-3">
      <Label htmlFor={`submission-status-${submissionId}`} className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        Submission status
      </Label>
      <select
        id={`submission-status-${submissionId}`}
        value={status}
        disabled={saving}
        onChange={(event) => void changeStatus(event.target.value as SubmissionReviewStatus)}
        className="admin-field h-11 min-w-36 rounded-xl px-3 text-sm font-medium outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60"
        aria-label="Submission status"
      >
        {SUBMISSION_STATUSES.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
      </select>
    </div>
  )
}
