"use client"

import { cn } from "cn"
import { useAtom, useAtomValue } from "jotai"
import { Menu } from "lucide-react"
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

const grid = "grid grid-cols-[144px_1fr_auto] items-center pr-4 pl-5 lg:grid-cols-[20%_40%_40%] lg:px-2.5"

const height = "h-[36.5px] lg:h-[23px]"

const row = cn(grid, height, "relative text-base contain-content lg:text-xs")

const size = "relative lg:text-right"

const bar = "absolute inset-x-0 inset-y-1 origin-left lg:inset-y-0"

const stacked = "flex flex-col [grid-area:1/1] data-hidden:invisible"

const tab =
  "h-full flex-none justify-self-center rounded-none px-[9px] text-[17px] font-normal after:bottom-0 after:h-[3px] after:bg-brand lg:justify-self-stretch lg:px-0 lg:text-xs lg:after:h-0.5"

const panel = ({ hidden, ...props }: ComponentProps<"div">) => <div {...props} />

const plain = "h-auto border-none bg-transparent p-0 dark:bg-transparent dark:hover:bg-transparent"

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
  const status = useAtomValue(statusAtom)
  return (
    <>
      <Header />
      <h2 className="pt-3 pb-[13px] text-[22px] leading-7 text-[#ababab] lg:hidden">Orders</h2>
      <section
        aria-label="Order book"
        data-testid="status"
        data-status={status}
        className="overflow-hidden rounded-[10px] border bg-card tabular-nums transition-opacity data-[status=connecting]:opacity-60 lg:mt-1 lg:rounded-md"
      >
        <Tabs defaultValue="orders" className="gap-0">
          <TabsList
            variant="line"
            className="grid w-full grid-cols-2 rounded-none border-b border-muted p-0 pr-5 group-data-horizontal/tabs:h-[52px] lg:pr-0 lg:group-data-horizontal/tabs:h-[42px]"
          >
            <TabsTrigger value="orders" className={tab}>
              Orders
            </TabsTrigger>
            <TabsTrigger value="trades" className={tab}>
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
    </>
  )
}

function Header() {
  const [coin, setCoin] = useAtom(coinAtom)
  const market = MARKETS[coin]
  return (
    <header className="flex h-20 items-center gap-3.5 rounded-[10px] border bg-card pr-[26px] pl-[22px] lg:h-14 lg:gap-2.5 lg:rounded-md lg:px-3">
      <span
        aria-hidden
        className="grid size-9 rotate-[14deg] place-items-center rounded-full text-[22px] font-semibold text-white lg:size-7 lg:text-base"
        style={{ backgroundColor: market.color }}
      >
        {market.glyph}
      </span>
      <div className="flex-1 leading-none">
        <div className="text-[22px] lg:text-base">{coin}-USD</div>
        <div className="mt-2 text-[15px] text-muted-foreground lg:mt-1 lg:text-xs">Perpetuals</div>
      </div>
      <span className="grid h-[35px] place-items-center rounded-lg bg-muted px-[11px] text-base lg:h-7 lg:rounded-md lg:px-2 lg:text-xs">
        {market.maxLeverage}×
      </span>
      <Select
        items={COINS.map((value) => ({ value, label: `${value}-USD` }))}
        value={coin}
        onValueChange={(value) => value && setCoin(value)}
      >
        <SelectTrigger aria-label="Market" className={cn(plain, "ml-[5px] text-muted-foreground *:last:hidden")}>
          <Menu className="size-5 lg:size-4" />
        </SelectTrigger>
        <SelectContent align="end" alignItemWithTrigger={false}>
          {COINS.map((value) => (
            <SelectItem key={value} value={value}>
              {value}-USD
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </header>
  )
}

function Columns({ last }: { last: "Total" | "Time" }) {
  const coin = useAtomValue(coinAtom)
  const unit = useAtomValue(unitAtom) === "usd" ? "USD" : coin
  return (
    <div className={cn(grid, "h-14 text-[13px] text-muted-foreground lg:h-[23px] lg:text-xs")}>
      <span>Price</span>
      <span className="lg:text-right">Size ({unit})</span>
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
    <div data-testid={side} className={cn("flex", side === "asks" ? "flex-col-reverse" : "flex-col")}>
      {SLOTS.map((slot) => (
        <Profiler key={slot} id={`${side}-${slot}`} onRender={onRender}>
          <BookRow side={side} index={slot} decimals={decimals} />
        </Profiler>
      ))}
    </div>
  )
}

function BookRow({ side, index, decimals }: { side: "asks" | "bids"; index: number; decimals: number }) {
  const level = useBook((view) => view[side][index])
  const { szDecimals } = MARKETS[useAtomValue(coinAtom)]
  const usd = useAtomValue(unitAtom) === "usd"
  const flash = useRef<HTMLDivElement>(null)
  const animation = useRef<Animation>(undefined)
  const flashAt = level?.flashAt ?? 0
  useLayoutEffect(() => {
    if (calm || !flash.current || performance.now() - flashAt > 100) return
    animation.current?.cancel()
    animation.current = flash.current.animate(FLASH, 800)
  }, [flashAt])
  if (!level) return <div className={cn(height, "contain-strict")} />
  return (
    <div className={row} style={{ "--total": level.total } as CSSProperties}>
      <div
        className={cn(bar, "scale-x-[calc(var(--total)/var(--max))]", side === "asks" ? "bg-ask-bar" : "bg-bid-bar")}
      />
      <div ref={flash} className={cn(bar, "opacity-0", side === "asks" ? "bg-ask" : "bg-bid")} />
      <span className="relative">{formatNumber(level.px, decimals)}</span>
      <span className={size}>{usd ? formatNumber(level.px * level.sz, 0) : formatNumber(level.sz, szDecimals)}</span>
      <span className="relative text-right">
        {usd ? formatNumber(level.totalUsd, 0) : formatNumber(level.total, szDecimals)}
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
      className={cn(
        grid,
        "my-[3px] h-[35px] bg-muted text-[15px] text-muted-foreground lg:my-0 lg:flex lg:h-[23px] lg:justify-center lg:gap-8 lg:text-xs",
      )}
    >
      <span>Spread</span>
      <span className="text-foreground">{spread === undefined ? "" : formatNumber(spread, 0, 6)}</span>
      <span className="text-right">
        {touch && spread !== undefined ? `${formatNumber((200 * spread) / (touch.bid + touch.ask), 3)}%` : ""}
      </span>
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
  const unitClass = cn(
    plain,
    "min-w-0 text-base font-normal text-muted-foreground lg:text-xs aria-pressed:bg-transparent aria-pressed:text-foreground hover:bg-transparent",
  )
  return (
    <footer className="flex h-14 items-center justify-between px-5 lg:order-first lg:h-[31px] lg:px-2.5">
      <Select
        items={options}
        value={precision.id}
        onValueChange={(id) => setPrecision(PRECISIONS.find((p) => p.id === id) ?? precision)}
      >
        <SelectTrigger
          aria-label="Precision"
          className={cn(
            plain,
            "gap-2 text-base text-muted-foreground lg:text-xs [&>svg]:rotate-180 lg:[&>svg]:rotate-0",
          )}
        >
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
        spacing={4}
        value={[unit]}
        onValueChange={([next]) => next && setUnit(next === "usd" ? "usd" : "coin")}
      >
        <ToggleGroupItem value="usd" className={unitClass}>
          USD
        </ToggleGroupItem>
        <ToggleGroupItem value="coin" className={unitClass}>
          {coin}
        </ToggleGroupItem>
      </ToggleGroup>
    </footer>
  )
}

function Tape() {
  const tape = useTrades((prints) => prints)
  const largest = useTrades((prints) => Math.max(0, ...prints.map((print) => print.sz)))
  return (
    <div data-testid="trades" className="flex flex-col" style={{ "--max": largest || 1 } as CSSProperties}>
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
    <div data-side={print.buy ? "buy" : "sell"} className={row} style={{ "--size": print.sz } as CSSProperties}>
      <div className={cn(bar, "scale-x-[calc(var(--size)/var(--max))]", print.buy ? "bg-bid-bar" : "bg-ask-bar")} />
      {print.fresh && (
        <div className={cn(bar, "animate-print opacity-0 motion-reduce:hidden", print.buy ? "bg-bid" : "bg-ask")} />
      )}
      <span className={cn("relative", print.buy ? "text-bid" : "text-ask")}>{formatNumber(print.px, decimals)}</span>
      <span className={size}>{usd ? formatNumber(print.px * print.sz, 0) : formatNumber(print.sz, szDecimals)}</span>
      <span className="relative text-right text-muted-foreground">{formatTime(print.time)}</span>
    </div>
  )
})
