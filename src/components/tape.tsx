"use client"

import { cn } from "cn"
import { useAtomValue } from "jotai"
import { SquareArrowOutUpRight } from "lucide-react"
import { type CSSProperties, memo, Profiler } from "react"
import { unitAtom } from "@/lib/atoms"
import { formatNumber, formatTime } from "@/lib/format"
import { priceDecimals } from "@/lib/hyperliquid"
import { useSzDecimals, useTrades } from "@/lib/queries"
import type { Print } from "@/lib/trades"
import { Columns, Placeholder } from "./depth"
import { bar, onRender, row } from "./styles"

const SLOTS = Array.from({ length: 30 }, (_, slot) => slot)

const explorerUrl = (hash: string) => `https://app.hyperliquid.xyz/explorer/tx/${hash}`

export function Tape() {
  const tape = useTrades((prints) => prints)
  const szDecimals = useSzDecimals()
  const largest = useTrades((prints) => Math.max(0, ...prints.map((print) => print.sz)))
  return (
    <Profiler id="tape" onRender={onRender}>
      <Columns last="Time" />
      <div
        data-testid="trades"
        className="flex min-h-0 flex-1 flex-col overflow-hidden"
        style={{ "--max": largest || 1 } as CSSProperties}
      >
        {tape?.length ? (
          tape.map((print) => <TapeRow key={print.id} print={print} szDecimals={szDecimals} />)
        ) : (
          <TapeSkeleton />
        )}
      </div>
    </Profiler>
  )
}

function TapeSkeleton() {
  return (
    <div aria-hidden className="flex min-h-0 flex-1 flex-col overflow-hidden">
      {SLOTS.map((slot) => (
        <Placeholder key={slot} />
      ))}
    </div>
  )
}

const TapeRow = memo(function TapeRow({ print, szDecimals }: { print: Print; szDecimals: number }) {
  const usd = useAtomValue(unitAtom) === "usd"
  const decimals = priceDecimals(print.px, szDecimals)
  const time = formatTime(print.time)
  return (
    <div
      data-side={print.buy ? "buy" : "sell"}
      className={cn(row, "pointer-fine:hover:bg-white/[0.04]")}
      style={{ "--size": print.sz } as CSSProperties}
    >
      <span
        aria-hidden
        className={cn(
          bar,
          "origin-left scale-x-[calc(var(--size)/var(--max))]",
          print.buy ? "bg-bid-bar" : "bg-ask-bar",
        )}
      />
      {print.fresh && (
        <span
          aria-hidden
          className={cn(bar, "animate-print opacity-0 motion-reduce:hidden", print.buy ? "bg-bid" : "bg-ask")}
        />
      )}
      <span className={cn("relative", print.buy ? "text-bid" : "text-ask")}>{formatNumber(print.px, decimals)}</span>
      <span className="relative text-right">
        {usd ? formatNumber(print.px * print.sz, 0) : formatNumber(print.sz, szDecimals)}
      </span>
      <span className="relative flex items-center justify-end gap-1.5">
        {time}
        {print.hash ? (
          <a
            href={explorerUrl(print.hash)}
            target="_blank"
            rel="noreferrer"
            aria-label={`Open the ${time} trade in the explorer`}
            className="text-primary/80 hover:text-primary"
          >
            <SquareArrowOutUpRight className="size-3" />
          </a>
        ) : (
          <span className="size-3" />
        )}
      </span>
    </div>
  )
})
