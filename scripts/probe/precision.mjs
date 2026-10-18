import { connect, subKey, tickOf } from "./lib.mjs"

const SETTINGS = [
  { label: "full", params: {} },
  { label: "5", params: { nSigFigs: 5 } },
  { label: "5 m2", params: { nSigFigs: 5, mantissa: 2 } },
  { label: "5 m5", params: { nSigFigs: 5, mantissa: 5 } },
  { label: "4", params: { nSigFigs: 4 } },
  { label: "3", params: { nSigFigs: 3 } },
  { label: "2", params: { nSigFigs: 2 } },
]

const meta = await fetch("https://api.hyperliquid.xyz/info", {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ type: "meta" }),
}).then((r) => r.json())
const szDecimals = Object.fromEntries(meta.universe.map((a) => [a.name, a.szDecimals]))

const clean = (x) => (x === null ? null : Number(x.toPrecision(6)))

function predictedTick(mid, { nSigFigs, mantissa = 1 }, szDec) {
  const magnitude = Math.floor(Math.log10(mid))
  if (!nSigFigs) return Math.min(1, Math.max(10 ** (magnitude - 4), 10 ** -(6 - szDec)))
  return 10 ** (magnitude + 1 - nSigFigs) * mantissa
}

function nextSnapshot(conn, sub) {
  return new Promise((resolve, reject) => {
    let acked = false
    const onMessage = (ev) => {
      const msg = JSON.parse(String(ev.data))
      const isAck =
        msg.channel === "subscriptionResponse" &&
        msg.data.method === "subscribe" &&
        subKey(msg.data.subscription) === subKey(sub)
      if (isAck) acked = true
      else if (acked && msg.channel === "l2Book") finish(null, msg.data)
    }
    const timer = setTimeout(() => finish(new Error(`no snapshot for ${subKey(sub)}`)), 5000)
    function finish(err, data) {
      clearTimeout(timer)
      conn.ws.removeEventListener("message", onMessage)
      if (err) reject(err)
      else resolve(data)
    }
    conn.ws.addEventListener("message", onMessage)
    conn.subscribe(sub)
  })
}

async function measure(coin) {
  const conn = await connect()
  const rows = []
  for (const { label, params } of SETTINGS) {
    const sub = { type: "l2Book", coin, ...params }
    const book = await nextSnapshot(conn, sub)
    conn.unsubscribe(sub)
    const [bids, asks] = book.levels
    const mid = (Number(bids[0].px) + Number(asks[0].px)) / 2
    rows.push({
      setting: label,
      measuredTick: clean(tickOf(book.levels)),
      predictedTick: clean(predictedTick(mid, params, szDecimals[coin])),
      bestBid: bids[0].px,
      bestAsk: asks[0].px,
      levels: `${bids.length}/${asks.length}`,
      deepest: `${bids.at(-1).px} / ${asks.at(-1).px}`,
    })
  }
  conn.ws.close()
  return rows
}

const coins = ["BTC", "ETH"]
const results = await Promise.all(coins.map(measure))
coins.forEach((coin, i) => {
  console.log(`\n${coin} (szDecimals ${szDecimals[coin]})`)
  console.table(results[i])
})
