"use client"

import { cn } from "cn"
import { useAtom, useAtomValue } from "jotai"
import {
  type ComponentProps,
  type CSSProperties,
  memo,
  Profiler,
  type ProfilerOnRenderCallback,
  type ReactNode,
  useLayoutEffect,
  useRef,
} from "react"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import { coinAtom, precisionAtom, statusAtom, unitAtom } from "@/lib/atoms"
import type { Row } from "@/lib/book"
import { formatNumber, formatTime } from "@/lib/format"
import { COINS, decimalsOf, MARKETS, magnitudeOf, PRECISIONS, precisionOptions, tickSize } from "@/lib/hyperliquid"
import { useBook, useMagnitude, useTrades } from "@/lib/queries"
import type { Print } from "@/lib/trades"

const ROWS = 12

const SLOTS = Array.from({ length: ROWS }, (_, slot) => slot)

const FLASH: PropertyIndexedKeyframes = { opacity: [0, 0.3, 0], offset: [0, 0.2, 1] }

const calm = typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches

const stacked = "[grid-area:1/1] data-hidden:invisible"

const panel = ({ hidden, ...props }: ComponentProps<"div">) => <div {...props} />

const onRender: ProfilerOnRenderCallback = (id, _phase, duration, _base, start) => {
  if (process.env.NEXT_PUBLIC_PROFILE) performance.measure(id, { start, duration })
}

const depthOf = (rows: Row[]) => rows[Math.min(rows.length, ROWS) - 1]?.total ?? 0

const niceCeil = (value: number) => {
  if (value <= 0) return 1
  const step = 10 ** Math.floor(Math.log10(value))
  return [1, 2, 5, 10].map((m) => m * step).find((ceiling) => ceiling >= value) ?? value
}

export function OrderBook() {
  return (
    <section
      aria-label="Order book"
      className="w-full max-w-[380px] overflow-hidden rounded-xl border bg-card text-sm tabular-nums"
    >
      <Header />
      <Tabs defaultValue="orders" className="gap-0">
        <TabsList variant="line" className="h-10 w-full justify-start gap-5 rounded-none border-b px-3">
          <TabsTrigger value="orders" className="flex-none px-0 after:bg-brand">
            Orders
          </TabsTrigger>
          <TabsTrigger value="trades" className="flex-none px-0 after:bg-brand">
            Trades
          </TabsTrigger>
        </TabsList>
        <div className="grid">
          <TabsContent value="orders" keepMounted render={panel} className={stacked}>
            <Profiler id="book" onRender={onRender}>
              <Columns last="Total" />
              <Depth>
                <Side side="asks" />
                <Spread />
                <Side side="bids" />
              </Depth>
              <Imbalance />
              <Footer />
            </Profiler>
          </TabsContent>
          <TabsContent
            value="trades"
            keepMounted
            render={panel}
            className={cn(stacked, "overflow-hidden contain-size")}
          >
            <Profiler id="tape" onRender={onRender}>
              <Columns last="Time" />
              <Tape />
            </Profiler>
          </TabsContent>
        </div>
      </Tabs>
    </section>
  )
}

function Header() {
  const [coin, setCoin] = useAtom(coinAtom)
  const status = useAtomValue(statusAtom)
  const last = useTrades((tape) => tape[0])
  return (
    <header className="flex items-center justify-between border-b px-3 py-2.5">
      <Select
        items={COINS.map((value) => ({ value, label: `${value}-USD` }))}
        value={coin}
        onValueChange={(value) => value && setCoin(value)}
      >
        <SelectTrigger
          aria-label="Market"
          className="border-none bg-transparent px-0 text-base font-medium dark:bg-transparent"
        >
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {COINS.map((value) => (
            <SelectItem key={value} value={value}>
              {value}-USD
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <div className="flex items-center gap-2">
        <span data-testid="last" className={cn("font-medium", last?.buy ? "text-bid" : "text-ask")}>
          {last ? formatNumber(last.px, 0, 6) : ""}
        </span>
        <span
          data-testid="status"
          data-status={status}
          title={status === "live" ? "Live" : "Connecting"}
          className={cn("size-2 rounded-full", status === "live" ? "bg-bid" : "animate-pulse bg-amber-400")}
        />
      </div>
    </header>
  )
}

function Columns({ last }: { last: "Total" | "Time" }) {
  const coin = useAtomValue(coinAtom)
  const unit = useAtomValue(unitAtom) === "usd" ? "USD" : coin
  return (
    <div className="grid grid-cols-3 px-3 py-2 text-xs text-muted-foreground">
      <span>Price</span>
      <span className="text-right">Size ({unit})</span>
      <span className="text-right">{last === "Total" ? `Total (${unit})` : "Time"}</span>
    </div>
  )
}

function Depth({ children }: { children: ReactNode }) {
  const max = useBook((view) => niceCeil(Math.max(depthOf(view.bids), depthOf(view.asks))))
  return <div style={{ "--max": max ?? 1 } as CSSProperties}>{children}</div>
}

function usePriceDecimals() {
  const { szDecimals } = MARKETS[useAtomValue(coinAtom)]
  const precision = useAtomValue(precisionAtom)
  const magnitude = useMagnitude()
  return magnitude === undefined ? 0 : decimalsOf(tickSize(precision, magnitude, szDecimals))
}

function Side({ side }: { side: "asks" | "bids" }) {
  const decimals = usePriceDecimals()
  return (
    <div data-testid={side} className={cn("flex gap-px", side === "asks" ? "flex-col-reverse" : "flex-col")}>
      {SLOTS.map((slot) => (
        <Profiler key={slot} id={`${side}-${slot}`} onRender={onRender}>
          <BookRow side={side} index={slot} decimals={decimals} />
        </Profiler>
      ))}
    </div>
  )
}

function BookRow({ side, index, decimals }: { side: "asks" | "bids"; index: number; decimals: number }) {
  const row = useBook((view) => view[side][index])
  const { szDecimals } = MARKETS[useAtomValue(coinAtom)]
  const usd = useAtomValue(unitAtom) === "usd"
  const flash = useRef<HTMLDivElement>(null)
  const animation = useRef<Animation>(undefined)
  const flashAt = row?.flashAt ?? 0
  useLayoutEffect(() => {
    if (calm || !flash.current || performance.now() - flashAt > 100) return
    animation.current?.cancel()
    animation.current = flash.current.animate(FLASH, 800)
  }, [flashAt])
  if (!row) return <div className="h-7 contain-strict" />
  return (
    <div
      className="relative grid h-7 grid-cols-3 items-center px-3 contain-content"
      style={{ "--total": row.total } as CSSProperties}
    >
      <div
        className={cn(
          "absolute inset-0 origin-left scale-x-[calc(var(--total)/var(--max))]",
          side === "asks" ? "bg-ask-bar" : "bg-bid-bar",
        )}
      />
      <div ref={flash} className={cn("absolute inset-0 opacity-0", side === "asks" ? "bg-ask" : "bg-bid")} />
      <span className={cn("relative", side === "asks" ? "text-ask" : "text-bid")}>
        {formatNumber(row.px, decimals)}
      </span>
      <span className="relative text-right">
        {usd ? formatNumber(row.px * row.sz, 0) : formatNumber(row.sz, szDecimals)}
      </span>
      <span className="relative text-right">
        {usd ? formatNumber(row.totalUsd, 0) : formatNumber(row.total, szDecimals)}
      </span>
    </div>
  )
}

function Spread() {
  const touch = useBook((view) => (view.bid && view.ask ? { bid: view.bid, ask: view.ask } : undefined))
  const spread = touch ? touch.ask - touch.bid : undefined
  return (
    <div
      data-testid="spread"
      className="my-px grid h-8 grid-cols-3 items-center bg-muted px-3 text-xs text-muted-foreground"
    >
      <span>Spread</span>
      <span className="text-right">{spread === undefined ? "" : formatNumber(spread, 0, 6)}</span>
      <span className="text-right">
        {touch && spread !== undefined ? `${formatNumber((200 * spread) / (touch.bid + touch.ask), 3)}%` : ""}
      </span>
    </div>
  )
}

function Imbalance() {
  const share = useBook((view) => {
    const bids = depthOf(view.bids)
    const asks = depthOf(view.asks)
    return bids + asks ? Math.round((100 * bids) / (bids + asks)) : undefined
  })
  if (share === undefined) return <div className="h-8 border-t" />
  return (
    <div data-testid="imbalance" className="flex h-8 items-center gap-2 border-t px-3 text-xs">
      <span className="w-10 text-bid">B {share}%</span>
      <div className="h-1 flex-1 overflow-hidden rounded-full bg-ask/60">
        <div className="h-full origin-left bg-bid" style={{ scale: `${share / 100} 1` }} />
      </div>
      <span className="w-10 text-right text-ask">{100 - share}% S</span>
    </div>
  )
}

function Footer() {
  const coin = useAtomValue(coinAtom)
  const [precision, setPrecision] = useAtom(precisionAtom)
  const [unit, setUnit] = useAtom(unitAtom)
  const magnitude = useMagnitude()
  const options = precisionOptions(magnitude, MARKETS[coin].szDecimals).map((option) => ({
    value: option.precision.id,
    label: option.tick === undefined ? option.precision.id : formatNumber(option.tick, decimalsOf(option.tick)),
    detail: option.precision.nSigFigs
      ? `${option.precision.nSigFigs} sig figs${option.precision.mantissa ? ` ×${option.precision.mantissa}` : ""}`
      : "full",
  }))
  return (
    <footer className="flex items-center justify-between border-t px-3 py-2">
      <Select
        items={options}
        value={precision.id}
        onValueChange={(id) => setPrecision(PRECISIONS.find((p) => p.id === id) ?? precision)}
      >
        <SelectTrigger aria-label="Precision" size="sm" className="min-w-20">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {options.map((option) => (
            <SelectItem key={option.value} value={option.value}>
              <span>{option.label}</span>
              <span className="ml-auto pl-4 text-xs text-muted-foreground">{option.detail}</span>
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <ToggleGroup
        aria-label="Units"
        size="sm"
        value={[unit]}
        onValueChange={([next]) => next && setUnit(next === "usd" ? "usd" : "coin")}
      >
        <ToggleGroupItem value="usd">USD</ToggleGroupItem>
        <ToggleGroupItem value="coin">{coin}</ToggleGroupItem>
      </ToggleGroup>
    </footer>
  )
}

function Tape() {
  const tape = useTrades((prints) => prints)
  const largest = useTrades((prints) => Math.max(0, ...prints.map((print) => print.sz)))
  return (
    <div data-testid="trades" className="flex flex-col gap-px" style={{ "--max": largest || 1 } as CSSProperties}>
      {tape?.map((print) => (
        <TapeRow key={print.id} print={print} />
      ))}
    </div>
  )
}

const TapeRow = memo(function TapeRow({ print }: { print: Print }) {
  const { szDecimals } = MARKETS[useAtomValue(coinAtom)]
  const usd = useAtomValue(unitAtom) === "usd"
  const decimals = decimalsOf(tickSize(PRECISIONS[0], magnitudeOf(print.px), szDecimals))
  return (
    <div
      data-side={print.buy ? "buy" : "sell"}
      className="relative grid h-7 grid-cols-3 items-center px-3 contain-content"
      style={{ "--size": print.sz } as CSSProperties}
    >
      <div
        className={cn(
          "absolute inset-0 origin-left scale-x-[calc(var(--size)/var(--max))]",
          print.buy ? "bg-bid-bar" : "bg-ask-bar",
        )}
      />
      {print.fresh && (
        <div
          className={cn(
            "absolute inset-0 animate-print opacity-0 motion-reduce:hidden",
            print.buy ? "bg-bid" : "bg-ask",
          )}
        />
      )}
      <span className={cn("relative", print.buy ? "text-bid" : "text-ask")}>{formatNumber(print.px, decimals)}</span>
      <span className="relative text-right">
        {usd ? formatNumber(print.px * print.sz, 0) : formatNumber(print.sz, szDecimals)}
      </span>
      <span className="relative text-right text-muted-foreground">{formatTime(print.time)}</span>
    </div>
  )
})
