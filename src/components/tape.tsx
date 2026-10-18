"use client"

import { cn } from "cn"
import { useAtomValue } from "jotai"
import { type CSSProperties, memo, Profiler } from "react"
import { coinAtom, unitAtom } from "@/lib/atoms"
import { formatNumber, formatTime } from "@/lib/format"
import { decimalsOf, MARKETS, magnitudeOf, PRECISIONS, tickSize } from "@/lib/hyperliquid"
import { useTrades } from "@/lib/queries"
import type { Print } from "@/lib/trades"
import { Columns } from "./depth"
import { bar, onRender, row, size } from "./styles"

export function Tape() {
  const tape = useTrades((prints) => prints)
  const largest = useTrades((prints) => Math.max(0, ...prints.map((print) => print.sz)))
  return (
    <Profiler id="tape" onRender={onRender}>
      <Columns last="Time" />
      <div data-testid="trades" className="flex flex-col" style={{ "--max": largest || 1 } as CSSProperties}>
        {tape?.map((print) => (
          <TapeRow key={print.id} print={print} />
        ))}
      </div>
    </Profiler>
  )
}

const TapeRow = memo(function TapeRow({ print }: { print: Print }) {
  const { szDecimals } = MARKETS[useAtomValue(coinAtom)]
  const usd = useAtomValue(unitAtom) === "usd"
  const decimals = decimalsOf(tickSize(PRECISIONS[0], magnitudeOf(print.px), szDecimals))
  return (
    <div
      data-side={print.buy ? "buy" : "sell"}
      className={cn(row, "h-(--row)")}
      style={{ "--size": print.sz } as CSSProperties}
    >
      <div
        aria-hidden
        className={cn(bar, "scale-x-[calc(var(--size)/var(--max))]", print.buy ? "bg-bid-bar" : "bg-ask-bar")}
      />
      {print.fresh && (
        <div
          aria-hidden
          className={cn(bar, "animate-print opacity-0 motion-reduce:hidden", print.buy ? "bg-bid" : "bg-ask")}
        />
      )}
      <span className={cn("relative", print.buy ? "text-bid" : "text-ask")}>{formatNumber(print.px, decimals)}</span>
      <span className={size}>{usd ? formatNumber(print.px * print.sz, 0) : formatNumber(print.sz, szDecimals)}</span>
      <span className="relative text-right text-muted-foreground">{formatTime(print.time)}</span>
    </div>
  )
})
