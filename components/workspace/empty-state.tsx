import { ArrowRight, type LucideIcon } from "lucide-react"

import { Button } from "@/components/ui/button"

type EmptyStateProps = {
  icon: LucideIcon
  title: string
  description: string
  actionLabel?: string
  actionHref?: string
}

export function EmptyState({ icon: Icon, title, description, actionLabel, actionHref }: EmptyStateProps) {
  return (
    <div className="admin-material flex flex-col items-center rounded-2xl px-6 py-12 text-center">
      <div className="admin-icon-well mb-4 flex h-12 w-12 items-center justify-center rounded-xl text-primary">
        <Icon className="h-5 w-5" aria-hidden="true" />
      </div>
      <h2 className="text-base font-semibold">{title}</h2>
      <p className="mt-2 max-w-md text-sm font-normal leading-relaxed text-muted-foreground">{description}</p>
      {actionLabel && actionHref ? (
        <Button asChild className="admin-primary-button mt-6 min-h-11 rounded-xl">
          <a href={actionHref}>
            {actionLabel}
            <ArrowRight aria-hidden="true" />
          </a>
        </Button>
      ) : null}
    </div>
  )
}
