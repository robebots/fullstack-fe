import { atom } from "jotai"
import { feed, type Status } from "./feed"
import { type Coin, PRECISIONS, type Precision } from "./hyperliquid"

export type Side = "asks" | "bids"

export type Mode = "tab" | "stacked" | "large"

export type Layout = "both" | "split" | "bids" | "asks"

export type Tab = "book" | "trades"

export const coinAtom = atom<Coin>("BTC")

export const precisionAtom = atom<Precision>(PRECISIONS[0])

export const unitAtom = atom<"coin" | "usd">("coin")

export const statusAtom = atom<Status>("connecting")

export const rowsAtom = atom(12)

export const modeAtom = atom<Mode>("tab")

export const layoutAtom = atom<Layout>("both")

export const tabAtom = atom<Tab>("book")

export type Level = { side: Side; px: number }

export type Box = { top: number; bottom: number; left: number; right: number }

export type Hover = Level & { row: Box; widget: Box; swept: Box; edge: "top" | "bottom" }

export type PriceSelection = { coin: Coin; side: "buy" | "sell"; price: number }

export const selectedAtom = atom<Level | null>(null)

export const hoverAtom = atom<Hover | null>(null)

export const listenerAtom = atom<{
  onPriceSelect?: (selection: PriceSelection) => void
  onModeChange?: (mode: Mode) => void
}>({})

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

export const setModeAtom = atom(null, (get, set, mode: Mode) => {
  set(modeAtom, mode)
  get(listenerAtom).onModeChange?.(mode)
})

statusAtom.onMount = (set) => feed.onStatus(set)
