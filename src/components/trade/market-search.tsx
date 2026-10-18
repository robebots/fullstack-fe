"use client"

import { cn } from "cn"
import { useAtomValue, useSetAtom } from "jotai"
import { ChevronDown, Search, Star, X } from "lucide-react"
import { type KeyboardEvent, type RefObject, useEffect, useRef, useState } from "react"
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog"
import { favoritesAtom, toggleFavoriteAtom } from "@/lib/favorites"
import { formatCompact, formatNumber, formatSigned, priceDecimals } from "@/lib/format"
import { changeOf, type Market, useMarkets } from "@/lib/markets"
import { CoinIcon } from "../coin-icon"

const CATEGORIES = ["All", "Perps", "Spot", "Outcome", "Crypto", "Tradfi", "HIP-3", "HIP-4", "Trending"] as const

type Category = (typeof CATEGORIES)[number]

const LISTED: Category[] = ["All", "Perps", "Crypto", "Trending"]

type SortKey = "price" | "change" | "funding" | "volume" | "openInterest"

type Sort = { key: SortKey; desc: boolean }

const VALUE: Record<SortKey, (market: Market) => number> = {
  price: (market) => market.mid ?? market.mark,
  change: (market) => changeOf(market).percent,
  funding: (market) => market.funding,
  volume: (market) => market.volume,
  openInterest: (market) => market.openInterest,
}

const COLUMNS: { key: SortKey; label: string }[] = [
  { key: "price", label: "Last Price" },
  { key: "change", label: "24h Change" },
  { key: "funding", label: "8h Funding" },
  { key: "volume", label: "Volume" },
  { key: "openInterest", label: "Open Interest" },
]

const wide = "grid-cols-[minmax(0,2.2fr)_1fr_1.4fr_1fr_1.3fr_1.3fr]"

const narrow = "grid-cols-[minmax(0,1.3fr)_1fr_1fr]"

const wideOnDesktop = "lg:grid-cols-[minmax(0,2.2fr)_1fr_1.4fr_1fr_1.3fr_1.3fr]"

function filterMarkets(markets: Market[], query: string, strict: boolean, category: Category, sort: Sort) {
  const needle = query.trim().toUpperCase()
  const found = markets.filter((market) => (!strict || !market.delisted) && market.name.toUpperCase().includes(needle))
  if (category === "Trending")
    return found.toSorted((a, b) => Math.abs(changeOf(b).percent) - Math.abs(changeOf(a).percent)).slice(0, 20)
  return found.toSorted((a, b) => (VALUE[sort.key](b) - VALUE[sort.key](a)) * (sort.desc ? 1 : -1))
}

export function MarketSearch({
  open,
  onOpenChange,
  onSelect,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  onSelect: (coin: string) => void
}) {
  const input = useRef<HTMLInputElement>(null)
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        showCloseButton={false}
        initialFocus={input}
        className="top-0 left-0 flex h-dvh w-full max-w-none translate-x-0 translate-y-0 flex-col gap-0 overflow-hidden rounded-none bg-panel p-0 text-xs ring-line sm:max-w-none lg:top-28 lg:left-1/2 lg:h-[min(640px,calc(100dvh-8rem))] lg:w-[min(1180px,calc(100%-2rem))] lg:-translate-x-1/2 lg:rounded-md lg:ring-1"
      >
        <DialogTitle className="sr-only">Search markets</DialogTitle>
        <SearchBody input={input} onClose={() => onOpenChange(false)} onSelect={onSelect} />
      </DialogContent>
    </Dialog>
  )
}

function SearchBody({
  input,
  onClose,
  onSelect,
}: {
  input: RefObject<HTMLInputElement | null>
  onClose: () => void
  onSelect: (coin: string) => void
}) {
  const [query, setQuery] = useState("")
  const [strict, setStrict] = useState(true)
  const [category, setCategory] = useState<Category>("All")
  const [sort, setSort] = useState<Sort>({ key: "volume", desc: true })
  const [active, setActive] = useState(0)
  const favorites = useAtomValue(favoritesAtom)
  const toggleFavorite = useSetAtom(toggleFavoriteAtom)
  const markets = useMarkets((list) => list, true)
  const list = useRef<HTMLUListElement>(null)
  const listed = LISTED.includes(category)
  const rows = markets && listed ? filterMarkets(markets, query, strict, category, sort) : []
  const current = Math.min(active, Math.max(0, rows.length - 1))
  useEffect(() => {
    list.current?.children[current]?.scrollIntoView({ block: "nearest" })
  }, [current])
  const choose = (market: Market) => {
    onSelect(market.name)
    onClose()
  }
  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    const target = rows[current]
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault()
      setActive(Math.max(0, Math.min(rows.length - 1, current + (event.key === "ArrowDown" ? 1 : -1))))
    } else if (event.key === "Enter" && target) choose(target)
    else if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "s" && target) {
      event.preventDefault()
      toggleFavorite(target.name)
    }
  }
  const sortBy = (key: SortKey) => {
    setSort({ key, desc: sort.key === key ? !sort.desc : true })
    setActive(0)
  }
  return (
    <>
      <div className="flex shrink-0 items-center gap-3 p-3 lg:p-4">
        <label className="flex h-10 min-w-0 flex-1 items-center gap-2 rounded-[3px] border border-line px-3 focus-within:border-primary/60">
          <Search className="size-4 shrink-0 text-muted-foreground" />
          <input
            ref={input}
            value={query}
            onChange={(event) => {
              setQuery(event.target.value)
              setActive(0)
            }}
            onKeyDown={onKeyDown}
            placeholder="Search"
            aria-label="Search markets"
            className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
          />
        </label>
        <fieldset aria-label="Listing" className="grid h-10 shrink-0 grid-cols-2 rounded-[3px] bg-muted p-1 text-sm">
          {[true, false].map((value) => (
            <button
              key={String(value)}
              type="button"
              aria-pressed={strict === value}
              onClick={() => {
                setStrict(value)
                setActive(0)
              }}
              className={cn(
                "rounded-[3px] px-4",
                strict === value ? "bg-primary text-primary-foreground" : "text-muted-foreground",
              )}
            >
              {value ? "Strict" : "All"}
            </button>
          ))}
        </fieldset>
        <button type="button" aria-label="Close" onClick={onClose} className="text-muted-foreground lg:hidden">
          <X className="size-5" />
        </button>
      </div>
      <div className="flex h-10 shrink-0 gap-5 overflow-x-auto border-b border-line px-3 text-sm whitespace-nowrap lg:px-4">
        {CATEGORIES.map((name) => (
          <button
            key={name}
            type="button"
            aria-pressed={category === name}
            onClick={() => {
              setCategory(name)
              setActive(0)
            }}
            className={cn(
              "relative",
              category === name
                ? "text-foreground after:absolute after:inset-x-0 after:-bottom-px after:h-0.5 after:bg-primary"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            {name}
          </button>
        ))}
      </div>
      <div className={cn("hidden h-9 shrink-0 items-center px-4 text-muted-foreground lg:grid", wide)}>
        <span className="pl-8">Market</span>
        {COLUMNS.map((column) => (
          <button
            key={column.key}
            type="button"
            onClick={() => sortBy(column.key)}
            className="flex items-center gap-1 text-left hover:text-foreground"
          >
            {column.label}
            {sort.key === column.key && <ChevronDown className={cn("size-3.5", !sort.desc && "rotate-180")} />}
          </button>
        ))}
      </div>
      <div className={cn("grid h-11 shrink-0 items-center px-3 text-muted-foreground lg:hidden", narrow)}>
        <span className="pl-8">Market</span>
        <button type="button" onClick={() => sortBy("volume")} className="text-right leading-tight">
          Volume
          <br />
          Open Interest
        </button>
        <button type="button" onClick={() => sortBy("change")} className="text-right leading-tight">
          Last Price
          <br />
          24h Change
        </button>
      </div>
      {!listed ? (
        <p className="grid flex-1 place-items-center text-sm text-muted-foreground">
          {category} markets are coming soon
        </p>
      ) : rows.length === 0 ? (
        <p className="grid flex-1 place-items-center text-sm text-muted-foreground">
          {markets ? `No markets match "${query}"` : "Loading markets"}
        </p>
      ) : (
        <ul ref={list} data-testid="market-list" className="min-h-0 flex-1 overflow-y-auto px-1 pb-2 lg:px-2">
          {rows.map((market, index) => (
            <Option
              key={market.name}
              market={market}
              active={index === current}
              favorite={favorites.includes(market.name)}
              onActive={() => setActive(index)}
              onChoose={() => choose(market)}
              onFavorite={() => toggleFavorite(market.name)}
            />
          ))}
        </ul>
      )}
      <div className="hidden h-11 shrink-0 items-center gap-5 border-t border-line px-4 text-muted-foreground lg:flex">
        {[
          ["⌘K", "Open"],
          ["↑↓", "Navigate"],
          ["Enter", "Select"],
          ["⌘S", "Favorite"],
          ["Esc", "Close"],
        ].map(([key, action]) => (
          <span key={action} className="flex items-center gap-2">
            <kbd className="rounded-[3px] bg-muted px-1.5 py-0.5 font-sans text-foreground">{key}</kbd>
            {action}
          </span>
        ))}
      </div>
    </>
  )
}

function Option({
  market,
  active,
  favorite,
  onActive,
  onChoose,
  onFavorite,
}: {
  market: Market
  active: boolean
  favorite: boolean
  onActive: () => void
  onChoose: () => void
  onFavorite: () => void
}) {
  const price = market.mid ?? market.mark
  const decimals = priceDecimals(price, market.szDecimals)
  const change = changeOf(market)
  const tone = change.value >= 0 ? "text-bid" : "text-ask"
  return (
    <li
      data-active={active}
      className="flex items-center rounded-[3px] border-b border-line/60 data-[active=true]:bg-muted lg:border-none"
    >
      <button
        type="button"
        aria-pressed={favorite}
        aria-label={favorite ? `Remove ${market.name} from favorites` : `Add ${market.name} to favorites`}
        onClick={onFavorite}
        className="grid size-8 shrink-0 place-items-center"
      >
        <Star className={cn("size-3.5", favorite ? "fill-primary text-primary" : "text-muted-foreground")} />
      </button>
      <button
        type="button"
        data-testid="market-option"
        data-coin={market.name}
        onClick={onChoose}
        onPointerEnter={onActive}
        className={cn(
          "grid min-w-0 flex-1 items-center py-2 pr-2 text-left tabular-nums lg:py-1.5",
          narrow,
          wideOnDesktop,
        )}
      >
        <span className="flex min-w-0 items-center gap-2">
          <CoinIcon coin={market.name} className="hidden size-4 lg:block" />
          <span className="flex min-w-0 flex-col gap-1 lg:flex-row lg:items-center lg:gap-2">
            <span className={cn("truncate text-sm", market.delisted && "text-muted-foreground")}>
              {market.name}-USD
            </span>
            <span className="flex gap-1">
              <span className="w-fit rounded-[3px] bg-primary/15 px-1 text-primary">{market.maxLeverage}x</span>
              {market.delisted && <span className="rounded-[3px] bg-muted px-1 text-muted-foreground">delisted</span>}
            </span>
          </span>
        </span>
        <span className="text-right lg:hidden">
          <span className="block text-sm">{formatCompact(market.volume)}</span>
          <span className="block text-muted-foreground">{formatCompact(market.openInterest)}</span>
        </span>
        <span className="text-right lg:hidden">
          <span className="block text-sm">{formatNumber(price, decimals)}</span>
          <span className={cn("block", tone)}>{formatSigned(change.percent, 2)}%</span>
        </span>
        <span className="hidden lg:block">{formatNumber(price, decimals)}</span>
        <span className={cn("hidden lg:block", tone)}>
          {formatSigned(change.value, decimals)} / {formatSigned(change.percent, 2)}%
        </span>
        <span className="hidden lg:block">{formatNumber(market.funding * 800, 4)}%</span>
        <span className="hidden lg:block">${formatNumber(market.volume, 0)}</span>
        <span className="hidden lg:block">${formatNumber(market.openInterest, 0)}</span>
      </button>
    </li>
  )
}
