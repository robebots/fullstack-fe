"use client"

import { notifyManager, QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { cn } from "cn"
import { createStore, Provider, useAtom, useAtomValue, useSetAtom } from "jotai"
import { Menu, X } from "lucide-react"
import { type ComponentProps, type RefObject, useEffect, useRef, useState } from "react"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import {
  coinAtom,
  listenerAtom,
  type PriceSelection,
  precisionAtom,
  selectedAtom,
  statusAtom,
  unitAtom,
} from "@/lib/atoms"
import { formatNumber } from "@/lib/format"
import {
  COINS,
  type Coin,
  decimalsOf,
  MARKETS,
  magnitudeOf,
  PRECISIONS,
  precisionOptions,
  tickSize,
} from "@/lib/hyperliquid"
import { useBook, useMagnitude, useTrades } from "@/lib/queries"
import { Columns, Depth } from "./depth"
import { plain } from "./styles"
import { Tape } from "./tape"

notifyManager.setScheduler(queueMicrotask)

const client = new QueryClient({ defaultOptions: { queries: { staleTime: Number.POSITIVE_INFINITY } } })

export type { PriceSelection }

const stacked = "flex min-h-0 flex-col [grid-area:1/1] data-hidden:invisible"

const tab =
  "h-full flex-none justify-self-center rounded-none px-[9px] text-[17px] font-normal after:bottom-0 after:h-[3px] after:bg-brand pointer-fine:justify-self-stretch pointer-fine:px-0 pointer-fine:text-xs pointer-fine:after:h-0.5"

const panel = ({ hidden, ...props }: ComponentProps<"div">) => <div {...props} />

const fullDecimals = (price: number, szDecimals: number) =>
  decimalsOf(tickSize(PRECISIONS[0], magnitudeOf(price), szDecimals))

function useVisible(ref: RefObject<HTMLElement | null>) {
  const [visible, setVisible] = useState(true)
  useEffect(() => {
    if (!ref.current) return
    const observer = new IntersectionObserver(([entry]) => setVisible(entry.isIntersecting))
    observer.observe(ref.current)
    return () => observer.disconnect()
  }, [ref])
  return visible
}

export function OrderBook({
  market = "BTC",
  onPriceSelect,
  className,
}: {
  market?: Coin
  onPriceSelect?: (selection: PriceSelection) => void
  className?: string
}) {
  const [store] = useState(() => {
    const store = createStore()
    store.set(coinAtom, market)
    return store
  })
  useEffect(() => store.set(listenerAtom, { onPriceSelect }), [store, onPriceSelect])
  const root = useRef<HTMLDivElement>(null)
  const visible = useVisible(root)
  return (
    <QueryClientProvider client={client}>
      <Provider store={store}>
        <div
          ref={root}
          data-widget
          data-paused={!visible}
          className={cn("flex h-full flex-col [--row:36.5px] pointer-fine:[--row:23px]", className)}
        >
          {visible && <Widget />}
        </div>
      </Provider>
    </QueryClientProvider>
  )
}

function Widget() {
  const status = useAtomValue(statusAtom)
  return (
    <>
      <Header />
      <h2 className="shrink-0 pt-3 pb-[13px] text-[22px] leading-7 text-[#ababab] pointer-fine:hidden">Orders</h2>
      <section
        aria-label="Order book"
        data-testid="status"
        data-status={status}
        className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-[10px] border bg-card tabular-nums transition-opacity data-[status=connecting]:opacity-60 pointer-fine:mt-1 pointer-fine:rounded-md"
      >
        <Tabs defaultValue="orders" className="min-h-0 flex-1 gap-0">
          <TabsList
            variant="line"
            className="grid w-full shrink-0 grid-cols-2 rounded-none border-b border-muted p-0 pr-5 group-data-horizontal/tabs:h-[52px] pointer-fine:pr-0 pointer-fine:group-data-horizontal/tabs:h-[42px]"
          >
            <TabsTrigger value="orders" className={tab}>
              Orders
            </TabsTrigger>
            <TabsTrigger value="trades" className={tab}>
              Trades
            </TabsTrigger>
          </TabsList>
          <div className="grid min-h-0 flex-1 grid-rows-[minmax(0,1fr)]">
            <TabsContent value="orders" keepMounted render={panel} className={stacked}>
              <Columns last="Total" />
              <Depth />
              <Footer />
            </TabsContent>
            <TabsContent value="trades" keepMounted render={panel} className={cn(stacked, "overflow-hidden")}>
              <Tape />
            </TabsContent>
          </div>
        </Tabs>
      </section>
    </>
  )
}

function Header() {
  const [coin, setCoin] = useAtom(coinAtom)
  const setSelected = useSetAtom(selectedAtom)
  const [open, setOpen] = useState(false)
  const market = MARKETS[coin]
  const last = useTrades((tape) => tape[0])
  return (
    <header className="flex h-20 shrink-0 items-center gap-3 rounded-[10px] border bg-card pr-[26px] pl-[22px] pointer-fine:h-14 pointer-fine:gap-2.5 pointer-fine:rounded-md pointer-fine:px-3">
      <Select
        open={open}
        onOpenChange={setOpen}
        items={COINS.map((value) => ({ value, label: `${value}-USD` }))}
        value={coin}
        onValueChange={(value) => {
          if (!value) return
          setCoin(value)
          setSelected(null)
        }}
      >
        <SelectTrigger
          aria-label="Market"
          className={cn(
            plain,
            "min-w-0 justify-start gap-3.5 text-foreground pointer-fine:gap-2.5 [&>svg]:self-start pointer-coarse:[&>svg]:hidden",
          )}
        >
          <span
            aria-hidden
            className="grid size-9 shrink-0 rotate-[14deg] place-items-center rounded-full text-[22px] font-semibold text-white pointer-fine:size-7 pointer-fine:text-base"
            style={{ backgroundColor: market.color }}
          >
            {market.glyph}
          </span>
          <span className="text-left leading-none">
            <span className="block text-[22px] pointer-fine:text-base">{coin}-USD</span>
            <span className="mt-2 block text-[15px] text-muted-foreground pointer-fine:mt-1 pointer-fine:text-xs">
              Perpetuals
            </span>
          </span>
        </SelectTrigger>
        <SelectContent align="start" alignItemWithTrigger={false}>
          {COINS.map((value) => (
            <SelectItem key={value} value={value}>
              {value}-USD
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <span
        data-testid="last"
        className={cn("ml-auto text-[17px] pointer-fine:text-sm", last?.buy ? "text-bid" : "text-ask")}
      >
        {last ? formatNumber(last.px, fullDecimals(last.px, market.szDecimals)) : ""}
      </span>
      <span className="grid h-[35px] shrink-0 place-items-center rounded-lg bg-muted px-[11px] text-base pointer-fine:h-7 pointer-fine:rounded-md pointer-fine:px-2 pointer-fine:text-xs">
        {market.maxLeverage}×
      </span>
      <button
        type="button"
        aria-label="Markets"
        onClick={() => setOpen(true)}
        className="ml-1 text-muted-foreground hover:text-foreground"
      >
        <Menu className="size-5 pointer-fine:size-4" />
      </button>
    </header>
  )
}

function useSweep() {
  const selected = useAtomValue(selectedAtom)
  return useBook((view) => {
    if (!selected) return undefined
    const level = view[selected.side].find((row) => row.px === selected.px)
    if (!level || !view.bid || !view.ask) return undefined
    const mid = (view.bid + view.ask) / 2
    const avg = level.totalUsd / level.total
    return { side: selected.side, total: level.total, avg, bps: (Math.abs(avg - mid) / mid) * 10_000 }
  })
}

function Footer() {
  const sweep = useSweep()
  return (
    <footer className="flex h-14 shrink-0 items-center justify-between gap-3 px-5 pointer-fine:order-first pointer-fine:h-[31px] pointer-fine:px-2.5">
      {sweep ? <Sweep {...sweep} /> : <Controls />}
    </footer>
  )
}

function Sweep({ side, total, avg, bps }: { side: "asks" | "bids"; total: number; avg: number; bps: number }) {
  const coin = useAtomValue(coinAtom)
  const setSelected = useSetAtom(selectedAtom)
  const { szDecimals } = MARKETS[coin]
  return (
    <>
      <span data-testid="sweep" className="truncate text-[15px] pointer-fine:text-xs">
        <span className={side === "asks" ? "text-bid" : "text-ask"}>{side === "asks" ? "Buy" : "Sell"}</span>{" "}
        {formatNumber(total, szDecimals)} {coin}
        <span className="text-muted-foreground"> · avg </span>
        {formatNumber(avg, fullDecimals(avg, szDecimals) + 1)}
        <span className="text-muted-foreground"> · {formatNumber(bps, 1)} bps</span>
      </span>
      <button
        type="button"
        aria-label="Clear selection"
        onClick={() => setSelected(null)}
        className="text-muted-foreground hover:text-foreground"
      >
        <X className="size-4" />
      </button>
    </>
  )
}

function Controls() {
  const coin = useAtomValue(coinAtom)
  const [precision, setPrecision] = useAtom(precisionAtom)
  const [unit, setUnit] = useAtom(unitAtom)
  const setSelected = useSetAtom(selectedAtom)
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
    "min-w-0 text-base font-normal text-muted-foreground pointer-fine:text-xs aria-pressed:bg-transparent aria-pressed:text-foreground hover:bg-transparent",
  )
  return (
    <>
      <Select
        items={options}
        value={precision.id}
        onValueChange={(id) => {
          setPrecision(PRECISIONS.find((p) => p.id === id) ?? precision)
          setSelected(null)
        }}
      >
        <SelectTrigger
          aria-label="Precision"
          className={cn(
            plain,
            "gap-2 text-base text-muted-foreground pointer-fine:text-xs [&>svg]:rotate-180 pointer-fine:[&>svg]:rotate-0",
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
    </>
  )
}
