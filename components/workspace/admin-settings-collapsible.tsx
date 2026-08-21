"use client"

import { ChevronDown, ShieldCheck } from "lucide-react"

import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible"

type AdminSettingsCollapsibleProps = {
  children: React.ReactNode
}

export function AdminSettingsCollapsible({ children }: AdminSettingsCollapsibleProps) {
  return (
    <Collapsible className="admin-card group rounded-2xl">
      <CollapsibleTrigger className="flex min-h-11 w-full items-center gap-4 rounded-2xl px-4 py-4 text-left transition-colors duration-150 ease-out hover:bg-muted/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 sm:px-6">
        <span className="admin-icon-well flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-primary">
          <ShieldCheck className="h-5 w-5" aria-hidden="true" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Admin only
          </span>
          <span className="mt-1 block text-base font-semibold">Congregation settings</span>
          <span className="mt-1 block text-sm font-normal leading-relaxed text-muted-foreground">
            Manage people, invitations, and territory coverage.
          </span>
        </span>
        <ChevronDown className="h-5 w-5 shrink-0 text-muted-foreground transition-transform duration-150 ease-out group-data-[state=open]:rotate-180" aria-hidden="true" />
      </CollapsibleTrigger>
      <CollapsibleContent className="border-t px-4 py-6 sm:px-6">
        {children}
      </CollapsibleContent>
    </Collapsible>
  )
}
