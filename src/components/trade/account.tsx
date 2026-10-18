import { cn } from "cn"

const TABS = ["Balances", "Positions", "Open Orders", "TWAP", "Trade History", "Funding History", "Order History"]

const COLUMNS = ["Market", "Size", "Position Value", "Entry Price", "Mark Price", "PNL (ROE %)", "Liq. Price", "Margin"]

export function Account({ className }: { className?: string }) {
  return (
    <section aria-label="Account" className={cn("flex min-h-0 flex-col rounded-[3px] bg-panel text-xs", className)}>
      <div className="flex h-10 shrink-0 items-center gap-5 overflow-x-auto border-b border-line px-3 whitespace-nowrap">
        {TABS.map((tab) => (
          <span
            key={tab}
            className={cn(
              "relative flex h-full items-center",
              tab === "Positions"
                ? "text-foreground after:absolute after:inset-x-0 after:bottom-0 after:h-0.5 after:bg-primary"
                : "text-muted-foreground",
            )}
          >
            {tab}
          </span>
        ))}
      </div>
      <div className="hidden h-8 shrink-0 grid-cols-8 items-center px-3 text-muted-foreground lg:grid">
        {COLUMNS.map((column) => (
          <span key={column}>{column}</span>
        ))}
      </div>
      <p className="px-3 py-2 text-muted-foreground">No open positions yet</p>
    </section>
  )
}
