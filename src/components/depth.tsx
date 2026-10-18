"use client"

import { cn } from "cn"
import { useAtomValue, useSetAtom } from "jotai"
import { type CSSProperties, Profiler, type RefObject, useLayoutEffect, useRef } from "react"
import { createPortal } from "react-dom"
import {
  coinAtom,
  hoverAtom,
  type Layout,
  layoutAtom,
  precisionAtom,
  rowsAtom,
  type Side,
  selectedAtom,
  selectLevelAtom,
  unitAtom,
} from "@/lib/atoms"
import { type Row, sweepOf } from "@/lib/book"
import { formatNumber, priceDecimals } from "@/lib/format"
import { decimalsOf, tickSize } from "@/lib/hyperliquid"
import { useBook, useMagnitude, useSzDecimals } from "@/lib/queries"
import { bar, calm, cell, grid, onRender, row, split } from "./styles"

const depthOf = (rows: Row[], count: number) => rows[Math.min(rows.length, count) - 1]?.total ?? 0

const niceCeil = (value: number) => {
  if (value <= 0) return 1
  const step = 10 ** Math.floor(Math.log10(value))
  return [1, 2, 5, 10].map((m) => m * step).find((ceiling) => ceiling >= value) ?? value
}

const boxOf = ({ top, bottom, left, right }: DOMRect) => ({ top, bottom, left, right })

function useUnit() {
  const coin = useAtomValue(coinAtom)
  return useAtomValue(unitAtom) === "usd" ? "USD" : coin
}

export function Columns({ last }: { last: "Total" | "Time" }) {
  const unit = useUnit()
  return (
    <div className={cn(grid, "h-6 shrink-0 text-xs text-muted-foreground")}>
      <span>Price</span>
      <span className="text-right">Size ({unit})</span>
      <span className="text-right">{last === "Total" ? `Total (${unit})` : "Time"}</span>
    </div>
  )
}

function useFitRows(ref: RefObject<HTMLDivElement | null>) {
  const setRows = useSetAtom(rowsAtom)
  useLayoutEffect(() => {
    const element = ref.current
    if (!element) return
    const observer = new ResizeObserver(([entry]) => {
      const least = Number.parseFloat(getComputedStyle(element).getPropertyValue("--row"))
      setRows(Math.max(1, Math.min(20, Math.floor(entry.contentRect.height / least))))
    })
    observer.observe(element)
    return () => observer.disconnect()
  }, [ref, setRows])
}

export function Depth() {
  const layout = useAtomValue(layoutAtom)
  const rows = useAtomValue(rowsAtom)
  const max = useBook((view) => niceCeil(Math.max(depthOf(view.bids, rows), depthOf(view.asks, rows))))
  return (
    <Profiler id="book" onRender={onRender}>
      <div className="flex min-h-0 flex-1 flex-col" style={{ "--max": max ?? 1 } as CSSProperties}>
        {layout === "split" ? <Split rows={rows} /> : <Stacked key={layout} layout={layout} rows={rows} />}
      </div>
    </Profiler>
  )
}

function Stacked({ layout, rows }: { layout: Layout; rows: number }) {
  const fit = useRef<HTMLDivElement>(null)
  const setHover = useSetAtom(hoverAtom)
  useFitRows(fit)
  return (
    <>
      <Columns last="Total" />
      {layout !== "bids" && (
        <div
          ref={fit}
          data-testid="asks"
          onPointerLeave={() => setHover(null)}
          className="flex min-h-0 flex-1 flex-col-reverse overflow-hidden"
        >
          <Levels side="asks" rows={rows} />
        </div>
      )}
      <Spread />
      {layout !== "asks" && (
        <div
          ref={layout === "bids" ? fit : undefined}
          data-testid="bids"
          onPointerLeave={() => setHover(null)}
          className="flex min-h-0 flex-1 flex-col overflow-hidden"
        >
          <Levels side="bids" rows={rows} />
        </div>
      )}
    </>
  )
}

function Split({ rows }: { rows: number }) {
  const fit = useRef<HTMLDivElement>(null)
  const setHover = useSetAtom(hoverAtom)
  const unit = useUnit()
  useFitRows(fit)
  return (
    <>
      <div className="grid h-6 shrink-0 grid-cols-2 items-center gap-x-0.5 text-xs text-muted-foreground">
        <span className="grid grid-cols-2 px-2.5">
          <span>Total ({unit})</span>
          <span className="text-right">Price</span>
        </span>
        <span className="grid grid-cols-2 px-2.5">
          <span>Price</span>
          <span className="text-right">Total ({unit})</span>
        </span>
      </div>
      <div className="grid min-h-0 flex-1 grid-cols-2 gap-x-0.5">
        <div
          ref={fit}
          data-testid="bids"
          onPointerLeave={() => setHover(null)}
          className="flex min-h-0 flex-col overflow-hidden"
        >
          <Levels side="bids" rows={rows} split />
        </div>
        <div data-testid="asks" onPointerLeave={() => setHover(null)} className="flex min-h-0 flex-col overflow-hidden">
          <Levels side="asks" rows={rows} split />
        </div>
      </div>
    </>
  )
}

function Levels({ side, rows, split }: { side: Side; rows: number; split?: boolean }) {
  const szDecimals = useSzDecimals()
  const precision = useAtomValue(precisionAtom)
  const magnitude = useMagnitude()
  const decimals = magnitude === undefined ? 0 : decimalsOf(tickSize(precision, magnitude, szDecimals))
  return Array.from({ length: rows }, (_, slot) => slot).map((slot) => (
    <Profiler key={slot} id={`${side}-${slot}`} onRender={onRender}>
      <BookRow side={side} index={slot} decimals={decimals} split={split} />
    </Profiler>
  ))
}

function BookRow({
  side,
  index,
  decimals,
  split: halved,
}: {
  side: Side
  index: number
  decimals: number
  split?: boolean
}) {
  const level = useBook((view) => view[side][index])
  const szDecimals = useSzDecimals()
  const usd = useAtomValue(unitAtom) === "usd"
  const selected = useAtomValue(selectedAtom)
  const selectLevel = useSetAtom(selectLevelAtom)
  const setHover = useSetAtom(hoverAtom)
  const flash = useRef<HTMLSpanElement>(null)
  const animation = useRef<Animation>(undefined)
  const flashAt = level?.flashAt ?? 0
  const pulse = level?.pulse ?? 0
  useLayoutEffect(() => {
    if (calm || !flash.current || performance.now() - flashAt > 100) return
    animation.current?.cancel()
    animation.current = flash.current.animate({ opacity: [0, 0.08 + 0.27 * pulse, 0], offset: [0, 0.2, 1] }, 800)
  }, [flashAt, pulse])
  if (!level) return <div className="min-h-0 flex-1 contain-strict" />
  const swept = selected?.side === side && (side === "asks" ? level.px <= selected.px : level.px >= selected.px)
  const fromRight = halved && side === "bids"
  const amount = (coin: number, dollars: number) => (usd ? formatNumber(dollars, 0) : formatNumber(coin, szDecimals))
  const price = (
    <span className={cn(cell, side === "asks" ? "text-ask" : "text-bid", fromRight && "text-right")}>
      {formatNumber(level.px, decimals)}
    </span>
  )
  const total = <span className={cn(cell, !fromRight && "text-right")}>{amount(level.total, level.totalUsd)}</span>
  return (
    <button
      type="button"
      aria-pressed={level.px === selected?.px && selected.side === side}
      data-px={level.px}
      data-side={side}
      onClick={() => selectLevel({ side, px: level.px })}
      onPointerEnter={(event) => {
        if (event.pointerType !== "mouse") return
        const target = event.currentTarget
        const row = boxOf(target.getBoundingClientRect())
        const column = boxOf((target.parentElement ?? target).getBoundingClientRect())
        const widget = boxOf((target.closest("[data-widget]") ?? target).getBoundingClientRect())
        const upward = side === "asks" && !halved
        setHover({
          side,
          px: level.px,
          row,
          widget,
          swept: upward ? { ...column, top: row.top } : { ...column, bottom: row.bottom },
          edge: upward ? "top" : "bottom",
        })
      }}
      className={cn(
        halved ? split : row,
        "min-h-0 flex-1 cursor-pointer text-left outline-none focus-visible:ring-1 focus-visible:ring-ring focus-visible:ring-inset",
      )}
      style={{ "--total": level.total, "--size": level.sz } as CSSProperties}
    >
      <span
        aria-hidden
        className={cn(
          bar,
          fromRight ? "origin-right" : "origin-left",
          "scale-x-[calc(var(--total)/var(--max))]",
          side === "asks" ? "bg-ask-bar" : "bg-bid-bar",
        )}
      />
      <span
        aria-hidden
        className={cn(
          bar,
          fromRight ? "origin-right" : "origin-left",
          "scale-x-[calc(var(--size)/var(--max))]",
          side === "asks" ? "bg-ask/20" : "bg-bid/20",
        )}
      />
      {swept && (
        <span
          aria-hidden
          className={cn(bar, level.px === selected?.px ? "bg-foreground/15" : "bg-foreground/[0.07]")}
        />
      )}
      <span aria-hidden ref={flash} className={cn(bar, "opacity-0", side === "asks" ? "bg-ask" : "bg-bid")} />
      {halved ? (
        fromRight ? (
          <>
            {total}
            {price}
          </>
        ) : (
          <>
            {price}
            {total}
          </>
        )
      ) : (
        <>
          {price}
          <span className={cn(cell, "text-right")}>{amount(level.sz, level.px * level.sz)}</span>
          {total}
        </>
      )}
    </button>
  )
}

function Spread() {
  const touch = useBook((view) => (view.bid && view.ask ? { bid: view.bid, ask: view.ask } : undefined))
  const spread = touch ? touch.ask - touch.bid : undefined
  return (
    <div
      data-testid="spread"
      className="flex h-6 shrink-0 items-center justify-center gap-8 bg-muted text-xs text-muted-foreground"
    >
      <span>Spread</span>
      <span className="text-foreground">{spread === undefined ? "" : formatNumber(spread, 0, 6)}</span>
      <span>
        {touch && spread !== undefined ? `${formatNumber((200 * spread) / (touch.bid + touch.ask), 3)}%` : ""}
      </span>
    </div>
  )
}

const CARD = { width: 216, height: 104, gap: 8 }

export function HoverCard() {
  const hover = useAtomValue(hoverAtom)
  const coin = useAtomValue(coinAtom)
  const szDecimals = useSzDecimals()
  const sweep = useBook((view) => (hover ? sweepOf(view, hover.side, hover.px) : undefined))
  if (!hover || !sweep) return null
  const { row, widget, swept } = hover
  const room = widget.left - CARD.width - CARD.gap
  const left =
    room >= CARD.gap
      ? room
      : widget.right + CARD.gap + CARD.width <= innerWidth
        ? widget.right + CARD.gap
        : widget.left + CARD.gap
  const top = Math.min(
    Math.max(CARD.gap, (row.top + row.bottom) / 2 - CARD.height / 2),
    innerHeight - CARD.height - CARD.gap,
  )
  return createPortal(
    <>
      <div
        aria-hidden
        className={cn(
          "pointer-events-none fixed z-10 border-dashed border-muted-foreground bg-white/[0.04]",
          hover.edge === "top" ? "border-t" : "border-b",
        )}
        style={{
          left: swept.left,
          top: swept.top,
          width: swept.right - swept.left,
          height: swept.bottom - swept.top,
        }}
      />
      <div
        role="tooltip"
        data-testid="hover-card"
        className="pointer-events-none fixed z-50 grid grid-cols-[1fr_auto] content-center gap-x-4 gap-y-1.5 rounded-md border border-accent bg-popover px-3 text-xs tabular-nums shadow-lg"
        style={{ left, top, width: CARD.width, height: CARD.height }}
      >
        <span className="text-muted-foreground">Distance from Mid</span>
        <span className="text-right">{formatNumber(sweep.fromMid, 4)}%</span>
        <span className="text-muted-foreground">Average Price</span>
        <span className="text-right">{formatNumber(sweep.avg, priceDecimals(sweep.avg, szDecimals))}</span>
        <span className="text-muted-foreground">Total ({coin})</span>
        <span className="text-right">{formatNumber(sweep.total, szDecimals)}</span>
        <span className="text-muted-foreground">Total (USD)</span>
        <span className="text-right">{formatNumber(sweep.totalUsd, 0)}</span>
      </div>
    </>,
    document.body,
  )
}
