"use client"

import { cn } from "cn"
import { useAtomValue } from "jotai"
import { Star } from "lucide-react"
import { favoritesAtom } from "@/lib/favorites"
import { formatSigned } from "@/lib/format"
import { changeOf, useMarkets } from "@/lib/markets"

export function Favorites({ coin, onSelect }: { coin: string; onSelect: (coin: string) => void }) {
  const favorites = useAtomValue(favoritesAtom)
  const markets = useMarkets((list) => list.filter((market) => favorites.includes(market.name)))
  return (
    <div className="flex h-8 shrink-0 items-center gap-4 overflow-x-auto px-3 text-xs whitespace-nowrap">
      <Star className="size-3.5 shrink-0 fill-primary text-primary" />
      {markets?.map((market) => {
        const change = changeOf(market).percent
        return (
          <button
            key={market.name}
            type="button"
            onClick={() => onSelect(market.name)}
            className={cn(
              "flex items-center gap-1.5",
              market.name === coin ? "text-foreground" : "text-muted-foreground",
            )}
          >
            {market.name}
            <span className="rounded-[3px] bg-primary/15 px-1 text-[10px] text-primary">{market.maxLeverage}x</span>
            <span className={change >= 0 ? "text-bid" : "text-ask"}>{formatSigned(change, 2)}%</span>
          </button>
        )
      })}
    </div>
  )
}
