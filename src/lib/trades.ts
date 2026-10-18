import { feed } from "./feed"
import type { Coin, Trade } from "./hyperliquid"
import { paced } from "./paced"

export type Print = { id: number; px: number; sz: number; buy: boolean; time: number; hash: string; fresh: boolean }

export const EMPTY_TAPE: Print[] = []

const TAPE_LENGTH = 40

export function toTape(tape: Print[], batch: Trade[]) {
  const prints: Print[] = []
  for (const trade of batch) {
    const px = Number(trade.px)
    const buy = trade.side === "B"
    const last = prints.at(-1)
    if (last?.buy === buy && last.px === px && last.time === trade.time) last.sz += Number(trade.sz)
    else
      prints.push({
        id: trade.tid,
        px,
        sz: Number(trade.sz),
        buy,
        time: trade.time,
        hash: trade.hash,
        fresh: tape.length > 0,
      })
  }
  return [...prints.reverse(), ...tape].slice(0, TAPE_LENGTH)
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
