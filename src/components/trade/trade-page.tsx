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
        "mx-auto flex h-svh w-full flex-col gap-1 bg-background p-1 text-foreground",
        mode === "large" ? "max-w-3xl" : "max-w-md",
      )}
    >
      <div className="flex shrink-0 items-center">
        <Favorites coin={coin} onSelect={select} />
        <a
          href="https://github.com/robebots/fullstack-fe"
          target="_blank"
          rel="noreferrer"
          className="grid size-8 shrink-0 place-items-center text-muted-foreground hover:text-foreground pointer-coarse:size-10"
        >
          <svg aria-hidden="true" viewBox="0 0 16 16" className="size-4 fill-current">
            <path d="M8 0c4.42 0 8 3.58 8 8a8.013 8.013 0 0 1-5.45 7.59c-.4.08-.55-.17-.55-.38 0-.27.01-1.13.01-2.2 0-.75-.25-1.23-.54-1.48 1.78-.2 3.65-.88 3.65-3.95 0-.88-.31-1.59-.82-2.15.08-.2.36-1.02-.08-2.12 0 0-.67-.22-2.2.82-.64-.18-1.32-.27-2-.27-.68 0-1.36.09-2 .27-1.53-1.03-2.2-.82-2.2-.82-.44 1.1-.16 1.92-.08 2.12-.51.56-.82 1.28-.82 2.15 0 3.06 1.86 3.75 3.64 3.95-.23.2-.44.55-.51 1.07-.46.21-1.61.55-2.33-.66-.15-.24-.6-.83-1.23-.82-.67.01-.27.38.01.53.34.19.73.9.82 1.13.16.45.68 1.31 2.69.94 0 .67.01 1.3.01 1.49 0 .21-.15.45-.55.38A7.995 7.995 0 0 1 0 8c0-4.42 3.58-8 8-8Z" />
          </svg>
          <span className="sr-only">GitHub</span>
        </a>
      </div>
      <MarketBar coin={coin} onSearch={() => setSearch(true)} />
      <OrderBook market={coin} paused={search} onModeChange={setMode} className="min-h-[30rem] flex-1" />
      <footer className="flex h-6 shrink-0 justify-center text-xs text-muted-foreground pointer-coarse:h-10">
        <a
          href="https://robgungor.com"
          target="_blank"
          rel="noreferrer"
          className="flex items-center px-2 hover:text-foreground"
        >
          built by Rob
        </a>
      </footer>
      <MarketSearch open={search} onOpenChange={setSearch} onSelect={select} />
    </main>
  )
}
