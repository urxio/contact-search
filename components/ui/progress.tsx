"use client"

import * as React from "react"

import { cn } from "@/lib/utils"

export interface ProgressBarProps extends React.HTMLAttributes<HTMLDivElement> {
  value?: number
  max?: number
}

const ProgressBar = React.forwardRef<HTMLDivElement, ProgressBarProps>(({ className, value, max, ...props }, ref) => {
  return (
    <div
      ref={ref}
      className={cn("relative h-2 w-full overflow-hidden rounded-full bg-secondary", className)}
      {...props}
    >
      <div
        className="absolute left-0 top-0 h-full rounded-full bg-primary transition-all"
        style={{ width: `${((value || 0) / (max || 1)) * 100}%` }}
      />
    </div>
  )
})
ProgressBar.displayName = "ProgressBar"

export { ProgressBar }
