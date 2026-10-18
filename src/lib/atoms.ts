import { atom } from "jotai"
import { feed, type Status } from "./feed"
import { type Coin, PRECISIONS, type Precision } from "./hyperliquid"

export const coinAtom = atom<Coin>("BTC")

export const precisionAtom = atom<Precision>(PRECISIONS[0])

export const unitAtom = atom<"coin" | "usd">("coin")

export const statusAtom = atom<Status>("connecting")

export const rowsAtom = atom(12)

export type Level = { side: "asks" | "bids"; px: number }

export type PriceSelection = { coin: Coin; side: "buy" | "sell"; price: number }

export const selectedAtom = atom<Level | null>(null)

export const listenerAtom = atom<{ onPriceSelect?: (selection: PriceSelection) => void }>({})

export const selectLevelAtom = atom(null, (get, set, level: Level) => {
  const current = get(selectedAtom)
  const again = current?.side === level.side && current.px === level.px
  set(selectedAtom, again ? null : level)
  if (!again)
    get(listenerAtom).onPriceSelect?.({
      coin: get(coinAtom),
      side: level.side === "asks" ? "buy" : "sell",
      price: level.px,
    })
})

statusAtom.onMount = (set) => feed.onStatus(set)
