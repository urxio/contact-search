import { cn } from "@/lib/utils"

type PageFrameProps = {
  eyebrow?: string
  title: string
  description: string
  actions?: React.ReactNode
  children: React.ReactNode
  className?: string
}

export function PageFrame({ eyebrow, title, description, actions, children, className }: PageFrameProps) {
  return (
    <main className={cn("mx-auto w-full max-w-6xl px-4 py-8 sm:px-6 sm:py-10", className)}>
      <header className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="max-w-2xl">
          {eyebrow ? (
            <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-primary">{eyebrow}</p>
          ) : null}
          <h1 className="text-2xl font-bold leading-tight">{title}</h1>
          <p className="mt-2 text-sm font-normal leading-relaxed text-muted-foreground">{description}</p>
        </div>
        {actions ? <div className="flex shrink-0 items-center gap-2">{actions}</div> : null}
      </header>
      {children}
    </main>
  )
}
