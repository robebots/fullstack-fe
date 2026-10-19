import { atom } from "jotai"
import { type Coin, PRECISIONS, type Precision } from "./hyperliquid"

export type Side = "asks" | "bids"

export type Mode = "tab" | "stacked" | "large"

export type Layout = "both" | "split" | "bids" | "asks"

export type Tab = "book" | "trades"

export const coinAtom = atom<Coin>("BTC")

export const precisionAtom = atom<Precision>(PRECISIONS[0])

export const unitAtom = atom<"coin" | "usd">("coin")

export const rowsAtom = atom(12)

export const modeAtom = atom<Mode>("tab")

export const layoutAtom = atom<Layout>("both")

export const tabAtom = atom<Tab>("book")

type Target = { side: Side; px: number }

type Box = { top: number; bottom: number; left: number; right: number }

export type Hover = { side: Side; slot: number; row: Box; widget: Box; swept: Box; edge: "top" | "bottom" }

export const selectedAtom = atom<Target | null>(null)

export const hoverAtom = atom<Hover | null>(null)

export const listenerAtom = atom<{ onModeChange?: (mode: Mode) => void }>({})

export const selectLevelAtom = atom(null, (get, set, level: Target) => {
  const current = get(selectedAtom)
  set(selectedAtom, current?.side === level.side && current.px === level.px ? null : level)
})

export const setModeAtom = atom(null, (get, set, mode: Mode) => {
  set(modeAtom, mode)
  get(listenerAtom).onModeChange?.(mode)
})
