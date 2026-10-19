import type { Side } from "./atoms"
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

export const MAX_ROWS = 12

const DEPTH_MS = 500

const REFRESH_MS = 200

const HOLD_MS = 1000

const touchOf = (source: Book | Bbo) => ("bbo" in source ? source.bbo : [source.levels[0][0], source.levels[1][0]])

export function stale({ depth, fast, bbo }: Sources) {
  if (!depth) return false
  const bid = Number(depth.levels[0][0]?.px ?? Number.NEGATIVE_INFINITY)
  const ask = Number(depth.levels[1][0]?.px ?? Number.POSITIVE_INFINITY)
  return [fast, bbo].some((source) => {
    if (!source || source.time <= depth.time) return false
    const [best, offer] = touchOf(source)
    return (best && Number(best.px) < bid) || (offer && Number(offer.px) > ask)
  })
}

export function thin(sources: Sources, withBbo: boolean) {
  const { depth } = sources
  if (!depth) return true
  const layers = layersOf(sources, withBbo)
  return ([0, 1] as const).some((side) => merge(side, layers).length < Math.min(MAX_ROWS, depth.levels[side].length))
}

export async function* bookFrames(coin: Coin, { nSigFigs, mantissa }: Precision, signal: AbortSignal) {
  const sources: Sources = {}
  let shown: Sources = {}
  const book = { type: "l2Book", coin, ...(nSigFigs && { nSigFigs }), ...(mantissa && { mantissa }) } as const
  const updates = paced(signal, (changed) => {
    let pending = false
    let hold: ReturnType<typeof setTimeout> | undefined
    let expired = false
    const take = () => {
      if (stale(sources)) refresh()
      if (!thin(sources, !nSigFigs)) {
        clearTimeout(hold)
        hold = undefined
        expired = false
      } else if (!expired) {
        hold ??= setTimeout(() => {
          expired = true
          take()
        }, HOLD_MS)
        return
      }
      shown = { ...sources }
      changed()
    }
    let requestedAt = Number.NEGATIVE_INFINITY
    const refresh = async () => {
      if (pending || performance.now() - requestedAt < REFRESH_MS) return
      pending = true
      requestedAt = performance.now()
      const depth = await feed.request<Book>(book)
      pending = false
      if (!depth || signal.aborted || depth.time <= (sources.depth?.time ?? 0)) return
      sources.depth = depth
      take()
    }
    refresh()
    const timer = setInterval(refresh, DEPTH_MS)
    return [
      () => {
        clearInterval(timer)
        clearTimeout(hold)
      },
      feed.subscribe<Book>({ ...book, fast: true }, (fast) => {
        sources.fast = fast
        take()
      }),
      feed.subscribe<Bbo>({ type: "bbo", coin }, (bbo) => {
        sources.bbo = bbo
        take()
      }),
    ]
  })
  for await (const _ of updates) yield shown
}

export const depthOf = (rows: Row[], count: number) => rows[Math.min(rows.length, count) - 1]?.total ?? 0

const niceCeil = (value: number) => {
  if (value <= 0) return 1
  const step = 10 ** Math.floor(Math.log10(value))
  return [1, 2, 5, 10].map((m) => m * step).find((ceiling) => ceiling >= value) ?? value
}

export function rescale(scale: number, deepest: number) {
  if (deepest > scale) return niceCeil(deepest)
  const roomy = niceCeil(deepest * 1.25)
  return roomy < scale ? roomy : scale
}

type Sweep = { total: number; totalUsd: number; avg: number; fromMid: number }

export function sweepOf(view: BookView, side: Side, px: number): Sweep | undefined {
  const row = view[side].find((level) => level.px === px)
  if (!row || !view.bid || !view.ask) return undefined
  const mid = (view.bid + view.ask) / 2
  const avg = row.totalUsd / row.total
  return { total: row.total, totalUsd: row.totalUsd, avg, fromMid: (Math.abs(avg - mid) / mid) * 100 }
}
