import { queryOptions, experimental_streamedQuery as streamedQuery, useQuery } from "@tanstack/react-query"
import { live } from "./client"
import { feed } from "./feed"
import type { Coin } from "./hyperliquid"
import { paced } from "./paced"

export type Stats = {
  mark: number
  oracle: number
  mid?: number
  prevDay: number
  volume: number
  openInterest: number
  funding: number
}

export type Market = Stats & { name: Coin; szDecimals: number; maxLeverage: number; delisted: boolean }

type Context = {
  markPx: string
  oraclePx: string
  midPx: string | null
  prevDayPx: string
  dayNtlVlm: string
  openInterest: string
  funding: string
}

type Listing = { name: string; szDecimals: number; maxLeverage: number; isDelisted?: boolean }

const INFO_URL = "https://api.hyperliquid.xyz/info"

function statsOf(context: Context): Stats {
  const mark = Number(context.markPx)
  return {
    mark,
    oracle: Number(context.oraclePx),
    mid: context.midPx === null ? undefined : Number(context.midPx),
    prevDay: Number(context.prevDayPx),
    volume: Number(context.dayNtlVlm),
    openInterest: Number(context.openInterest) * mark,
    funding: Number(context.funding),
  }
}

const marketsQuery = queryOptions({
  queryKey: ["markets"],
  queryFn: async ({ signal }) => {
    const response = await fetch(INFO_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: "metaAndAssetCtxs" }),
      signal,
    })
    if (!response.ok) throw new Error(`The market list failed with ${response.status}`)
    const [meta, contexts] = (await response.json()) as [{ universe: Listing[] }, Context[]]
    return meta.universe.map(
      (listing, index): Market => ({
        name: listing.name,
        szDecimals: listing.szDecimals,
        maxLeverage: listing.maxLeverage,
        delisted: listing.isDelisted === true,
        ...statsOf(contexts[index]),
      }),
    )
  },
  staleTime: 10_000,
  retry: 2,
})

export function useMarkets<T>(select: (markets: Market[]) => T, live = false) {
  return useQuery({ ...marketsQuery, select, refetchInterval: live ? 5_000 : false }).data
}

export const useMarket = (coin: Coin) => useMarkets((markets) => markets.find((market) => market.name === coin))

export function useListing(coin: Coin) {
  const { data, isError, refetch } = useQuery({
    ...marketsQuery,
    select: (markets) => markets.some((market) => market.name === coin),
  })
  return { listed: data, failed: isError, retry: () => refetch() }
}

async function* statsFrames(coin: Coin, signal: AbortSignal) {
  let latest: Context | undefined
  const updates = paced(signal, (changed) => [
    feed.subscribe<{ ctx: Context }>({ type: "activeAssetCtx", coin }, ({ ctx }) => {
      latest = ctx
      changed()
    }),
  ])
  for await (const _ of updates) if (latest) yield statsOf(latest)
}

const statsQuery = (coin: Coin) =>
  queryOptions({
    queryKey: ["stats", coin],
    ...live,
    queryFn: streamedQuery({
      streamFn: ({ signal }) => statsFrames(coin, signal),
      reducer: (_: Stats | null, next: Stats) => next,
      initialValue: null,
    }),
  })

export function useStats(coin: Coin): Stats | undefined {
  const listed = useMarket(coin)
  const live = useQuery({ ...statsQuery(coin), enabled: listed !== undefined }).data
  return live ?? listed
}

export const changeOf = ({ mark, prevDay }: Stats) => ({
  value: mark - prevDay,
  percent: prevDay ? ((mark - prevDay) / prevDay) * 100 : 0,
})
