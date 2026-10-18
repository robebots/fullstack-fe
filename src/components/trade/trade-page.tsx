"use client"

import { QueryClientProvider } from "@tanstack/react-query"
import { cn } from "cn"
import { usePathname } from "next/navigation"
import { useEffect, useState } from "react"
import { client } from "@/lib/client"
import { formatNumber } from "@/lib/format"
import { FrameStats } from "../frame-stats"
import { type Mode, OrderBook, type PriceSelection } from "../order-book"
import { Account } from "./account"
import { Chart } from "./chart"
import { Favorites } from "./favorites"
import { MarketBar, MarketBarCompact } from "./market-bar"
import { MarketSearch } from "./market-search"
import { Nav } from "./nav"
import { OrderForm, type Ticket } from "./order-form"
import { StatusBar } from "./status-bar"

const PAGES = ["Chart", "Order Book", "Trades", "Funding"] as const

type Page = (typeof PAGES)[number]

const marketOf = (pathname: string) => decodeURIComponent(pathname.split("/")[2] ?? "") || "BTC"

export function TradePage() {
  const coin = marketOf(usePathname())
  const [search, setSearch] = useState(false)
  const [mode, setMode] = useState<Mode>("tab")
  const [page, setPage] = useState<Page>("Order Book")
  const [ticket, setTicket] = useState<Ticket>({ side: "buy", price: "" })
  const select = (next: string) => {
    if (next !== coin) window.history.pushState(null, "", `/trade/${encodeURIComponent(next)}`)
    setTicket({ side: ticket.side, price: "" })
  }
  const fill = ({ side, price }: PriceSelection) =>
    setTicket({ side, price: formatNumber(price, 0, 8).replaceAll(",", "") })
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault()
        setSearch((open) => !open)
      }
    }
    addEventListener("keydown", onKey)
    return () => removeEventListener("keydown", onKey)
  }, [])
  return (
    <QueryClientProvider client={client}>
      <div className="flex min-h-dvh flex-col bg-background text-foreground lg:h-dvh">
        <Nav />
        <div className="hidden lg:block">
          <Favorites coin={coin} onSelect={select} />
        </div>
        <main
          className={cn(
            "hidden min-h-0 flex-1 gap-1 px-1 lg:grid lg:grid-rows-[auto_minmax(0,1fr)_15rem]",
            mode === "large"
              ? "lg:grid-cols-[minmax(0,1fr)_37rem_18.5rem]"
              : "lg:grid-cols-[minmax(0,1fr)_18.5rem_18.5rem]",
          )}
        >
          <MarketBar coin={coin} onSearch={() => setSearch(true)} />
          <Chart className="col-start-1 row-start-2" />
          <div className="col-start-2 row-span-2 row-start-1 min-h-0">
            <OrderBook market={coin} mode={mode} onModeChange={setMode} onPriceSelect={fill} />
          </div>
          <OrderForm coin={coin} ticket={ticket} onTicket={setTicket} className="col-start-3 row-span-3 row-start-1" />
          <Account className="col-span-2 col-start-1 row-start-3" />
        </main>
        <main className="flex flex-col gap-1 lg:hidden">
          <MarketBarCompact coin={coin} onSearch={() => setSearch(true)} />
          <div className="flex h-10 shrink-0 gap-5 overflow-x-auto border-b border-line bg-panel px-3 text-sm whitespace-nowrap">
            {PAGES.map((name) => (
              <button
                key={name}
                type="button"
                aria-pressed={page === name}
                onClick={() => setPage(name)}
                className={cn(
                  "relative",
                  page === name
                    ? "text-foreground after:absolute after:inset-x-0 after:-bottom-px after:h-0.5 after:bg-primary"
                    : "text-muted-foreground",
                )}
              >
                {name}
              </button>
            ))}
          </div>
          <div className="h-[30rem] shrink-0">
            {page === "Chart" ? (
              <Chart className="h-full" />
            ) : page === "Funding" ? (
              <p className="grid h-full place-items-center rounded-[3px] bg-panel text-xs text-muted-foreground">
                Funding history is scaffolded in this demo
              </p>
            ) : (
              <OrderBook
                market={coin}
                layout="split"
                view={page === "Trades" ? "trades" : "book"}
                onPriceSelect={fill}
              />
            )}
          </div>
          <Account />
        </main>
        <StatusBar />
        <FrameStats className="fixed bottom-9 left-2 z-40" />
        <MarketSearch open={search} onOpenChange={setSearch} onSelect={select} />
      </div>
    </QueryClientProvider>
  )
}
