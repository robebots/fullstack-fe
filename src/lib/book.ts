import { feed } from "./feed"
import type { Bbo, Book, Coin, Level, Precision } from "./hyperliquid"

export type Row = { px: number; sz: number; total: number; totalUsd: number; flashAt: number }

export type BookView = { bids: Row[]; asks: Row[]; bid: number; ask: number; trend: 1 | -1 }

export type Sources = { slow?: Book; fast?: Book; bbo?: Bbo }

export const EMPTY_VIEW: BookView = { bids: [], asks: [], bid: 0, ask: 0, trend: 1 }

const PUBLISH_MS = 50

type Layer = { time: number; depth: number; levels: [Level[], Level[]] }

function layersOf({ slow, fast, bbo }: Sources, withBbo: boolean) {
  const layers: Layer[] = []
  if (slow) layers.push({ time: slow.time, depth: 2, levels: slow.levels })
  if (fast) layers.push({ time: fast.time, depth: 1, levels: fast.levels })
  if (bbo && withBbo) {
    const [bid, ask] = bbo.bbo
    layers.push({ time: bbo.time, depth: 0, levels: [bid ? [bid] : [], ask ? [ask] : []] })
  }
  return layers.sort((a, b) => b.time - a.time || b.depth - a.depth)
}

const beyond = (side: 0 | 1, px: number, edge: number) => (side === 0 ? px < edge : px > edge)

function merge(side: 0 | 1, layers: Layer[]) {
  const merged: Level[] = []
  for (const layer of layers) {
    const edge = merged.at(-1)
    for (const level of layer.levels[side]) {
      if (!edge || beyond(side, Number(level.px), Number(edge.px))) merged.push(level)
    }
  }
  return merged
}

function rowsOf(side: 0 | 1, levels: Level[], previous: Row[], now: number) {
  const before = new Map(previous.map((row) => [row.px, row]))
  const edge = previous.at(-1)?.px
  let total = 0
  let totalUsd = 0
  return levels.map((level): Row => {
    const px = Number(level.px)
    const sz = Number(level.sz)
    total += sz
    totalUsd += px * sz
    const old = before.get(px)
    const changed = old ? old.sz !== sz : edge !== undefined && !beyond(side, px, edge)
    return { px, sz, total, totalUsd, flashAt: changed ? now : (old?.flashAt ?? 0) }
  })
}

export function toView(sources: Sources, withBbo: boolean, previous: BookView, now: number): BookView {
  const layers = layersOf(sources, withBbo)
  const bids = rowsOf(0, merge(0, layers), previous.bids, now)
  const asks = rowsOf(1, merge(1, layers), previous.asks, now)
  const [bestBid, bestAsk] = sources.bbo?.bbo ?? []
  const bid = bestBid ? Number(bestBid.px) : (bids[0]?.px ?? 0)
  const ask = bestAsk ? Number(bestAsk.px) : (asks[0]?.px ?? 0)
  const mid = bid + ask
  const before = previous.bid + previous.ask
  return { bids, asks, bid, ask, trend: mid === before ? previous.trend : mid > before ? 1 : -1 }
}

export async function* frames(coin: Coin, { nSigFigs, mantissa }: Precision, signal: AbortSignal) {
  const sources: Sources = {}
  let dirty = false
  let wake = () => {}
  const update = (patch: Sources) => {
    Object.assign(sources, patch)
    dirty = true
    wake()
  }
  const book = { type: "l2Book", coin, ...(nSigFigs && { nSigFigs }), ...(mantissa && { mantissa }) } as const
  const stops = [
    feed.subscribe<Book>(book, (slow) => update({ slow })),
    feed.subscribe<Book>({ ...book, fast: true }, (fast) => update({ fast })),
    feed.subscribe<Bbo>({ type: "bbo", coin }, (bbo) => update({ bbo })),
  ]
  signal.addEventListener("abort", () => wake(), { once: true })
  let published = Number.NEGATIVE_INFINITY
  try {
    while (!signal.aborted) {
      if (!dirty) await new Promise<void>((resolve) => (wake = resolve))
      const wait = published + PUBLISH_MS - performance.now()
      if (wait > 0) await new Promise((resolve) => setTimeout(resolve, wait))
      await new Promise<number>(requestAnimationFrame)
      if (signal.aborted) return
      dirty = false
      published = performance.now()
      yield { ...sources }
    }
  } finally {
    for (const stop of stops) stop()
  }
}
