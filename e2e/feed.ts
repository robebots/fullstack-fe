import { expect, type Page, type WebSocketRoute } from "@playwright/test"

export type Quote = [px: number, sz: number]

type Subscription = { type: string; coin: string; nSigFigs?: number; mantissa?: number; fast?: boolean }

type Print = {
  side: "A" | "B"
  px: number
  sz: number
  time: number
  tid: number
  hash?: string
  users?: [string, string]
}

const level = ([px, sz]: Quote, decimals: number) => ({ px: px.toFixed(decimals), sz: String(sz), n: 1 })

export const ladder = (best: number, step: number, sizes: number[]): Quote[] =>
  sizes.map((sz, i) => [Math.round((best + i * step) * 10) / 10, sz])

export const sizes = (count: number, size: (i: number) => number = (i) => i + 1) =>
  Array.from({ length: count }, (_, i) => size(i))

const depthKey = (coin: string, nSigFigs?: number) => `${coin}:${nSigFigs ?? "full"}`

const listing = (name: string, szDecimals: number, maxLeverage: number, mark: number, isDelisted?: boolean) => ({
  meta: { name, szDecimals, maxLeverage, ...(isDelisted ? { isDelisted } : {}) },
  ctx: {
    markPx: String(mark),
    oraclePx: String(mark),
    midPx: String(mark),
    prevDayPx: String(mark * 0.99),
    dayNtlVlm: String(mark * 1_000),
    openInterest: "100",
    funding: "0.0000125",
  },
})

const LISTINGS = [
  listing("BTC", 5, 40, 81_000.5),
  listing("ETH", 4, 25, 2_364.55),
  listing("SOL", 2, 20, 103.5),
  listing("HYPE", 2, 10, 78.03),
  listing("OLD", 0, 3, 0.5, true),
]

export async function routeMarkets(page: Page, failures = 0) {
  let failed = 0
  await page.route("https://api.hyperliquid.xyz/info", (route) =>
    failed++ < failures
      ? route.fulfill({ status: 500 })
      : route.fulfill({
          json: [{ universe: LISTINGS.map((entry) => entry.meta) }, LISTINGS.map((entry) => entry.ctx)],
        }),
  )
  await page.route("https://app.hyperliquid.xyz/coins/**", (route) => route.fulfill({ status: 404 }))
}

export async function mockFeed(page: Page, failures = 0) {
  await routeMarkets(page, failures)
  const subscribed: Subscription[] = []
  const unsubscribed: Subscription[] = []
  const requests: Subscription[] = []
  const sockets: WebSocketRoute[] = []
  const depth = new Map<string, unknown>()
  const options = { autoAck: true, decimals: 1, answer: true }
  const unanswered: (() => void)[] = []
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
        const reply = () => {
          const data = depth.get(depthKey(request.payload.coin, request.payload.nSigFigs)) ?? null
          send("post", { id, response: { type: "info", payload: { type: "l2Book", data } } })
        }
        if (options.answer) reply()
        else unanswered.push(reply)
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
    answer: () => {
      for (const reply of unanswered.splice(0)) reply()
    },
    book: (coin: string, bids: Quote[], asks: Quote[], nSigFigs?: number) =>
      depth.set(depthKey(coin, nSigFigs), { coin, time: clock++, levels: levels(bids, asks) }),
    fast: (coin: string, bids: Quote[], asks: Quote[]) =>
      send("l2Book", { coin, time: clock++, levels: levels(bids, asks), fast: true }),
    ctx: (coin: string, ctx: Partial<Record<"markPx" | "oraclePx" | "midPx" | "funding", string>>) =>
      send("activeAssetCtx", { coin, ctx: { ...LISTINGS[0].ctx, ...ctx } }),
    bbo: (coin: string, bid: Quote, ask: Quote) =>
      send("bbo", { coin, time: clock++, bbo: [level(bid, options.decimals), level(ask, options.decimals)] }),
    trades: (coin: string, prints: Print[]) =>
      send(
        "trades",
        prints.map(({ px, sz, ...print }) => ({
          coin,
          px: px.toFixed(options.decimals),
          sz: String(sz),
          hash: `0x${print.tid}`,
          users: ["0xbuyer", "0xseller"],
          ...print,
        })),
      ),
  }
}

type Feed = Awaited<ReturnType<typeof mockFeed>>

export const rows = (page: Page, side: "asks" | "bids") => page.getByTestId(side).locator(":scope > *")

export const cells = (page: Page, side: "asks" | "bids", index: number) =>
  rows(page, side).nth(index).locator(":scope > span:not([aria-hidden])")

export async function openBook(
  page: Page,
  { path = "/embed/BTC", subscriptions = 3, init }: { path?: string; subscriptions?: number; init?: () => void } = {},
) {
  const feed = await mockFeed(page)
  if (init) await page.addInitScript(init)
  await page.goto(path)
  await page.waitForFunction(() => document.querySelector("[data-testid=bids]"))
  await waitForSubscriptions(feed, subscriptions)
  return feed
}

export const waitForSubscriptions = (feed: Feed, count: number) =>
  expect.poll(() => feed.subscribed.length, { timeout: 10_000 }).toBeGreaterThanOrEqual(count)
