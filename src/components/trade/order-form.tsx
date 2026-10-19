"use client"

import { cn } from "cn"
import { ChevronDown } from "lucide-react"
import { useState } from "react"
import { formatNumber } from "@/lib/format"
import { priceInput } from "@/lib/hyperliquid"
import { useMarket, useStats } from "@/lib/markets"
import { underline } from "../styles"

export type Ticket = { side: "buy" | "sell"; price: string }

const chip = "h-8 bg-muted text-xs text-foreground disabled:cursor-not-allowed"

const field = "flex h-9 items-center gap-2 border border-line px-2.5 focus-within:border-primary/60"

const entry = "min-w-0 flex-1 bg-transparent text-right tabular-nums outline-none pointer-coarse:text-base"

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
      className={cn("flex min-h-0 flex-col gap-3 overflow-y-auto rounded-cell bg-panel p-3 text-xs", className)}
    >
      <div className="grid grid-cols-3 gap-2">
        {["Cross", `${leverage}x`, "Unified"].map((label) => (
          <button key={label} type="button" disabled className={chip}>
            {label}
          </button>
        ))}
      </div>
      <div className="grid h-9 grid-cols-3 border-b border-line">
        {["Market", "Limit", "Pro"].map((type) => (
          <span
            key={type}
            className={cn(
              "grid place-items-center",
              type === "Limit" ? cn(underline, "text-foreground") : "text-muted-foreground",
            )}
          >
            {type}
          </span>
        ))}
      </div>
      <div className="grid h-9 grid-cols-2 bg-muted p-0.5">
        {(["buy", "sell"] as const).map((side) => (
          <button
            key={side}
            type="button"
            aria-pressed={ticket.side === side}
            onClick={() => onTicket({ ...ticket, side })}
            className={cn(
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
      <div className={field}>
        <label htmlFor="ticket-price" className="text-muted-foreground">
          Price (USD)
        </label>
        <input
          id="ticket-price"
          data-testid="ticket-price"
          inputMode="decimal"
          value={ticket.price}
          onChange={(event) => onTicket({ ...ticket, price: event.target.value })}
          className={entry}
        />
        <button
          type="button"
          disabled={!stats?.mid || !market}
          onClick={() =>
            stats?.mid && market && onTicket({ ...ticket, price: priceInput(stats.mid, market.szDecimals) })
          }
          className="text-primary hover:text-primary/80 disabled:text-muted-foreground"
        >
          Mid
        </button>
      </div>
      <div className={field}>
        <label htmlFor="ticket-size" className="text-muted-foreground">
          Size
        </label>
        <input
          id="ticket-size"
          inputMode="decimal"
          value={size}
          onChange={(event) => setSize(event.target.value)}
          className={entry}
        />
        <span className="flex items-center gap-1">
          {coin} <ChevronDown className="size-3.5 text-muted-foreground" />
        </span>
      </div>
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
        <span className="w-12 border border-line px-2 py-1 text-right">0 %</span>
      </div>
      {["Reduce Only", "Take Profit / Stop Loss"].map((option) => (
        <label key={option} className="flex items-center gap-2 text-muted-foreground">
          <input type="checkbox" disabled className="size-3.5 accent-primary" />
          {option}
        </label>
      ))}
      <button type="button" disabled className="mt-1 h-9 cursor-not-allowed bg-primary/15 font-medium text-primary">
        Enable Trading
      </button>
      <p className="text-muted-foreground">Demo ticket. A click on the book fills side and price. Nothing is sent.</p>
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
