import { connect, quantile, sleep, tickOf } from "./lib.mjs"

const conn = await connect()
const sent = new Map()
let id = 0
const request = (payload) => {
  id++
  sent.set(id, performance.now())
  conn.send({ method: "post", id, request: { type: "info", payload } })
}
for (let i = 0; i < 20; i++) {
  request({ type: "l2Book", coin: "BTC", ...(i % 2 ? { nSigFigs: 4 } : {}) })
  await sleep(500)
}
await sleep(1000)
conn.ws.close()
const replies = conn.log.filter((e) => e.msg?.channel === "post")
const rtt = replies.map((e) => e.t - sent.get(e.msg.data.id))
const books = replies.map((e) => e.msg.data.response.payload.data)
const times = books.filter((_, i) => i % 2 === 0).map((b) => b.time)
console.log(`replies ${replies.length}/20, round trip p50 ${quantile(rtt, 0.5)} ms p90 ${quantile(rtt, 0.9)} ms`)
console.log(
  `levels ${books[0].levels.map((s) => s.length).join("/")}, ticks full ${tickOf(books[0].levels)} / nSigFigs 4 ${tickOf(books[1].levels)}`,
)
console.log(`distinct snapshots at 1 s spacing: ${new Set(times).size}/${times.length}`)
console.log("sample:", replies[0].raw.slice(0, 160))
