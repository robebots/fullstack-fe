"use client"

import { cn } from "cn"
import { useState } from "react"
import { formatNumber } from "@/lib/format"
import { OrderBook, type PriceSelection } from "./order-book"

export function Showcase() {
  const [selection, setSelection] = useState<PriceSelection>()
  return (
    <main className="h-dvh">
      <div className="mx-auto h-full max-w-[379px] pt-3.5 pb-px lg:pointer-fine:hidden">
        <OrderBook market="BTC" />
      </div>
      <div className="hidden h-full items-center justify-center gap-1 lg:pointer-fine:flex">
        <div className="h-[760px] w-[296px]">
          <OrderBook market="BTC" onPriceSelect={setSelection} />
        </div>
        <div className="h-[760px] w-[296px]">
          <OrderBook market="ETH" onPriceSelect={setSelection} />
        </div>
        <Ticket selection={selection} />
      </div>
    </main>
  )
}

const field = "flex items-center justify-between rounded-md border px-2.5 py-2"

function Ticket({ selection }: { selection?: PriceSelection }) {
  return (
    <aside
      aria-label="Order ticket"
      className="flex h-[760px] w-[296px] flex-col gap-3 rounded-md border bg-card p-3 text-xs"
    >
      <div className="grid grid-cols-2 rounded-md bg-muted p-0.5 text-center">
        {(["buy", "sell"] as const).map((side) => (
          <span
            key={side}
            className={cn(
              "rounded py-1.5 capitalize",
              selection?.side === side
                ? side === "buy"
                  ? "bg-bid text-black"
                  : "bg-ask text-black"
                : "text-muted-foreground",
            )}
          >
            {side}
          </span>
        ))}
      </div>
      <div className={field}>
        <span className="text-muted-foreground">Market</span>
        <output data-testid="ticket-market">{selection ? `${selection.coin}-USD` : ""}</output>
      </div>
      <div className={field}>
        <span className="text-muted-foreground">Limit price (USD)</span>
        <output data-testid="ticket-price" className="tabular-nums">
          {selection ? formatNumber(selection.price, 0, 6) : "Tap a level"}
        </output>
      </div>
      <p className="text-muted-foreground">
        Demo ticket. Tapping a level in either book picks the side and price, the way a trading screen wires its book to
        order entry. Nothing is sent.
      </p>
    </aside>
  )
}
