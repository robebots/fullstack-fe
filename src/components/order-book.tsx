"use client"

import { QueryClientProvider } from "@tanstack/react-query"
import { cn } from "cn"
import { createStore, Provider, useAtom, useAtomValue, useSetAtom } from "jotai"
import { EllipsisVertical, X } from "lucide-react"
import { type ReactNode, type RefObject, useEffect, useRef, useState, useSyncExternalStore } from "react"
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
import {
  coinAtom,
  hoverAtom,
  type Layout,
  layoutAtom,
  listenerAtom,
  type Mode,
  modeAtom,
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
import { Depth, HoverCard } from "./depth"
import { plain, underline } from "./styles"
import { Tape } from "./tape"

export type { Mode }

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

const TABS: { value: Tab; label: string }[] = [
  { value: "book", label: "Order Book" },
  { value: "trades", label: "Trades" },
]

const heading = "flex h-10 shrink-0 items-center border-b border-line px-2.5 text-xs text-foreground"

const roomyQuery = "(min-width: 600px)"

const useRoomy = () =>
  useSyncExternalStore(
    (onChange) => {
      const query = matchMedia(roomyQuery)
      query.addEventListener("change", onChange)
      return () => query.removeEventListener("change", onChange)
    },
    () => matchMedia(roomyQuery).matches,
    () => true,
  )

function useVisible(ref: RefObject<HTMLElement | null>) {
  const [onScreen, setOnScreen] = useState(false)
  const [shown, setShown] = useState(false)
  useEffect(() => {
    if (!ref.current) return
    const observer = new IntersectionObserver(([entry]) => setOnScreen(entry.isIntersecting))
    observer.observe(ref.current)
    const onVisibility = () => setShown(!document.hidden)
    onVisibility()
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
  paused = false,
  onModeChange,
  className,
}: {
  market: Coin
  paused?: boolean
  onModeChange?: (mode: Mode) => void
  className?: string
}) {
  const name = useMarketName(market)
  const [store] = useState(() => {
    const store = createStore()
    store.set(coinAtom, name)
    return store
  })
  useEffect(() => store.set(listenerAtom, { onModeChange }), [store, onModeChange])
  useEffect(() => {
    if (store.get(coinAtom) === name) return
    store.set(coinAtom, name)
    store.set(precisionAtom, PRECISIONS[0])
    store.set(selectedAtom, null)
    store.set(hoverAtom, null)
  }, [store, name])
  const root = useRef<HTMLDivElement>(null)
  const visible = useVisible(root)
  const current = useAtomValue(coinAtom, { store }) === name
  return (
    <QueryClientProvider client={client}>
      <Provider store={store}>
        <div
          ref={root}
          data-widget
          className={cn("@container flex h-full min-h-0 flex-col rounded-cell bg-panel [--row:25px]", className)}
        >
          {visible && !paused && current && <Widget />}
        </div>
      </Provider>
    </QueryClientProvider>
  )
}

function Widget() {
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
      data-mode={mode}
      className="group/widget flex min-h-0 flex-1 flex-col overflow-hidden rounded-cell bg-panel tabular-nums transition-opacity data-[status=connecting]:opacity-60"
    >
      {listed !== false && !failed ? (
        <Panels />
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

function Panels() {
  const mode = useAtomValue(modeAtom)
  const [tab, setTab] = useAtom(tabAtom)
  const tabbed = mode === "tab"
  const large = mode === "large"
  return (
    <div
      data-panels
      className={cn(
        "grid min-h-0 flex-1 grid-cols-1 grid-rows-[auto_minmax(0,1fr)]",
        large && "@min-[36rem]:grid-cols-2 @min-[36rem]:grid-rows-[minmax(0,1fr)]",
      )}
    >
      {tabbed && (
        <div className="relative flex h-10 shrink-0 border-b border-line">
          <div role="tablist" className="grid flex-1 grid-cols-2 pr-8">
            {TABS.map((option) => (
              <button
                key={option.value}
                type="button"
                role="tab"
                aria-selected={tab === option.value}
                onClick={() => setTab(option.value)}
                className={cn(
                  "h-full justify-self-center px-2.5 text-xs pointer-coarse:text-[13px]",
                  tab === option.value
                    ? cn(underline, "text-foreground")
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                {option.label}
              </button>
            ))}
          </div>
          <PanelMenu className="absolute top-1/2 right-1.5 -translate-y-1/2" />
        </div>
      )}
      <section
        data-panel="book"
        role={tabbed ? "tabpanel" : undefined}
        aria-label="Order Book"
        className={cn(
          "flex min-h-0 flex-col",
          tabbed ? cn("col-start-1 row-start-2", tab !== "book" && "invisible") : "row-start-1",
          large && "@min-[36rem]:border-r @min-[36rem]:border-line",
        )}
      >
        {!tabbed && <Heading menu={!large}>Order Book</Heading>}
        <BookPanel />
      </section>
      <section
        role={tabbed ? "tabpanel" : undefined}
        aria-label="Trades"
        className={cn(
          "flex min-h-0 flex-col",
          tabbed ? cn("col-start-1 row-start-2", tab !== "trades" && "invisible") : "row-start-2",
          large && "@min-[36rem]:col-start-2 @min-[36rem]:row-start-1",
        )}
      >
        {!tabbed && <Heading menu={large}>Trades</Heading>}
        <Tape />
      </section>
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
  const roomy = useRoomy()
  const [layout, setLayout] = useAtom(layoutAtom)
  const setSelected = useSetAtom(selectedAtom)
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label="Book settings"
        className={cn(
          "grid size-6 place-items-center text-muted-foreground hover:text-foreground pointer-coarse:size-10",
          className,
        )}
      >
        <EllipsisVertical className="size-4" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-44">
        <DropdownMenuGroup>
          <DropdownMenuLabel>Panel</DropdownMenuLabel>
          <DropdownMenuRadioGroup value={mode} onValueChange={(value: Mode) => setMode(value)}>
            {MODES.filter((option) => roomy || option.value !== "large").map((option) => (
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
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <Controls />
      <Depth />
      <SweepStrip />
    </div>
  )
}

function Controls() {
  const coin = useAtomValue(coinAtom)
  const [precision, setPrecision] = useAtom(precisionAtom)
  const [unit, setUnit] = useAtom(unitAtom)
  const [selected, setSelected] = useAtom(selectedAtom)
  const magnitude = useMagnitude()
  const szDecimals = useSzDecimals()
  const options = precisionOptions(magnitude, szDecimals).map((option) => ({
    value: option.precision.id,
    label: option.tick === undefined ? option.precision.id : formatNumber(option.tick, decimalsOf(option.tick)),
    detail: option.precision.nSigFigs
      ? `${option.precision.nSigFigs} sig figs${option.precision.mantissa ? ` ×${option.precision.mantissa}` : ""}`
      : "full",
  }))
  const trigger = cn(
    plain,
    "gap-1 text-xs text-foreground pointer-coarse:min-w-11 pointer-coarse:text-[13px] pointer-coarse:data-[size=default]:h-11",
  )
  return (
    <div
      className={cn(
        "flex h-8 shrink-0 items-center justify-between border-line px-2.5 pointer-coarse:h-11 pointer-coarse:group-data-[mode=tab]/widget:order-last pointer-coarse:group-data-[mode=tab]/widget:border-t",
        selected && "pointer-coarse:hidden",
      )}
    >
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
    <div className="order-first flex h-11 shrink-0 items-center justify-between gap-3 border-line px-2.5 text-xs pointer-fine:hidden pointer-coarse:text-[13px] group-data-[mode=tab]/widget:order-last group-data-[mode=tab]/widget:border-t">
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
