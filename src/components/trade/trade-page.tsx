"use client"

import { QueryClientProvider } from "@tanstack/react-query"
import { cn } from "cn"
import { usePathname } from "next/navigation"
import { useEffect, useState } from "react"
import { client } from "@/lib/client"
import { useMarketName } from "@/lib/markets"
import { type Mode, OrderBook } from "../order-book"
import { Favorites } from "./favorites"
import { MarketBar } from "./market-bar"
import { MarketSearch } from "./market-search"

const marketOf = (pathname: string) => decodeURIComponent(pathname.split("/")[2] ?? "") || "BTC"

export function TradePage() {
  return (
    <QueryClientProvider client={client}>
      <Trade />
    </QueryClientProvider>
  )
}

function Trade() {
  const pathname = usePathname()
  const [route, setRoute] = useState(() => marketOf(pathname))
  useEffect(() => setRoute(marketOf(pathname)), [pathname])
  const coin = useMarketName(route)
  const [search, setSearch] = useState(false)
  const [mode, setMode] = useState<Mode>("tab")
  const select = (next: string) => {
    if (next === coin) return
    setRoute(next)
    window.history.pushState(null, "", `/trade/${encodeURIComponent(next)}`)
  }
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
    <main
      className={cn(
        "mx-auto flex min-h-dvh w-full flex-col gap-1 bg-background p-1 text-foreground lg:h-dvh",
        mode === "large" ? "max-w-3xl" : "max-w-md",
      )}
    >
      <Favorites coin={coin} onSelect={select} />
      <MarketBar coin={coin} onSearch={() => setSearch(true)} />
      <OrderBook market={coin} paused={search} onModeChange={setMode} className="min-h-[30rem] flex-1" />
      <MarketSearch open={search} onOpenChange={setSearch} onSelect={select} />
    </main>
  )
}
