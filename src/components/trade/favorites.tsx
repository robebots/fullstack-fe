"use client"

import { cn } from "cn"
import { useAtomValue } from "jotai"
import { Star } from "lucide-react"
import { formatSigned } from "@/lib/format"
import { changeOf, type Market, useMarkets } from "@/lib/markets"
import { favoritesAtom } from "@/lib/prefs"
import { bone } from "../styles"

export function Favorites({ coin, onSelect }: { coin: string; onSelect: (coin: string) => void }) {
  const favorites = useAtomValue(favoritesAtom)
  const markets = useMarkets((list) => new Map(list.map((market): [string, Market] => [market.name, market])))
  return (
    <div className="flex h-8 min-w-0 flex-1 items-center gap-4 overflow-x-auto px-3 text-xs whitespace-nowrap pointer-coarse:h-10">
      <Star className="size-3.5 shrink-0 fill-primary text-primary" />
      {favorites.map((name) => {
        const market = markets?.get(name)
        if (markets && !market) return null
        const change = market && changeOf(market).percent
        return (
          <button
            key={name}
            type="button"
            onClick={() => onSelect(name)}
            className={cn(
              "flex h-full items-center gap-1.5",
              name === coin ? "text-foreground" : "text-muted-foreground",
            )}
          >
            {name}
            {market && change !== undefined ? (
              <>
                <span className="rounded-cell bg-primary/15 px-1 text-[10px] text-primary">{market.maxLeverage}x</span>
                <span className={change >= 0 ? "text-bid" : "text-ask"}>{formatSigned(change, 2)}%</span>
              </>
            ) : (
              <span aria-hidden className={cn(bone, "w-16")} />
            )}
          </button>
        )
      })}
    </div>
  )
}
