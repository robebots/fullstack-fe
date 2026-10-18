import { queryOptions, experimental_streamedQuery as streamedQuery, useQuery } from "@tanstack/react-query"
import { useAtomValue } from "jotai"
import { coinAtom, precisionAtom } from "./atoms"
import { type BookView, EMPTY_VIEW, frames, type Sources, toView } from "./book"
import { type Coin, magnitudeOf, type Precision } from "./hyperliquid"

export const bookQuery = (coin: Coin, precision: Precision) =>
  queryOptions({
    queryKey: ["book", coin, precision.id],
    queryFn: streamedQuery({
      streamFn: ({ signal }) => frames(coin, precision, signal),
      reducer: (view: BookView, sources: Sources) =>
        toView(sources, precision.nSigFigs === null, view, performance.now()),
      initialValue: EMPTY_VIEW,
    }),
  })

export function useBook<T>(select: (view: BookView) => T) {
  const coin = useAtomValue(coinAtom)
  const precision = useAtomValue(precisionAtom)
  return useQuery({ ...bookQuery(coin, precision), select }).data
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
