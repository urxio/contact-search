import { cn } from "@/lib/utils"

type CongregationMarkProps = {
  name: string
  className?: string
}

export function CongregationMark({ name, className }: CongregationMarkProps) {
  const initial = name.trim().charAt(0).toLocaleUpperCase() || "C"

  return (
    <span
      aria-hidden="true"
      className={cn(
        "admin-icon-well inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-sm font-semibold text-primary",
        className,
      )}
    >
      {initial}
    </span>
  )
}
