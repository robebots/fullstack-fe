import type { Page, WebSocketRoute } from "@playwright/test"

export type Quote = [px: number, sz: number]

export type Subscription = { type: string; coin: string; nSigFigs?: number; mantissa?: number; fast?: boolean }

export type Print = { side: "A" | "B"; px: number; sz: number; time: number; tid: number }

const level = ([px, sz]: Quote, decimals: number) => ({ px: px.toFixed(decimals), sz: String(sz), n: 1 })

export const ladder = (best: number, step: number, sizes: number[]): Quote[] =>
  sizes.map((sz, i) => [Math.round((best + i * step) * 10) / 10, sz])

export const sizes = (count: number, size: (i: number) => number = (i) => i + 1) =>
  Array.from({ length: count }, (_, i) => size(i))

const depthKey = (coin: string, nSigFigs?: number) => `${coin}:${nSigFigs ?? "full"}`

export async function mockFeed(page: Page) {
  const subscribed: Subscription[] = []
  const unsubscribed: Subscription[] = []
  const requests: Subscription[] = []
  const sockets: WebSocketRoute[] = []
  const depth = new Map<string, unknown>()
  const options = { autoAck: true, decimals: 1 }
  let clock = 1
  const send = (channel: string, data: unknown) => sockets.at(-1)?.send(JSON.stringify({ channel, data }))
  const ack = (subscription: Subscription) =>
    send("subscriptionResponse", {
      method: "subscribe",
      subscription:
        subscription.type === "l2Book"
          ? { nSigFigs: null, mantissa: null, fast: false, ...subscription }
          : subscription,
    })
  await page.routeWebSocket("wss://api.hyperliquid.xyz/ws", (socket) => {
    sockets.push(socket)
    socket.onMessage((raw) => {
      const { method, subscription, id, request } = JSON.parse(String(raw))
      if (method === "post") {
        requests.push(request.payload)
        const data = depth.get(depthKey(request.payload.coin, request.payload.nSigFigs)) ?? null
        send("post", { id, response: { type: "info", payload: { type: "l2Book", data } } })
      }
      if (method === "unsubscribe") unsubscribed.push(subscription)
      if (method !== "subscribe") return
      subscribed.push(subscription)
      if (options.autoAck) ack(subscription)
    })
  })
  const levels = (bids: Quote[], asks: Quote[]) => [
    bids.map((q) => level(q, options.decimals)),
    asks.map((q) => level(q, options.decimals)),
  ]
  return {
    options,
    subscribed,
    unsubscribed,
    requests,
    sockets,
    ack,
    book: (coin: string, bids: Quote[], asks: Quote[], nSigFigs?: number) =>
      depth.set(depthKey(coin, nSigFigs), { coin, time: clock++, levels: levels(bids, asks) }),
    fast: (coin: string, bids: Quote[], asks: Quote[]) =>
      send("l2Book", { coin, time: clock++, levels: levels(bids, asks), fast: true }),
    bbo: (coin: string, bid: Quote, ask: Quote) =>
      send("bbo", { coin, time: clock++, bbo: [level(bid, options.decimals), level(ask, options.decimals)] }),
    trades: (coin: string, prints: Print[]) =>
      send(
        "trades",
        prints.map(({ px, sz, ...print }) => ({ coin, px: px.toFixed(options.decimals), sz: String(sz), ...print })),
      ),
  }
}

export type Feed = Awaited<ReturnType<typeof mockFeed>>

export const cells = (page: Page, side: "asks" | "bids", index: number) =>
  page.getByTestId(side).locator(":scope > div").nth(index).locator(":scope > span")

export async function openBook(page: Page, init?: () => void) {
  const feed = await mockFeed(page)
  if (init) await page.addInitScript(init)
  await page.goto("/")
  await page.waitForFunction(() => document.querySelector("[data-testid=bids]"))
  await waitForSubscriptions(feed, 3)
  return feed
}

export async function waitForSubscriptions(feed: Feed, count: number) {
  const deadline = Date.now() + 10_000
  while (feed.subscribed.length < count) {
    if (Date.now() > deadline) throw new Error(`expected ${count} subscriptions, saw ${feed.subscribed.length}`)
    await new Promise((resolve) => setTimeout(resolve, 20))
  }
}
