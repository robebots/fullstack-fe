import { connect, sleep } from "./lib.mjs"

const coin = process.argv[2] ?? "BTC"
const conn = await connect()
conn.subscribe({ type: "bbo", coin })
conn.subscribe({ type: "trades", coin })
await sleep(Number(process.argv[3] ?? 20) * 1000)
conn.ws.close()

const messages = conn.log.filter((e) => e.msg?.channel === "trades" || e.msg?.channel === "bbo")
const snapshot = messages.find((e) => e.msg.channel === "trades")?.msg.data ?? []
const times = snapshot.map((t) => t.time)
console.log(`snapshot: ${snapshot.length} trades, ${times[0] <= times.at(-1) ? "oldest first" : "newest first"}`)

let bbo
const tally = { B: { atAsk: 0, atBid: 0, inside: 0 }, A: { atAsk: 0, atBid: 0, inside: 0 } }
let live = 0
let batches = 0
let sameKey = 0
for (const e of messages.slice(1)) {
  if (e.msg.channel === "bbo") {
    bbo = e.msg.data.bbo
    continue
  }
  batches++
  const trades = e.msg.data
  for (let i = 0; i < trades.length; i++) {
    const t = trades[i]
    const previous = trades[i - 1]
    if (previous && previous.side === t.side && previous.px === t.px && previous.time === t.time) sameKey++
    live++
    if (!bbo?.[0] || !bbo?.[1]) continue
    const px = Number(t.px)
    const where = px >= Number(bbo[1].px) ? "atAsk" : px <= Number(bbo[0].px) ? "atBid" : "inside"
    tally[t.side][where]++
  }
}
console.log(
  `live: ${live} trades in ${batches} messages, ${sameKey} share side+px+time with the previous trade in the same message`,
)
console.log("side vs touch at print time:", JSON.stringify(tally))
