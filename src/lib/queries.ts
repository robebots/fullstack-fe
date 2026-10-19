import { queryOptions, experimental_streamedQuery as streamedQuery, useQuery } from "@tanstack/react-query"
import { useAtomValue } from "jotai"
import { coinAtom, precisionAtom } from "./atoms"
import { type BookView, bookFrames, EMPTY_VIEW, type Sources, toView } from "./book"
import { live } from "./client"
import { type Coin, magnitudeOf, type Precision } from "./hyperliquid"
import { useMarket } from "./markets"
import { EMPTY_TAPE, type Print, toTape, tradeFrames } from "./trades"

const bookQuery = (coin: Coin, precision: Precision) =>
  queryOptions({
    queryKey: ["book", coin, precision.id],
    ...live,
    queryFn: streamedQuery({
      streamFn: ({ signal }) => bookFrames(coin, precision, signal),
      reducer: (view: BookView, sources: Sources) =>
        toView(sources, precision.nSigFigs === null, view, performance.now()),
      initialValue: EMPTY_VIEW,
    }),
  })

const tradesQuery = (coin: Coin) =>
  queryOptions({
    queryKey: ["trades", coin],
    ...live,
    queryFn: streamedQuery({
      streamFn: ({ signal }) => tradeFrames(coin, signal),
      reducer: toTape,
      initialValue: EMPTY_TAPE,
    }),
  })

export function useBook<T>(select: (view: BookView) => T) {
  const coin = useAtomValue(coinAtom)
  const precision = useAtomValue(precisionAtom)
  return useQuery({ ...bookQuery(coin, precision), select }).data
}

export function useTrades<T>(select: (tape: Print[]) => T) {
  const coin = useAtomValue(coinAtom)
  return useQuery({ ...tradesQuery(coin), select }).data
}

export function useMagnitude() {
  const coin = useAtomValue(coinAtom)
  const precision = useAtomValue(precisionAtom)
  return useQuery({
    ...bookQuery(coin, precision),
    select: (view) => (view.bid ? magnitudeOf(view.bid) : undefined),
    placeholderData: (previous, query) => (query?.queryKey[1] === coin ? previous : undefined),
  }).data
}

export const useSzDecimals = () => useMarket(useAtomValue(coinAtom))?.szDecimals ?? 0
