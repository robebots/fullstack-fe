import type { Coin } from "./hyperliquid"

export type Subscription =
  | { type: "l2Book"; coin: Coin; nSigFigs?: number; mantissa?: number; fast?: true }
  | { type: "bbo"; coin: Coin }

export type Status = "connecting" | "live"

type Entry = { subscription: Subscription; handler: (data: never) => void; acked: boolean }

type Wire = Record<string, unknown>

const routeOf = (channel: unknown, { coin, fast }: Wire) => `${channel}:${coin}:${fast ? "fast" : ""}`

const sameSubscription = (a: Wire, b: Wire) =>
  ["type", "coin", "nSigFigs", "mantissa"].every((key) => (a[key] ?? null) === (b[key] ?? null)) &&
  Boolean(a.fast) === Boolean(b.fast)

export class Feed {
  #url: string
  #socket?: WebSocket
  #entries = new Map<string, Entry>()
  #listeners = new Set<(status: Status) => void>()
  #status: Status = "connecting"
  #retries = 0
  #heard = 0

  constructor(url: string) {
    this.#url = url
  }

  subscribe<T>(subscription: Subscription, handler: (data: T) => void) {
    const key = routeOf(subscription.type, subscription)
    const current = this.#entries.get(key)
    const entry: Entry = { subscription, handler, acked: false }
    if (current && sameSubscription(current.subscription, subscription)) entry.acked = current.acked
    else {
      if (current) this.#send("unsubscribe", current.subscription)
      this.#send("subscribe", subscription)
    }
    this.#entries.set(key, entry)
    this.#connect()
    return () => {
      if (this.#entries.get(key) !== entry) return
      this.#entries.delete(key)
      this.#send("unsubscribe", subscription)
    }
  }

  onStatus(listener: (status: Status) => void) {
    this.#listeners.add(listener)
    listener(this.#status)
    return () => {
      this.#listeners.delete(listener)
    }
  }

  #setStatus(status: Status) {
    if (status === this.#status) return
    this.#status = status
    for (const listener of this.#listeners) listener(status)
  }

  #send(method: "subscribe" | "unsubscribe", subscription: Subscription) {
    if (this.#socket?.readyState === WebSocket.OPEN) this.#socket.send(JSON.stringify({ method, subscription }))
  }

  #connect() {
    if (this.#socket) return
    const socket = new WebSocket(this.#url)
    const watchdog = setInterval(() => {
      if (performance.now() - this.#heard > 10_000) this.#drop(socket, watchdog)
    }, 2_000)
    this.#socket = socket
    this.#heard = performance.now()
    socket.onopen = () => {
      for (const entry of this.#entries.values()) {
        entry.acked = false
        this.#send("subscribe", entry.subscription)
      }
    }
    socket.onmessage = (event) => this.#receive(JSON.parse(event.data))
    socket.onclose = () => this.#drop(socket, watchdog)
  }

  #drop(socket: WebSocket, watchdog: ReturnType<typeof setInterval>) {
    clearInterval(watchdog)
    if (this.#socket !== socket) return
    socket.onclose = null
    socket.close()
    this.#socket = undefined
    this.#setStatus("connecting")
    setTimeout(() => this.#entries.size && this.#connect(), Math.min(250 * 2 ** this.#retries++, 5_000))
  }

  #receive({ channel, data }: { channel: string; data: Wire }) {
    this.#heard = performance.now()
    if (channel === "subscriptionResponse") {
      const echo = data.subscription as Wire
      for (const entry of this.#entries.values()) {
        if (data.method === "subscribe" && sameSubscription(entry.subscription, echo)) entry.acked = true
      }
      return
    }
    const entry = this.#entries.get(routeOf(channel, data))
    if (!entry?.acked) return
    this.#retries = 0
    this.#setStatus("live")
    entry.handler(data as never)
  }
}

export const feed = new Feed("wss://api.hyperliquid.xyz/ws")
