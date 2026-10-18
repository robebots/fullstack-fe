"use client"

import { cn } from "cn"
import Image from "next/image"
import { useState } from "react"

export function CoinIcon({ coin, className }: { coin: string; className?: string }) {
  const [failed, setFailed] = useState<string>()
  if (failed === coin)
    return (
      <span
        aria-hidden
        className={cn(
          "grid shrink-0 place-items-center rounded-full bg-accent text-[0.6em] font-medium text-foreground",
          className,
        )}
      >
        {coin.replace(/^k/, "").slice(0, 1)}
      </span>
    )
  return (
    <Image
      alt=""
      width={32}
      height={32}
      unoptimized
      src={`https://app.hyperliquid.xyz/coins/${coin}.svg`}
      onError={() => setFailed(coin)}
      className={cn("shrink-0 rounded-full", className)}
    />
  )
}
