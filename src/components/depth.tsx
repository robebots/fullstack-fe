"use client"

import { cn } from "cn"
import { useAtomValue, useSetAtom } from "jotai"
import { type CSSProperties, Profiler, useLayoutEffect, useRef, useState } from "react"
import { coinAtom, precisionAtom, rowsAtom, selectedAtom, selectLevelAtom, unitAtom } from "@/lib/atoms"
import type { Row } from "@/lib/book"
import { formatNumber } from "@/lib/format"
import { decimalsOf, MARKETS, tickSize } from "@/lib/hyperliquid"
import { useBook, useMagnitude } from "@/lib/queries"
import { bar, calm, grid, onRender, row, size } from "./styles"

const fitted = "min-h-0 flex-1 pointer-fine:h-[var(--pitch,var(--row))] pointer-fine:flex-none"

const depthOf = (rows: Row[], count: number) => rows[Math.min(rows.length, count) - 1]?.total ?? 0

const niceCeil = (value: number) => {
  if (value <= 0) return 1
  const step = 10 ** Math.floor(Math.log10(value))
  return [1, 2, 5, 10].map((m) => m * step).find((ceiling) => ceiling >= value) ?? value
}

export function Columns({ last }: { last: "Total" | "Time" }) {
  const coin = useAtomValue(coinAtom)
  const unit = useAtomValue(unitAtom) === "usd" ? "USD" : coin
  return (
    <div
      className={cn(
        grid,
        "h-14 shrink-0 text-[13.5px] text-muted-foreground pointer-coarse:pt-[7px] pointer-fine:h-[23px] pointer-fine:text-xs",
      )}
    >
      <span>Price</span>
      <span className="pointer-fine:text-right">Size ({unit})</span>
      <span className="text-right">{last === "Total" ? `Total (${unit})` : "Time"}</span>
    </div>
  )
}

export function Depth() {
  const rows = useAtomValue(rowsAtom)
  const setRows = useSetAtom(rowsAtom)
  const [pitch, setPitch] = useState<number>()
  const asks = useRef<HTMLDivElement>(null)
  const max = useBook((view) => niceCeil(Math.max(depthOf(view.bids, rows), depthOf(view.asks, rows))))
  useLayoutEffect(() => {
    const element = asks.current
    if (!element) return
    const observer = new ResizeObserver(([entry]) => {
      const { height } = entry.contentRect
      const least = Number.parseFloat(getComputedStyle(element).getPropertyValue("--row"))
      const count = Math.max(1, Math.min(20, Math.floor(height / least)))
      setRows(count)
      setPitch(Math.floor(height / count))
    })
    observer.observe(element)
    return () => observer.disconnect()
  }, [setRows])
  return (
    <Profiler id="book" onRender={onRender}>
      <div
        className="flex min-h-0 flex-1 flex-col"
        style={{ "--max": max ?? 1, "--pitch": pitch && `${pitch}px` } as CSSProperties}
      >
        <div ref={asks} data-testid="asks" className="flex min-h-0 flex-1 flex-col-reverse overflow-hidden">
          <Side side="asks" rows={rows} />
        </div>
        <Spread />
        <div data-testid="bids" className="flex min-h-0 flex-1 flex-col overflow-hidden">
          <Side side="bids" rows={rows} />
        </div>
      </div>
    </Profiler>
  )
}

function Side({ side, rows }: { side: "asks" | "bids"; rows: number }) {
  const { szDecimals } = MARKETS[useAtomValue(coinAtom)]
  const precision = useAtomValue(precisionAtom)
  const magnitude = useMagnitude()
  const decimals = magnitude === undefined ? 0 : decimalsOf(tickSize(precision, magnitude, szDecimals))
  return Array.from({ length: rows }, (_, slot) => slot).map((slot) => (
    <Profiler key={slot} id={`${side}-${slot}`} onRender={onRender}>
      <BookRow side={side} index={slot} decimals={decimals} />
    </Profiler>
  ))
}

function BookRow({ side, index, decimals }: { side: "asks" | "bids"; index: number; decimals: number }) {
  const level = useBook((view) => view[side][index])
  const { szDecimals } = MARKETS[useAtomValue(coinAtom)]
  const usd = useAtomValue(unitAtom) === "usd"
  const selected = useAtomValue(selectedAtom)
  const selectLevel = useSetAtom(selectLevelAtom)
  const flash = useRef<HTMLSpanElement>(null)
  const animation = useRef<Animation>(undefined)
  const flashAt = level?.flashAt ?? 0
  const pulse = level?.pulse ?? 0
  useLayoutEffect(() => {
    if (calm || !flash.current || performance.now() - flashAt > 100) return
    animation.current?.cancel()
    animation.current = flash.current.animate({ opacity: [0, 0.08 + 0.27 * pulse, 0], offset: [0, 0.2, 1] }, 800)
  }, [flashAt, pulse])
  if (!level) return <div className={cn(fitted, "contain-strict")} />
  const swept = selected?.side === side && (side === "asks" ? level.px <= selected.px : level.px >= selected.px)
  return (
    <button
      type="button"
      aria-pressed={level.px === selected?.px && selected.side === side}
      data-px={level.px}
      data-side={side}
      onClick={() => selectLevel({ side, px: level.px })}
      className={cn(
        row,
        fitted,
        "cursor-pointer text-left outline-none focus-visible:ring-1 focus-visible:ring-ring focus-visible:ring-inset",
      )}
      style={{ "--total": level.total, "--size": level.sz } as CSSProperties}
    >
      <span
        aria-hidden
        className={cn(bar, "scale-x-[calc(var(--total)/var(--max))]", side === "asks" ? "bg-ask-bar" : "bg-bid-bar")}
      />
      <span
        aria-hidden
        className={cn(bar, "scale-x-[calc(var(--size)/var(--max))]", side === "asks" ? "bg-ask/20" : "bg-bid/20")}
      />
      {swept && (
        <span
          aria-hidden
          className={cn(bar, level.px === selected?.px ? "bg-foreground/15" : "bg-foreground/[0.07]")}
        />
      )}
      <span aria-hidden ref={flash} className={cn(bar, "opacity-0", side === "asks" ? "bg-ask" : "bg-bid")} />
      <span className="relative">{formatNumber(level.px, decimals)}</span>
      <span className={size}>{usd ? formatNumber(level.px * level.sz, 0) : formatNumber(level.sz, szDecimals)}</span>
      <span className="relative text-right pointer-coarse:tracking-[0.05em]">
        {usd ? formatNumber(level.totalUsd, 0) : formatNumber(level.total, szDecimals)}
      </span>
    </button>
  )
}

function Spread() {
  const rows = useAtomValue(rowsAtom)
  const touch = useBook((view) => (view.bid && view.ask ? { bid: view.bid, ask: view.ask } : undefined))
  const share = useBook((view) => {
    const bids = depthOf(view.bids, rows)
    const asks = depthOf(view.asks, rows)
    return bids + asks ? Math.round((100 * bids) / (bids + asks)) : undefined
  })
  const spread = touch ? touch.ask - touch.bid : undefined
  return (
    <div
      data-testid="spread"
      className={cn(
        grid,
        "relative my-[1.5px] h-[35px] shrink-0 bg-muted text-[15px] text-[#929292] pointer-fine:my-0 pointer-fine:flex pointer-fine:h-[23px] pointer-fine:justify-center pointer-fine:gap-8 pointer-fine:text-xs",
      )}
    >
      <span>Spread</span>
      <span className="text-[16px] text-foreground pointer-fine:text-xs">
        {spread === undefined ? "" : formatNumber(spread, 0, 6)}
      </span>
      <span className="text-right">
        {touch && spread !== undefined ? `${formatNumber((200 * spread) / (touch.bid + touch.ask), 3)}%` : ""}
      </span>
      {share !== undefined && (
        <div data-testid="imbalance" data-share={share} className="absolute inset-x-0 bottom-0 h-0.5 bg-ask/60">
          <div className="h-full origin-left bg-bid/80" style={{ scale: `${share / 100} 1` }} />
        </div>
      )}
    </div>
  )
}
