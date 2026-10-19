import { feed } from "./feed"
import type { Coin, Trade } from "./hyperliquid"
import { paced } from "./paced"

export type Print = {
  id: number
  tids: number[]
  px: number
  sz: number
  buy: boolean
  time: number
  taker: string
  hash?: string
  fresh: boolean
}

export const EMPTY_TAPE: Print[] = []

const TAPE_LENGTH = 40

const NO_HASH = /^0x0*$/

export function toTape(tape: Print[], batch: Trade[]) {
  const known = new Set(tape.flatMap((print) => print.tids))
  const prints: Print[] = []
  for (const trade of batch) {
    if (known.has(trade.tid)) continue
    const px = Number(trade.px)
    const buy = trade.side === "B"
    const taker = trade.users[buy ? 0 : 1]
    const last = prints.at(-1)
    if (last?.buy === buy && last.px === px && last.time === trade.time && last.taker === taker) {
      last.sz += Number(trade.sz)
      last.tids.push(trade.tid)
    } else
      prints.push({
        id: trade.tid,
        tids: [trade.tid],
        px,
        sz: Number(trade.sz),
        buy,
        time: trade.time,
        taker,
        hash: NO_HASH.test(trade.hash) ? undefined : trade.hash,
        fresh: tape.length > 0,
      })
  }
  return prints.length ? [...prints.reverse(), ...tape].slice(0, TAPE_LENGTH) : tape
}

export async function* tradeFrames(coin: Coin, signal: AbortSignal) {
  let pending: Trade[] = []
  const updates = paced(signal, (changed) => [
    feed.subscribe<Trade[]>({ type: "trades", coin }, (trades) => {
      pending = pending.concat(trades)
      changed()
    }),
  ])
  for await (const _ of updates) {
    const batch = pending
    pending = []
    yield batch
  }
}
