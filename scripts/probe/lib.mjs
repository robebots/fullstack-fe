export const WS_URL = "wss://api.hyperliquid.xyz/ws"

export const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

export const subKey = (s) => JSON.stringify([s.type, s.coin, s.nSigFigs ?? null, s.mantissa ?? null, Boolean(s.fast)])

export function quantile(values, p) {
  if (!values.length) return null
  const sorted = [...values].sort((a, b) => a - b)
  return Math.round(sorted[Math.min(sorted.length - 1, Math.floor(p * sorted.length))])
}

const gcd = (a, b) => {
  while (b) [a, b] = [b, a % b]
  return a
}

export function tickOf(levels) {
  const pxs = levels.flat().map((l) => l.px)
  if (pxs.length < 2) return null
  const decimals = Math.max(...pxs.map((p) => (p.split(".")[1] ?? "").length))
  const scale = 10 ** decimals
  const ints = [...new Set(pxs.map((p) => Math.round(Number(p) * scale)))].sort((a, b) => a - b)
  let g = 0
  for (let i = 1; i < ints.length; i++) g = gcd(g, ints[i] - ints[i - 1])
  return g / scale
}

export function connect() {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(WS_URL)
    const log = []
    ws.addEventListener("message", (ev) => {
      const raw = String(ev.data)
      log.push({ i: log.length, t: performance.now(), wall: Date.now(), raw, msg: JSON.parse(raw) })
    })
    ws.addEventListener("close", (ev) => log.push({ i: log.length, t: performance.now(), closed: ev.code }))
    ws.addEventListener("error", () => reject(new Error("websocket error")))
    ws.addEventListener("open", () =>
      resolve({
        ws,
        log,
        send(obj) {
          if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(obj))
        },
        subscribe(subscription) {
          this.send({ method: "subscribe", subscription })
        },
        unsubscribe(subscription) {
          this.send({ method: "unsubscribe", subscription })
        },
      }),
    )
  })
}
