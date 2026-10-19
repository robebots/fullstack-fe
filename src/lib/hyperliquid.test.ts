import { expect, test } from "vitest"
import { magnitudeOf, PRECISIONS, precisionOptions, priceDecimals, tickSize } from "./hyperliquid"

const precision = (id: string) => PRECISIONS.find((option) => option.id === id) ?? PRECISIONS[0]

test("full precision ticks at five significant figures, capped by size decimals", () => {
  expect(tickSize(precision("full"), magnitudeOf(81_000), 5)).toBe(1)
  expect(tickSize(precision("full"), magnitudeOf(2_364.5), 4)).toBeCloseTo(0.1)
  expect(tickSize(precision("full"), magnitudeOf(0.5), 0)).toBeCloseTo(0.00001)
})

test("grouped precisions tick at their significant figures times the mantissa", () => {
  const ticks = ["4", "5x2", "5x5", "3", "2"].map((id) => tickSize(precision(id), magnitudeOf(81_000), 5))
  expect(ticks).toEqual([10, 2, 5, 100, 1_000])
})

test("precision options collapse ticks that come out the same", () => {
  const options = precisionOptions(magnitudeOf(81_000), 5)
  expect(options.map((option) => [option.precision.id, option.tick])).toEqual([
    ["full", 1],
    ["5x2", 2],
    ["5x5", 5],
    ["4", 10],
    ["3", 100],
    ["2", 1_000],
  ])
})

test("before a price arrives every precision is offered without a tick", () => {
  expect(precisionOptions(undefined, 5).map((option) => option.tick)).toEqual(PRECISIONS.map(() => undefined))
})

test("prices show the decimals of their full-precision tick", () => {
  expect(priceDecimals(81_000, 5)).toBe(0)
  expect(priceDecimals(2_364.5, 4)).toBe(1)
  expect(priceDecimals(0.5, 0)).toBe(5)
})
