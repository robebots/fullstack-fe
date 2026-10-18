"use client"

import { cn } from "cn"
import { ChevronDown } from "lucide-react"
import { useState } from "react"
import { formatNumber } from "@/lib/format"
import { useMarket, useStats } from "@/lib/markets"

export type Ticket = { side: "buy" | "sell"; price: string }

const chip = "h-8 rounded-[3px] bg-muted text-xs text-foreground hover:bg-accent"

const field = "flex h-9 items-center gap-2 rounded-[3px] border border-line px-2.5 focus-within:border-primary/60"

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-muted-foreground">{label}</span>
      <span>{value}</span>
    </div>
  )
}

export function OrderForm({
  coin,
  ticket,
  onTicket,
  className,
}: {
  coin: string
  ticket: Ticket
  onTicket: (ticket: Ticket) => void
  className?: string
}) {
  const market = useMarket(coin)
  const stats = useStats(coin)
  const [size, setSize] = useState("")
  const leverage = Math.min(20, market?.maxLeverage ?? 20)
  return (
    <aside
      aria-label="Order ticket"
      className={cn("flex min-h-0 flex-col gap-3 overflow-y-auto rounded-[3px] bg-panel p-3 text-xs", className)}
    >
      <div className="grid grid-cols-3 gap-2">
        <button type="button" className={chip}>
          Cross
        </button>
        <button type="button" className={chip}>
          {leverage}x
        </button>
        <button type="button" className={chip}>
          Unified
        </button>
      </div>
      <div className="grid h-9 grid-cols-3 border-b border-line">
        {["Market", "Limit", "Pro"].map((type) => (
          <span
            key={type}
            className={cn(
              "relative grid place-items-center",
              type === "Limit"
                ? "text-foreground after:absolute after:inset-x-0 after:-bottom-px after:h-0.5 after:bg-primary"
                : "text-muted-foreground",
            )}
          >
            {type}
          </span>
        ))}
      </div>
      <div className="grid h-9 grid-cols-2 rounded-[3px] bg-muted p-0.5">
        {(["buy", "sell"] as const).map((side) => (
          <button
            key={side}
            type="button"
            aria-pressed={ticket.side === side}
            onClick={() => onTicket({ ...ticket, side })}
            className={cn(
              "rounded-[3px]",
              ticket.side === side
                ? side === "buy"
                  ? "bg-bid text-black"
                  : "bg-ask text-black"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            {side === "buy" ? "Buy / Long" : "Sell / Short"}
          </button>
        ))}
      </div>
      <Row label="Available to Trade" value="0.00 USDC" />
      <Row label="Current Position" value={`0.00000 ${coin}`} />
      <label className={field}>
        <span className="text-muted-foreground">Price (USD)</span>
        <input
          data-testid="ticket-price"
          inputMode="decimal"
          value={ticket.price}
          onChange={(event) => onTicket({ ...ticket, price: event.target.value })}
          className="min-w-0 flex-1 bg-transparent text-right tabular-nums outline-none"
        />
        <button
          type="button"
          onClick={() => stats?.mid && onTicket({ ...ticket, price: String(stats.mid) })}
          className="text-primary hover:text-primary/80"
        >
          Mid
        </button>
      </label>
      <label className={field}>
        <span className="text-muted-foreground">Size</span>
        <input
          inputMode="decimal"
          value={size}
          onChange={(event) => setSize(event.target.value)}
          className="min-w-0 flex-1 bg-transparent text-right tabular-nums outline-none"
        />
        <span className="flex items-center gap-1">
          {coin} <ChevronDown className="size-3.5 text-muted-foreground" />
        </span>
      </label>
      <div className="flex items-center gap-3">
        <span className="relative h-1 flex-1 rounded-full bg-muted">
          {[0, 25, 50, 75, 100].map((stop) => (
            <span
              key={stop}
              className="absolute top-1/2 size-2 -translate-x-1/2 -translate-y-1/2 rounded-full bg-accent"
              style={{ left: `${stop}%` }}
            />
          ))}
        </span>
        <span className="w-12 rounded-[3px] border border-line px-2 py-1 text-right">0 %</span>
      </div>
      {["Reduce Only", "Take Profit / Stop Loss"].map((option) => (
        <label key={option} className="flex items-center gap-2 text-muted-foreground">
          <input type="checkbox" className="size-3.5 accent-primary" />
          {option}
        </label>
      ))}
      <button
        type="button"
        className="mt-1 h-9 rounded-[3px] bg-primary/15 font-medium text-primary hover:bg-primary/25"
      >
        Enable Trading
      </button>
      <div className="flex flex-col gap-2 border-t border-line pt-3">
        <Row label="Liquidation Price" value="N/A" />
        <Row
          label="Order Value"
          value={
            Number(size) && Number(ticket.price) ? `$${formatNumber(Number(size) * Number(ticket.price), 2)}` : "N/A"
          }
        />
        <Row label="Margin Required" value="N/A" />
        <Row label="Fees" value="0.0450% / 0.0150%" />
      </div>
    </aside>
  )
}
