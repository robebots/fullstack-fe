import { connect, quantile, sleep } from "./lib.mjs"

const coin = process.argv[2] ?? "BTC"
const seconds = Number(process.argv[3] ?? 30)

const slow = await connect()
const fast = await connect()
const misc = await connect()
slow.subscribe({ type: "l2Book", coin })
fast.subscribe({ type: "l2Book", coin, fast: true })
for (const type of ["bbo", "trades", "activeAssetCtx"]) misc.subscribe({ type, coin })

const restTimes = []
const poll = setInterval(async () => {
  const book = await fetch("https://api.hyperliquid.xyz/info", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ type: "l2Book", coin }),
  })
    .then((r) => r.json())
    .catch(() => undefined)
  if (book) restTimes.push(book.time)
}, 500)

await sleep(seconds * 1000)
clearInterval(poll)
for (const conn of [slow, fast, misc]) conn.ws.close()

const on = (conn, channel) => conn.log.filter((e) => e.msg?.channel === channel)
const levels = (entries) =>
  entries
    .at(-1)
    ?.msg.data.levels.map((side) => side.length)
    .join("/")

function row(feed, entries, extra = {}) {
  const gaps = entries.slice(1).map((e, i) => e.t - entries[i].t)
  return {
    feed,
    msgs: entries.length,
    perSec: Number((entries.length / seconds).toFixed(2)),
    gapP10ms: quantile(gaps, 0.1),
    gapP50ms: quantile(gaps, 0.5),
    gapP90ms: quantile(gaps, 0.9),
    gapMaxMs: quantile(gaps, 1),
    ...extra,
  }
}

const slowBooks = on(slow, "l2Book")
const fastBooks = on(fast, "l2Book")
const trades = on(misc, "trades")
console.log(`${coin}, ${seconds}s`)
console.table([
  row("l2Book", slowBooks, { levels: levels(slowBooks) }),
  row("l2Book fast", fastBooks, { levels: levels(fastBooks) }),
  row("bbo", on(misc, "bbo")),
  row("trades", trades, { firstBatch: trades[0]?.msg.data.length }),
  row("activeAssetCtx", on(misc, "activeAssetCtx")),
])
const distinct = [...new Set(restTimes)].sort((a, b) => a - b)
const steps = distinct.slice(1).map((t, i) => t - distinct[i])
console.log(
  `REST /info l2Book every 500 ms: ${restTimes.length} polls, ${distinct.length} distinct snapshots, data.time step p50 ${quantile(steps, 0.5)} ms`,
)
console.log("ack:", slow.log.find((e) => e.msg?.channel === "subscriptionResponse")?.raw)
console.log("fast data keys:", Object.keys(fastBooks.at(-1)?.msg.data ?? {}).join(", "))
console.log(
  "wall clock minus data.time, p50 ms:",
  quantile(
    fastBooks.map((e) => e.wall - e.msg.data.time),
    0.5,
  ),
)
