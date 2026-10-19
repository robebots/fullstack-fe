"use client"

import { QueryClientProvider } from "@tanstack/react-query"
import { cn } from "cn"
import { createStore, Provider, useAtom, useAtomValue, useSetAtom } from "jotai"
import { EllipsisVertical, X } from "lucide-react"
import { type ComponentProps, type ReactNode, type RefObject, useEffect, useRef, useState } from "react"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import {
  coinAtom,
  hoverAtom,
  type Layout,
  layoutAtom,
  listenerAtom,
  type Mode,
  modeAtom,
  type PriceSelection,
  precisionAtom,
  selectedAtom,
  setModeAtom,
  type Tab,
  tabAtom,
  unitAtom,
} from "@/lib/atoms"
import { sweepOf } from "@/lib/book"
import { client } from "@/lib/client"
import { formatNumber } from "@/lib/format"
import { type Coin, decimalsOf, PRECISIONS, precisionOptions, priceDecimals } from "@/lib/hyperliquid"
import { useListing, useMarketName } from "@/lib/markets"
import { useBook, useMagnitude, useSzDecimals } from "@/lib/queries"
import { useFeedStatus } from "@/lib/status"
import { Columns, Depth, HoverCard, Placeholder } from "./depth"
import { bone, plain } from "./styles"
import { Tape, TapeSkeleton } from "./tape"

export type { Mode, PriceSelection }

const MODES: { value: Mode; label: string }[] = [
  { value: "tab", label: "Tab" },
  { value: "stacked", label: "Stacked" },
  { value: "large", label: "Large" },
]

const LAYOUTS: { value: Layout; label: string }[] = [
  { value: "both", label: "Bids and asks" },
  { value: "split", label: "Side by side" },
  { value: "bids", label: "Bids only" },
  { value: "asks", label: "Asks only" },
]

const SLOTS = Array.from({ length: 20 }, (_, slot) => slot)

const stacked = "flex min-h-0 flex-col [grid-area:1/1] data-hidden:invisible"

const panel = ({ hidden, ...props }: ComponentProps<"div">) => <div {...props} />

const heading = "flex h-10 shrink-0 items-center border-b border-line px-2.5 text-xs text-foreground"

function useVisible(ref: RefObject<HTMLElement | null>) {
  const [onScreen, setOnScreen] = useState(true)
  const [shown, setShown] = useState(true)
  useEffect(() => {
    if (!ref.current) return
    const observer = new IntersectionObserver(([entry]) => setOnScreen(entry.isIntersecting))
    observer.observe(ref.current)
    const onVisibility = () => setShown(!document.hidden)
    document.addEventListener("visibilitychange", onVisibility)
    return () => {
      observer.disconnect()
      document.removeEventListener("visibilitychange", onVisibility)
    }
  }, [ref])
  return onScreen && shown
}

export function OrderBook({
  market,
  defaultMode = "tab",
  defaultLayout = "both",
  view,
  paused = false,
  onPriceSelect,
  onModeChange,
  className,
}: {
  market: Coin
  defaultMode?: Mode
  defaultLayout?: Layout
  view?: Tab
  paused?: boolean
  onPriceSelect?: (selection: PriceSelection) => void
  onModeChange?: (mode: Mode) => void
  className?: string
}) {
  const name = useMarketName(market)
  const [store] = useState(() => {
    const store = createStore()
    store.set(coinAtom, name)
    store.set(modeAtom, defaultMode)
    store.set(layoutAtom, defaultLayout)
    if (view) store.set(tabAtom, view)
    return store
  })
  useEffect(() => store.set(listenerAtom, { onPriceSelect, onModeChange }), [store, onPriceSelect, onModeChange])
  useEffect(() => {
    if (store.get(coinAtom) === name) return
    store.set(coinAtom, name)
    store.set(precisionAtom, PRECISIONS[0])
    store.set(selectedAtom, null)
    store.set(hoverAtom, null)
  }, [store, name])
  useEffect(() => {
    if (view) store.set(tabAtom, view)
  }, [store, view])
  const root = useRef<HTMLDivElement>(null)
  const visible = useVisible(root)
  const current = useAtomValue(coinAtom, { store }) === name
  return (
    <QueryClientProvider client={client}>
      <Provider store={store}>
        <div
          ref={root}
          data-widget
          className={cn("@container flex h-full min-h-0 flex-col [--row:23px] pointer-coarse:[--row:24px]", className)}
        >
          {visible && !paused && current && <Widget framed={!view} />}
        </div>
      </Provider>
    </QueryClientProvider>
  )
}

function Widget({ framed }: { framed: boolean }) {
  const status = useFeedStatus()
  const mode = useAtomValue(modeAtom)
  const coin = useAtomValue(coinAtom)
  const { listed, failed, retry } = useListing(coin)
  const setHover = useSetAtom(hoverAtom)
  useEffect(() => () => setHover(null), [setHover])
  return (
    <section
      aria-label="Order book"
      data-testid="status"
      data-status={status}
      className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-cell bg-panel tabular-nums transition-opacity data-[status=connecting]:opacity-60"
    >
      {listed !== false && !failed ? (
        mode === "stacked" ? (
          <Stack />
        ) : mode === "large" ? (
          <Large />
        ) : (
          <Tabbed framed={framed} />
        )
      ) : (
        <div className="grid flex-1 place-items-center p-4 text-center text-xs text-muted-foreground">
          {failed ? (
            <span className="flex flex-col items-center gap-2">
              The market list didn't load.
              <button type="button" onClick={retry} className="text-primary hover:text-primary/80">
                Retry
              </button>
            </span>
          ) : (
            `Unknown market ${coin}`
          )}
        </div>
      )}
      <HoverCard />
    </section>
  )
}

function Tabbed({ framed }: { framed: boolean }) {
  const [tab, setTab] = useAtom(tabAtom)
  const trigger =
    "h-full flex-none justify-self-center rounded-none px-2.5 text-xs font-normal text-muted-foreground after:bg-primary group-data-horizontal/tabs:after:-bottom-px group-data-horizontal/tabs:after:h-0.5 data-active:text-foreground pointer-coarse:text-[13px]"
  return (
    <Tabs value={tab} onValueChange={(value) => setTab(value)} className="min-h-0 flex-1 gap-0">
      {framed && (
        <div className="relative shrink-0 border-b border-line">
          <TabsList
            variant="line"
            className="grid w-full grid-cols-2 rounded-none p-0 pr-8 group-data-horizontal/tabs:h-10"
          >
            <TabsTrigger value="book" className={trigger}>
              Order Book
            </TabsTrigger>
            <TabsTrigger value="trades" className={trigger}>
              Trades
            </TabsTrigger>
          </TabsList>
          <PanelMenu className="absolute top-1/2 right-1.5 -translate-y-1/2" />
        </div>
      )}
      <div className="grid min-h-0 flex-1 grid-rows-[minmax(0,1fr)]">
        <TabsContent value="book" keepMounted render={panel} className={stacked}>
          <BookPanel />
        </TabsContent>
        <TabsContent value="trades" keepMounted render={panel} className={stacked}>
          <TradesPanel />
        </TabsContent>
      </div>
    </Tabs>
  )
}

function Stack() {
  return (
    <>
      <Heading menu>Order Book</Heading>
      <div className="flex min-h-0 flex-[3] flex-col">
        <BookPanel />
      </div>
      <Heading>Trades</Heading>
      <div className="flex min-h-0 flex-[2] flex-col">
        <TradesPanel />
      </div>
    </>
  )
}

function Large() {
  return (
    <div className="grid min-h-0 flex-1 grid-rows-[auto_3fr_auto_2fr] @min-[36rem]:grid-cols-2 @min-[36rem]:grid-rows-[auto_1fr]">
      <Heading className="@min-[36rem]:col-start-1 @min-[36rem]:row-start-1">Order Book</Heading>
      <div className="flex min-h-0 flex-col @min-[36rem]:col-start-1 @min-[36rem]:row-start-2 @min-[36rem]:border-r @min-[36rem]:border-line">
        <BookPanel />
      </div>
      <Heading menu className="@min-[36rem]:col-start-2 @min-[36rem]:row-start-1">
        Trades
      </Heading>
      <div className="flex min-h-0 flex-col @min-[36rem]:col-start-2 @min-[36rem]:row-start-2">
        <TradesPanel />
      </div>
    </div>
  )
}

function Heading({ children, menu, className }: { children: ReactNode; menu?: boolean; className?: string }) {
  return (
    <div className={cn(heading, className)}>
      <span className="flex-1">{children}</span>
      {menu && <PanelMenu />}
    </div>
  )
}

function PanelMenu({ className }: { className?: string }) {
  const mode = useAtomValue(modeAtom)
  const setMode = useSetAtom(setModeAtom)
  const [layout, setLayout] = useAtom(layoutAtom)
  const setSelected = useSetAtom(selectedAtom)
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label="Book settings"
        className={cn("grid size-6 place-items-center text-muted-foreground hover:text-foreground", className)}
      >
        <EllipsisVertical className="size-4" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-44">
        <DropdownMenuGroup>
          <DropdownMenuLabel>Panel</DropdownMenuLabel>
          <DropdownMenuRadioGroup value={mode} onValueChange={(value: Mode) => setMode(value)}>
            {MODES.map((option) => (
              <DropdownMenuRadioItem key={option.value} value={option.value} closeOnClick>
                {option.label}
              </DropdownMenuRadioItem>
            ))}
          </DropdownMenuRadioGroup>
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        <DropdownMenuGroup>
          <DropdownMenuLabel>Book</DropdownMenuLabel>
          <DropdownMenuRadioGroup
            value={layout}
            onValueChange={(value: Layout) => {
              setLayout(value)
              setSelected(null)
            }}
          >
            {LAYOUTS.map((option) => (
              <DropdownMenuRadioItem key={option.value} value={option.value} closeOnClick>
                {option.label}
              </DropdownMenuRadioItem>
            ))}
          </DropdownMenuRadioGroup>
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

function BookPanel() {
  const { listed } = useListing(useAtomValue(coinAtom))
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {listed ? (
        <>
          <Controls />
          <Depth />
          <SweepStrip />
        </>
      ) : (
        <BookSkeleton />
      )}
    </div>
  )
}

function BookSkeleton() {
  return (
    <>
      <div className="flex h-8 shrink-0 items-center justify-between px-2.5">
        <span aria-hidden className={cn(bone, "w-8")} />
        <span aria-hidden className={cn(bone, "w-10")} />
      </div>
      <Columns last="Total" />
      {["asks", "bids"].map((side) => (
        <div key={side} aria-hidden className="flex min-h-0 flex-1 flex-col overflow-hidden">
          {SLOTS.map((slot) => (
            <Placeholder key={slot} fixed />
          ))}
        </div>
      ))}
    </>
  )
}

function TradesPanel() {
  const { listed } = useListing(useAtomValue(coinAtom))
  return listed ? (
    <Tape />
  ) : (
    <>
      <Columns last="Time" />
      <TapeSkeleton />
    </>
  )
}

function Controls() {
  const coin = useAtomValue(coinAtom)
  const [precision, setPrecision] = useAtom(precisionAtom)
  const [unit, setUnit] = useAtom(unitAtom)
  const setSelected = useSetAtom(selectedAtom)
  const magnitude = useMagnitude()
  const szDecimals = useSzDecimals()
  const options = precisionOptions(magnitude, szDecimals).map((option) => ({
    value: option.precision.id,
    label: option.tick === undefined ? option.precision.id : formatNumber(option.tick, decimalsOf(option.tick)),
    detail: option.precision.nSigFigs
      ? `${option.precision.nSigFigs} sig figs${option.precision.mantissa ? ` ×${option.precision.mantissa}` : ""}`
      : "full",
  }))
  const trigger = cn(plain, "gap-1 text-xs text-foreground pointer-coarse:text-[13px]")
  return (
    <div className="flex h-8 shrink-0 items-center justify-between px-2.5">
      <Select
        items={options}
        value={precision.id}
        onValueChange={(id) => {
          setPrecision(PRECISIONS.find((p) => p.id === id) ?? precision)
          setSelected(null)
        }}
      >
        <SelectTrigger aria-label="Precision" className={trigger}>
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
      <Select
        items={[
          { value: "coin", label: coin },
          { value: "usd", label: "USD" },
        ]}
        value={unit}
        onValueChange={(next) => next && setUnit(next)}
      >
        <SelectTrigger aria-label="Units" className={trigger}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent align="end">
          <SelectItem value="coin">{coin}</SelectItem>
          <SelectItem value="usd">USD</SelectItem>
        </SelectContent>
      </Select>
    </div>
  )
}

function SweepStrip() {
  const selected = useAtomValue(selectedAtom)
  const setSelected = useSetAtom(selectedAtom)
  const coin = useAtomValue(coinAtom)
  const szDecimals = useSzDecimals()
  const sweep = useBook((view) => (selected ? sweepOf(view, selected.side, selected.px) : undefined))
  if (!selected || !sweep) return null
  return (
    <div className="flex h-8 shrink-0 items-center justify-between gap-3 border-t border-line px-2.5 text-xs pointer-fine:hidden pointer-coarse:text-[13px]">
      <span data-testid="sweep" className="truncate">
        <span className={selected.side === "asks" ? "text-bid" : "text-ask"}>
          {selected.side === "asks" ? "Buy" : "Sell"}
        </span>{" "}
        {formatNumber(sweep.total, szDecimals)} {coin}
        <span className="text-muted-foreground"> · avg </span>
        {formatNumber(sweep.avg, priceDecimals(sweep.avg, szDecimals) + 1)}
        <span className="text-muted-foreground"> · {formatNumber(sweep.fromMid, 4)}% from mid</span>
      </span>
      <button
        type="button"
        aria-label="Clear selection"
        onClick={() => setSelected(null)}
        className="text-muted-foreground hover:text-foreground"
      >
        <X className="size-4" />
      </button>
    </div>
  )
}
