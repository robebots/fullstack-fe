"use client"

import { cn } from "cn"
import { ChevronDown } from "lucide-react"
import { type ReactNode, useEffect, useState } from "react"
import { formatNumber, formatSigned } from "@/lib/format"
import { priceDecimals } from "@/lib/hyperliquid"
import { changeOf, useMarket, useStats } from "@/lib/markets"
import { CoinIcon } from "../coin-icon"
import { bone } from "../styles"

const HOUR = 3_600_000

function Countdown() {
  const [now, setNow] = useState<number>()
  useEffect(() => {
    setNow(Date.now())
    const timer = setInterval(() => setNow(Date.now()), 1_000)
    return () => clearInterval(timer)
  }, [])
  if (now === undefined) return <span className="text-muted-foreground">--:--:--</span>
  const left = Math.ceil(now / HOUR) * HOUR - now
  const parts = [left / HOUR, (left / 60_000) % 60, (left / 1_000) % 60].map((part) =>
    String(Math.floor(part)).padStart(2, "0"),
  )
  return <span>{parts.join(":")}</span>
}

function Stat({ label, width, children }: { label: string; width: string; children?: ReactNode }) {
  return (
    <div className={cn("flex shrink-0 flex-col gap-0.5", width)}>
      <span className="text-muted-foreground">{label}</span>
      <span className="flex h-4 items-center gap-2 tabular-nums">
        {children ?? <span aria-hidden className={cn(bone, "h-3 w-4/5")} />}
      </span>
    </div>
  )
}

const tone = (value: number) => (value >= 0 ? "text-bid" : "text-ask")

function useMarketView(coin: string) {
  const market = useMarket(coin)
  const stats = useStats(coin)
  if (!market || !stats) return undefined
  const decimals = priceDecimals(stats.mark, market.szDecimals)
  const change = changeOf(stats)
  return { market, stats, decimals, change }
}

type View = ReturnType<typeof useMarketView>

function Stats({ view }: { view: View }) {
  return (
    <>
      <Stat label="Mark" width="min-w-14">
        {view && formatNumber(view.stats.mark, view.decimals)}
      </Stat>
      <Stat label="Oracle" width="min-w-14">
        {view && formatNumber(view.stats.oracle, view.decimals)}
      </Stat>
      <Stat label="24h Volume" width="min-w-28">
        {view && `$${formatNumber(view.stats.volume, 0)}`}
      </Stat>
      <Stat label="Open Interest" width="min-w-28">
        {view && `$${formatNumber(view.stats.openInterest, 0)}`}
      </Stat>
      <Stat label="Funding / Countdown" width="min-w-32">
        {view && (
          <>
            <span className={tone(view.stats.funding)}>{formatNumber(view.stats.funding * 100, 4)}%</span>
            <Countdown />
          </>
        )}
      </Stat>
    </>
  )
}

export function MarketBar({ coin, onSearch }: { coin: string; onSearch: () => void }) {
  const view = useMarketView(coin)
  const [open, setOpen] = useState(false)
  return (
    <header data-testid="market-bar" className="flex shrink-0 flex-col gap-3 bg-panel px-3 py-3 text-xs">
      <div className="flex items-center gap-3">
        <button
          type="button"
          aria-label="Search markets"
          onClick={onSearch}
          className="flex items-center gap-2 pointer-coarse:min-h-11"
        >
          <CoinIcon coin={coin} className="size-7" />
          <span className="flex flex-col items-start">
            <span className="flex items-center gap-1 text-lg leading-tight text-foreground">
              {coin}-USD <ChevronDown className="size-4 text-muted-foreground" />
            </span>
            <span className="flex h-4 items-center text-primary">
              {view ? `${view.market.maxLeverage}x` : <span aria-hidden className={cn(bone, "w-6")} />}
            </span>
          </span>
        </button>
        <span className="ml-auto flex flex-col items-end gap-1 tabular-nums">
          <span className="flex h-6 items-center text-lg leading-tight">
            {view ? (
              formatNumber(view.stats.mark, view.decimals)
            ) : (
              <span aria-hidden className={cn(bone, "h-4 w-20")} />
            )}
          </span>
          <span className={cn("flex h-4 items-center", view && tone(view.change.value))}>
            {view ? (
              `${formatSigned(view.change.value, view.decimals)} / ${formatSigned(view.change.percent, 2)}%`
            ) : (
              <span aria-hidden className={cn(bone, "w-24")} />
            )}
          </span>
        </span>
        <button
          type="button"
          aria-label="Market details"
          aria-expanded={open}
          onClick={() => setOpen(!open)}
          className="grid size-8 place-items-center border border-line text-muted-foreground pointer-coarse:size-10"
        >
          <ChevronDown className={cn("size-4 transition-transform", open && "rotate-180")} />
        </button>
      </div>
      {open && (
        <div className="grid grid-cols-2 gap-3">
          <Stats view={view} />
        </div>
      )}
    </header>
  )
}
