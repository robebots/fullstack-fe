import { describe, expect, test } from "vitest"
import { EMPTY_VIEW, rescale, stale, sweepOf, thin, toView } from "./book"
import type { Bbo, Book, Level } from "./hyperliquid"

type Quote = [px: number, sz: number]

const level = ([px, sz]: Quote): Level => ({ px: String(px), sz: String(sz), n: 1 })

const ladder = (best: number, step: number, count: number, sz = 1) =>
  Array.from({ length: count }, (_, i): Quote => [best + i * step, sz])

const book = (time: number, bids: Quote[], asks: Quote[]): Book => ({
  coin: "BTC",
  time,
  levels: [bids.map(level), asks.map(level)],
})

const bbo = (time: number, bid: Quote, ask: Quote): Bbo => ({ coin: "BTC", time, bbo: [level(bid), level(ask)] })

const depth = book(1, ladder(100, -1, 20), ladder(101, 1, 20))

describe("toView", () => {
  test("totals accumulate from the touch outward", () => {
    const view = toView({ depth }, true, EMPTY_VIEW, 0)
    expect(view.bids.slice(0, 3).map((row) => row.total)).toEqual([1, 2, 3])
    expect(view.asks[2]).toMatchObject({ px: 103, total: 3, totalUsd: 101 + 102 + 103 })
    expect([view.bid, view.ask]).toEqual([100, 101])
  })

  test("the newest source owns the prices it covers and older levels fill in past its edge", () => {
    const fast = book(2, ladder(100, -1, 5, 9), ladder(101, 1, 5, 9))
    const view = toView({ depth, fast, bbo: bbo(3, [98, 4], [101, 9]) }, true, EMPTY_VIEW, 0)
    expect(view.bids.slice(0, 4).map((row) => [row.px, row.sz])).toEqual([
      [98, 4],
      [97, 9],
      [96, 9],
      [95, 1],
    ])
  })

  test("an older source loses to a newer one", () => {
    const fast = book(2, ladder(100, -1, 5, 9), ladder(101, 1, 5, 9))
    const view = toView({ depth, fast, bbo: bbo(0, [98, 4], [101, 9]) }, true, EMPTY_VIEW, 0)
    expect(view.bids[0]).toMatchObject({ px: 100, sz: 9 })
  })

  test("grouped books leave bbo out of the rows but the touch still reads it", () => {
    const view = toView({ depth, bbo: bbo(3, [98, 4], [101, 9]) }, false, EMPTY_VIEW, 0)
    expect(view.bids[0].px).toBe(100)
    expect(view.bid).toBe(98)
  })

  test("a size change flashes with a pulse scaled to the change and other rows keep their mark", () => {
    const first = toView({ depth }, true, EMPTY_VIEW, 10)
    const next = book(2, [[100, 4], ...ladder(99, -1, 19)], ladder(101, 1, 20))
    const view = toView({ depth: next }, true, first, 20)
    expect(view.bids[0]).toMatchObject({ flashAt: 20, pulse: 0.75 })
    expect(view.bids[1].flashAt).toBe(0)
  })

  test("a level that appears inside the book flashes at full strength and one revealed past the edge doesn't", () => {
    const asks = ladder(101, 1, 20)
    const first = toView(
      {
        depth: book(
          1,
          [
            [100, 1],
            [98, 1],
          ],
          asks,
        ),
      },
      true,
      EMPTY_VIEW,
      10,
    )
    const view = toView(
      {
        depth: book(
          2,
          [
            [100, 1],
            [99, 2],
            [98, 1],
            [97, 1],
          ],
          asks,
        ),
      },
      true,
      first,
      20,
    )
    expect(view.bids[1]).toMatchObject({ px: 99, flashAt: 20, pulse: 1 })
    expect(view.bids[3]).toMatchObject({ px: 97, flashAt: 0 })
  })
})

describe("stale", () => {
  test("a newer touch past the snapshot's best price makes it stale", () => {
    expect(stale({ depth, bbo: bbo(2, [99, 1], [104, 1]) })).toBe(true)
    expect(stale({ depth, fast: book(2, ladder(97, -1, 5), ladder(98, 1, 5)) })).toBe(true)
  })

  test("a touch inside the snapshot, or an older one, doesn't", () => {
    expect(stale({ depth, bbo: bbo(2, [100, 1], [101, 1]) })).toBe(false)
    expect(stale({ depth, bbo: bbo(0, [90, 1], [110, 1]) })).toBe(false)
  })
})

describe("thin", () => {
  test("holds until the first snapshot", () => {
    expect(thin({ bbo: bbo(2, [100, 1], [101, 1]) }, true)).toBe(true)
  })

  test("a full snapshot is never thin", () => {
    expect(thin({ depth }, true)).toBe(false)
  })

  test("a newer touch that eats the snapshot leaves a side thin", () => {
    expect(thin({ depth, bbo: bbo(2, [113, 1], [114, 1]) }, true)).toBe(true)
  })

  test("a market with fewer levels than rows isn't thin at its own size", () => {
    expect(thin({ depth: book(1, ladder(100, -1, 5), ladder(101, 1, 5)) }, true)).toBe(false)
  })
})

describe("rescale", () => {
  test("starts at the 1-2-5 step that fits", () => {
    expect(rescale(0, 3.2)).toBe(5)
  })

  test("grows at once when the deepest total overflows", () => {
    expect(rescale(20, 21)).toBe(50)
  })

  test("holds through a dip that wouldn't fit the smaller step with 25% to spare", () => {
    expect(rescale(50, 19)).toBe(50)
  })

  test("steps down once the totals fit with room", () => {
    expect(rescale(50, 15)).toBe(20)
  })
})

describe("sweepOf", () => {
  const view = toView({ depth }, true, EMPTY_VIEW, 0)

  test("prices a market order that sweeps to a level", () => {
    const sweep = sweepOf(view, "bids", 98)
    expect(sweep).toMatchObject({ total: 3, totalUsd: 297, avg: 99 })
    expect(sweep?.fromMid).toBeCloseTo((1.5 / 100.5) * 100)
  })

  test("is undefined for a price that isn't in the book", () => {
    expect(sweepOf(view, "bids", 150)).toBeUndefined()
  })
})
