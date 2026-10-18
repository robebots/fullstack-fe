import { atom } from "jotai"
import { feed, type Status } from "./feed"
import { type Coin, PRECISIONS, type Precision } from "./hyperliquid"

export const coinAtom = atom<Coin>("BTC")

export const precisionAtom = atom<Precision>(PRECISIONS[0])

export const unitAtom = atom<"coin" | "usd">("coin")

export const statusAtom = atom<Status>("connecting")

statusAtom.onMount = (set) => feed.onStatus(set)
