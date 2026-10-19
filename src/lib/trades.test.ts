import { expect, test } from "vitest"
import type { Trade } from "./hyperliquid"
import { toTape } from "./trades"

const trade = (tid: number, side: "A" | "B", px: number, sz: number, time = 1, taker = "0xtaker"): Trade => ({
  coin: "BTC",
  side,
  px: String(px),
  sz: String(sz),
  time,
  tid,
  hash: `0x${tid}`,
  users: side === "B" ? [taker, "0xmaker"] : ["0xmaker", taker],
})

test("one taker's fills at one price in one block merge into one print", () => {
  const [print, ...rest] = toTape([], [trade(1, "B", 100, 1), trade(2, "B", 100, 2)])
  expect(rest).toHaveLength(0)
  expect(print).toMatchObject({ sz: 3, tids: [1, 2], buy: true })
})

test("fills from different takers, sides or blocks stay apart", () => {
  const tape = toTape(
    [],
    [
      trade(1, "B", 100, 1),
      trade(2, "B", 100, 1, 1, "0xother"),
      trade(3, "A", 100, 1, 1, "0xother"),
      trade(4, "A", 100, 1, 2, "0xother"),
    ],
  )
  expect(tape.map((print) => print.tids)).toEqual([[4], [3], [2], [1]])
})

test("prints are newest first and only later batches are marked fresh", () => {
  const first = toTape([], [trade(1, "B", 100, 1)])
  const second = toTape(first, [trade(2, "A", 99, 1, 2)])
  expect(second.map((print) => [print.id, print.fresh])).toEqual([
    [2, true],
    [1, false],
  ])
})

test("a reconnect's replay is skipped by trade id even when ids arrive out of order", () => {
  const tape = toTape([], [trade(5, "B", 100, 1, 1), trade(3, "A", 99, 1, 2)])
  const replayed = toTape(tape, [trade(3, "A", 99, 1, 2), trade(5, "B", 100, 1, 1), trade(7, "B", 101, 1, 3)])
  expect(replayed.map((print) => print.id)).toEqual([7, 3, 5])
})

test("a zero hash gets no explorer link", () => {
  const [print] = toTape([], [{ ...trade(1, "B", 100, 1), hash: `0x${"0".repeat(64)}` }])
  expect(print.hash).toBeUndefined()
})

test("the tape keeps the latest 40 prints", () => {
  const tape = toTape(
    [],
    Array.from({ length: 50 }, (_, i) => trade(i, "B", 100 + i, 1, i)),
  )
  expect(tape).toHaveLength(40)
  expect(tape[0].id).toBe(49)
})
