import { feed } from "./feed"
import type { Bbo, Book, Coin, Level, Precision } from "./hyperliquid"
import { paced } from "./paced"

export type Row = { px: number; sz: number; total: number; totalUsd: number; flashAt: number; pulse: number }

export type BookView = { bids: Row[]; asks: Row[]; bid: number; ask: number }

export type Sources = { depth?: Book; fast?: Book; bbo?: Bbo }

export const EMPTY_VIEW: BookView = { bids: [], asks: [], bid: 0, ask: 0 }

type Layer = { time: number; rank: number; levels: [Level[], Level[]] }

function layersOf({ depth, fast, bbo }: Sources, withBbo: boolean) {
  const layers: Layer[] = []
  if (depth) layers.push({ time: depth.time, rank: 2, levels: depth.levels })
  if (fast) layers.push({ time: fast.time, rank: 1, levels: fast.levels })
  if (bbo && withBbo) {
    const [bid, ask] = bbo.bbo
    layers.push({ time: bbo.time, rank: 0, levels: [bid ? [bid] : [], ask ? [ask] : []] })
  }
  return layers.sort((a, b) => b.time - a.time || b.rank - a.rank)
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
    if (!changed) return { px, sz, total, totalUsd, flashAt: old?.flashAt ?? 0, pulse: old?.pulse ?? 0 }
    return { px, sz, total, totalUsd, flashAt: now, pulse: old ? Math.abs(sz - old.sz) / Math.max(sz, old.sz) : 1 }
  })
}

export function toView(sources: Sources, withBbo: boolean, previous: BookView, now: number): BookView {
  const layers = layersOf(sources, withBbo)
  const bids = rowsOf(0, merge(0, layers), previous.bids, now)
  const asks = rowsOf(1, merge(1, layers), previous.asks, now)
  const [bestBid, bestAsk] = sources.bbo?.bbo ?? []
  return {
    bids,
    asks,
    bid: bestBid ? Number(bestBid.px) : (bids[0]?.px ?? 0),
    ask: bestAsk ? Number(bestAsk.px) : (asks[0]?.px ?? 0),
  }
}

const DEPTH_MS = 500

export async function* bookFrames(coin: Coin, { nSigFigs, mantissa }: Precision, signal: AbortSignal) {
  const sources: Sources = {}
  const book = { type: "l2Book", coin, ...(nSigFigs && { nSigFigs }), ...(mantissa && { mantissa }) } as const
  const updates = paced(signal, (changed) => {
    const refresh = async () => {
      const depth = await feed.request<Book>(book)
      if (!depth || signal.aborted || depth.time <= (sources.depth?.time ?? 0)) return
      sources.depth = depth
      changed()
    }
    refresh()
    const timer = setInterval(refresh, DEPTH_MS)
    return [
      () => clearInterval(timer),
      feed.subscribe<Book>({ ...book, fast: true }, (fast) => {
        sources.fast = fast
        changed()
      }),
      feed.subscribe<Bbo>({ type: "bbo", coin }, (bbo) => {
        sources.bbo = bbo
        changed()
      }),
    ]
  })
  for await (const _ of updates) yield { ...sources }
}

export type Sweep = { total: number; totalUsd: number; avg: number; fromMid: number }

export function sweepOf(view: BookView, side: "asks" | "bids", px: number): Sweep | undefined {
  const row = view[side].find((level) => level.px === px)
  if (!row || !view.bid || !view.ask) return undefined
  const mid = (view.bid + view.ask) / 2
  const avg = row.totalUsd / row.total
  return { total: row.total, totalUsd: row.totalUsd, avg, fromMid: (Math.abs(avg - mid) / mid) * 100 }
}
