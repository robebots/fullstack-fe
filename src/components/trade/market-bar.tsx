"use client"

import { cn } from "cn"
import { ChevronDown } from "lucide-react"
import { type ReactNode, useEffect, useState } from "react"
import { formatNumber, formatSigned, priceDecimals } from "@/lib/format"
import { changeOf, useMarket, useStats } from "@/lib/markets"
import { CoinIcon } from "../coin-icon"

const HOUR = 3_600_000

function Countdown() {
  const [now, setNow] = useState<number>()
  useEffect(() => {
    setNow(Date.now())
    const timer = setInterval(() => setNow(Date.now()), 1_000)
    return () => clearInterval(timer)
  }, [])
  if (now === undefined) return null
  const left = Math.ceil(now / HOUR) * HOUR - now
  const parts = [left / HOUR, (left / 60_000) % 60, (left / 1_000) % 60].map((part) =>
    String(Math.floor(part)).padStart(2, "0"),
  )
  return <span>{parts.join(":")}</span>
}

function Stat({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex shrink-0 flex-col gap-0.5">
      <span className="text-muted-foreground">{label}</span>
      <span className="flex gap-2 tabular-nums">{children}</span>
    </div>
  )
}

const tone = (value: number) => (value >= 0 ? "text-bid" : "text-ask")

export function useMarketView(coin: string) {
  const market = useMarket(coin)
  const stats = useStats(coin)
  if (!market || !stats) return undefined
  const decimals = priceDecimals(stats.mark, market.szDecimals)
  const change = changeOf(stats)
  return { market, stats, decimals, change }
}

export function MarketBar({ coin, onSearch, className }: { coin: string; onSearch: () => void; className?: string }) {
  const view = useMarketView(coin)
  return (
    <header
      data-testid="market-bar"
      className={cn(
        "flex h-14 shrink-0 items-center gap-6 overflow-x-auto rounded-[3px] bg-panel px-3 text-xs whitespace-nowrap",
        className,
      )}
    >
      <button
        type="button"
        aria-label="Search markets"
        onClick={onSearch}
        className="flex items-center gap-2 text-foreground hover:text-foreground/80"
      >
        <CoinIcon coin={coin} className="size-6" />
        <span className="text-xl">{coin}-USD</span>
        <ChevronDown className="size-4 text-muted-foreground" />
      </button>
      {view && (
        <>
          <span className="-ml-3 rounded-[3px] bg-primary/15 px-1.5 py-0.5 text-primary">
            {view.market.maxLeverage}x
          </span>
          <Stat label="Mark">{formatNumber(view.stats.mark, view.decimals)}</Stat>
          <Stat label="Oracle">{formatNumber(view.stats.oracle, view.decimals)}</Stat>
          <Stat label="24h Change">
            <span className={tone(view.change.value)}>
              {formatSigned(view.change.value, view.decimals)} / {formatSigned(view.change.percent, 2)}%
            </span>
          </Stat>
          <Stat label="24h Volume">${formatNumber(view.stats.volume, 2)}</Stat>
          <Stat label="Open Interest">${formatNumber(view.stats.openInterest, 2)}</Stat>
          <Stat label="Funding / Countdown">
            <span className={tone(view.stats.funding)}>{formatNumber(view.stats.funding * 100, 4)}%</span>
            <Countdown />
          </Stat>
        </>
      )}
    </header>
  )
}

export function MarketBarCompact({ coin, onSearch }: { coin: string; onSearch: () => void }) {
  const view = useMarketView(coin)
  const [open, setOpen] = useState(false)
  return (
    <header data-testid="market-bar" className="flex shrink-0 flex-col gap-3 bg-panel px-3 py-3 text-xs">
      <div className="flex items-center gap-3">
        <button type="button" aria-label="Search markets" onClick={onSearch} className="flex items-center gap-2">
          <CoinIcon coin={coin} className="size-7" />
          <span className="flex flex-col items-start">
            <span className="flex items-center gap-1 text-lg leading-tight text-foreground">
              {coin}-USD <ChevronDown className="size-4 text-muted-foreground" />
            </span>
            {view && <span className="text-primary">{view.market.maxLeverage}x</span>}
          </span>
        </button>
        {view && (
          <span className="ml-auto flex flex-col items-end tabular-nums">
            <span className="text-lg leading-tight">
              {formatNumber(view.stats.mid ?? view.stats.mark, view.decimals)}
            </span>
            <span className={tone(view.change.value)}>
              {formatSigned(view.change.value, view.decimals)} / {formatSigned(view.change.percent, 2)}%
            </span>
          </span>
        )}
        <button
          type="button"
          aria-label="Market details"
          aria-expanded={open}
          onClick={() => setOpen(!open)}
          className="grid size-8 place-items-center rounded-[3px] border border-line text-muted-foreground"
        >
          <ChevronDown className={cn("size-4 transition-transform", open && "rotate-180")} />
        </button>
      </div>
      {open && view && (
        <div className="grid grid-cols-2 gap-3">
          <Stat label="Mark">{formatNumber(view.stats.mark, view.decimals)}</Stat>
          <Stat label="Oracle">{formatNumber(view.stats.oracle, view.decimals)}</Stat>
          <Stat label="24h Volume">${formatNumber(view.stats.volume, 0)}</Stat>
          <Stat label="Open Interest">${formatNumber(view.stats.openInterest, 0)}</Stat>
          <Stat label="Funding / Countdown">
            <span className={tone(view.stats.funding)}>{formatNumber(view.stats.funding * 100, 4)}%</span>
            <Countdown />
          </Stat>
        </div>
      )}
    </header>
  )
}
