import type { Coin } from "./hyperliquid"

export type Subscription =
  | { type: "l2Book"; coin: Coin; nSigFigs?: number; mantissa?: number; fast?: true }
  | { type: "bbo"; coin: Coin }
  | { type: "trades"; coin: Coin }
  | { type: "activeAssetCtx"; coin: Coin }

export type Status = "connecting" | "live"

type Handler = (data: never) => void

type Entry = { subscription: Subscription; handlers: Set<Handler>; acked: boolean }

type Wire = Record<string, unknown>

const routeOf = (channel: unknown, data: Wire | Wire[]) => {
  const { coin, fast } = Array.isArray(data) ? (data[0] ?? {}) : data
  return `${channel}:${coin}:${fast ? "fast" : ""}`
}

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
  #requests = new Map<number, (data: unknown) => void>()
  #nextRequest = 0

  constructor(url: string) {
    this.#url = url
  }

  subscribe<T>(subscription: Subscription, handler: (data: T) => void) {
    const key = routeOf(subscription.type, subscription)
    let entry = this.#entries.get(key)
    if (!entry || !sameSubscription(entry.subscription, subscription)) {
      if (entry) this.#send("unsubscribe", entry.subscription)
      entry = { subscription, handlers: new Set(), acked: false }
      this.#entries.set(key, entry)
      this.#send("subscribe", subscription)
    }
    const owner = entry
    const listener = handler as Handler
    owner.handlers.add(listener)
    this.#connect()
    return () => {
      owner.handlers.delete(listener)
      if (owner.handlers.size || this.#entries.get(key) !== owner) return
      this.#entries.delete(key)
      this.#send("unsubscribe", subscription)
    }
  }

  request<T>(payload: Wire): Promise<T | undefined> {
    const socket = this.#socket
    if (socket?.readyState !== WebSocket.OPEN) return Promise.resolve(undefined)
    const id = ++this.#nextRequest
    const reply = new Promise<T | undefined>((resolve) =>
      this.#requests.set(id, (data) => resolve(data as T | undefined)),
    )
    socket.send(JSON.stringify({ method: "post", id, request: { type: "info", payload } }))
    return reply
  }

  get status() {
    return this.#status
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
    for (const resolve of this.#requests.values()) resolve(undefined)
    this.#requests.clear()
    this.#setStatus("connecting")
    setTimeout(() => this.#entries.size && this.#connect(), Math.min(250 * 2 ** this.#retries++, 5_000))
  }

  #receive({ channel, data }: { channel: string; data: Wire | Wire[] }) {
    this.#heard = performance.now()
    this.#retries = 0
    this.#setStatus("live")
    if (channel === "post") {
      const { id, response } = data as { id: number; response?: { type: string; payload?: { data?: unknown } } }
      this.#requests.get(id)?.(response?.type === "info" ? response.payload?.data : undefined)
      this.#requests.delete(id)
      return
    }
    if (channel === "subscriptionResponse") {
      const { method, subscription } = data as Wire
      for (const entry of this.#entries.values()) {
        if (method === "subscribe" && sameSubscription(entry.subscription, subscription as Wire)) entry.acked = true
      }
      return
    }
    const entry = this.#entries.get(routeOf(channel, data))
    if (entry?.acked) for (const handler of entry.handlers) handler(data as never)
  }
}

export const feed = new Feed("wss://api.hyperliquid.xyz/ws")
