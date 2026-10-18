import { cn } from "cn"
import { ChevronDown } from "lucide-react"

export function Chart({ className }: { className?: string }) {
  return (
    <section aria-label="Chart" className={cn("flex min-h-0 flex-col rounded-[3px] bg-panel", className)}>
      <div className="flex h-10 shrink-0 items-center gap-5 border-b border-line px-3 text-xs">
        <span className="relative flex h-full items-center text-foreground after:absolute after:inset-x-0 after:bottom-0 after:h-0.5 after:bg-primary">
          Chart
        </span>
        <span className="text-muted-foreground">Funding</span>
      </div>
      <div className="flex h-9 shrink-0 items-center gap-4 border-b border-line px-3 text-xs text-muted-foreground">
        <span>5m</span>
        <span className="text-primary">1h</span>
        <span>D</span>
        <ChevronDown className="size-3.5" />
        <span className="h-4 w-px bg-line" />
        <span>Indicators</span>
      </div>
      <div className="relative min-h-0 flex-1 bg-[linear-gradient(var(--line)_1px,transparent_1px),linear-gradient(90deg,var(--line)_1px,transparent_1px)] bg-size-[80px_64px]">
        <span className="absolute inset-0 grid place-items-center text-xs text-muted-foreground">
          Chart is scaffolded in this demo
        </span>
      </div>
    </section>
  )
}
