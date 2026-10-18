import { expect, test } from "@playwright/test"
import { cells, ladder, openBook, rows, sizes, waitForSubscriptions } from "./feed"

const bids = ladder(81_000, -1, sizes(20))
const asks = ladder(81_001, 1, sizes(20))
const nine = sizes(5, () => 9)

test("renders levels with cumulative totals and spread from live depth", async ({ page }) => {
  const feed = await openBook(page)
  expect(feed.subscribed).toHaveLength(3)
  expect(feed.subscribed).toEqual(
    expect.arrayContaining([
      { type: "l2Book", coin: "BTC", fast: true },
      { type: "bbo", coin: "BTC" },
      { type: "trades", coin: "BTC" },
    ]),
  )
  feed.book("BTC", bids, asks)
  await expect(cells(page, "bids", 0)).toHaveText(["81,000", "1.00000", "1.00000"])
  await expect(cells(page, "bids", 2)).toHaveText(["80,998", "3.00000", "6.00000"])
  await expect(cells(page, "asks", 5)).toHaveText(["81,006", "6.00000", "21.00000"])
  await expect(page.getByTestId("spread")).toHaveText(/Spread\s*1\s*0\.001%/)
  await expect(page.getByTestId("status")).toHaveAttribute("data-status", "live")
  expect(feed.requests[0]).toEqual({ type: "l2Book", coin: "BTC" })
})

test("layers the fast book and bbo over depth by recency", async ({ page }) => {
  const feed = await openBook(page)
  feed.book("BTC", bids, asks)
  await expect(cells(page, "bids", 0)).toHaveText(["81,000", "1.00000", "1.00000"])
  feed.fast("BTC", ladder(81_000, -1, nine), ladder(81_001, 1, nine))
  await expect(cells(page, "bids", 4)).toHaveText(["80,996", "9.00000", "45.00000"])
  await expect(cells(page, "bids", 5)).toHaveText(["80,995", "6.00000", "51.00000"])
  feed.bbo("BTC", [80_998, 4], [81_001, 9])
  await expect(cells(page, "bids", 0)).toHaveText(["80,998", "4.00000", "4.00000"])
  await expect(cells(page, "bids", 1)).toHaveText(["80,997", "9.00000", "13.00000"])
  await expect(cells(page, "bids", 3)).toHaveText(["80,995", "6.00000", "28.00000"])
  feed.book("BTC", bids, asks)
  await expect(cells(page, "bids", 0)).toHaveText(["81,000", "1.00000", "1.00000"])
})

test("switching precision requests the new depth and ignores pushes until the new ack", async ({ page }) => {
  const feed = await openBook(page)
  feed.book("BTC", bids, asks)
  await expect(cells(page, "bids", 0)).toHaveText(["81,000", "1.00000", "1.00000"])
  feed.options.autoAck = false
  await page.getByLabel("Precision").click()
  await page.getByRole("option", { name: /^10\s*4 sig figs$/ }).click()
  await waitForSubscriptions(feed, 4)
  const fresh = feed.subscribed.slice(3)
  expect(fresh).toEqual([{ type: "l2Book", coin: "BTC", nSigFigs: 4, fast: true }])
  await expect.poll(() => feed.unsubscribed).toEqual([{ type: "l2Book", coin: "BTC", fast: true }])
  await expect.poll(() => feed.requests.at(-1)).toEqual({ type: "l2Book", coin: "BTC", nSigFigs: 4 })
  feed.fast("BTC", ladder(81_000, -1, nine), ladder(81_001, 1, nine))
  await page.waitForTimeout(150)
  await expect(cells(page, "bids", 0)).toHaveCount(0)
  for (const subscription of fresh) feed.ack(subscription)
  feed.book("BTC", ladder(81_000, -10, sizes(20)), ladder(81_010, 10, sizes(20)), 4)
  await expect(cells(page, "bids", 1)).toHaveText(["80,990", "2.00000", "3.00000"])
  await expect(page.getByLabel("Precision")).toHaveText(/^10\b/)
})

test("precision options show live tick sizes and collapse duplicates", async ({ page }) => {
  const feed = await openBook(page)
  feed.book("BTC", bids, asks)
  await expect(cells(page, "bids", 0)).toHaveText(["81,000", "1.00000", "1.00000"])
  await page.getByLabel("Precision").click()
  await expect(page.getByRole("option")).toHaveText([
    /^1\s*full$/,
    /^2\s*5 sig figs ×2$/,
    /^5\s*5 sig figs ×5$/,
    /^10\s*4 sig figs$/,
    /^100\s*3 sig figs$/,
    /^1,000\s*2 sig figs$/,
  ])
  await page.keyboard.press("Escape")
  feed.book("BTC", ladder(105_000, -1, sizes(20)), ladder(105_001, 1, sizes(20)))
  await expect(cells(page, "bids", 0)).toHaveText(["105,000", "1.00000", "1.00000"])
  await page.getByLabel("Precision").click()
  await expect(page.getByRole("option")).toHaveText([
    /^1\s*full$/,
    /^10\s*5 sig figs$/,
    /^20\s*5 sig figs ×2$/,
    /^50\s*5 sig figs ×5$/,
    /^100\s*4 sig figs$/,
    /^1,000\s*3 sig figs$/,
    /^10,000\s*2 sig figs$/,
  ])
})

test("switching coin moves every subscription and formats for the new market", async ({ page }) => {
  const feed = await openBook(page)
  feed.book("BTC", bids, asks)
  await page.getByLabel("Market", { exact: true }).click()
  await page.getByRole("option", { name: "ETH-USD" }).click()
  await waitForSubscriptions(feed, 6)
  expect(feed.subscribed.slice(3).map((s) => s.coin)).toEqual(["ETH", "ETH", "ETH"])
  await expect.poll(() => feed.unsubscribed.map((s) => s.coin)).toEqual(["BTC", "BTC", "BTC"])
  feed.book("ETH", ladder(2_364.5, -0.1, sizes(20)), ladder(2_364.6, 0.1, sizes(20)))
  await expect(cells(page, "bids", 1)).toHaveText(["2,364.4", "2.0000", "3.0000"])
  await expect(page.getByText("Size (ETH)").first()).toBeVisible()
})

test("USD toggle shows notional size and total", async ({ page }) => {
  const feed = await openBook(page)
  feed.book("BTC", bids, asks)
  await page.getByRole("button", { name: "USD" }).click()
  await expect(page.getByText("Total (USD)")).toBeVisible()
  await expect(cells(page, "bids", 1)).toHaveText(["80,999", "161,998", "242,998"])
})

test("tape shows aggressor side and merges one taker's fills", async ({ page }) => {
  const feed = await openBook(page)
  const at = Date.UTC(2026, 9, 18, 12, 0, 5)
  feed.trades("BTC", [
    { side: "A", px: 81_000, sz: 0.5, time: at - 2_000, tid: 1 },
    { side: "B", px: 81_001, sz: 0.25, time: at - 1_000, tid: 2 },
  ])
  feed.trades("BTC", [
    { side: "B", px: 81_002, sz: 0.1, time: at, tid: 3 },
    { side: "B", px: 81_002, sz: 0.2, time: at, tid: 4 },
    { side: "A", px: 81_001, sz: 1, time: at, tid: 5 },
  ])
  await page.getByRole("tab", { name: "Trades" }).click()
  const rows = page.getByTestId("trades").locator(":scope > div")
  await expect(rows).toHaveCount(4)
  await expect(rows.nth(0).locator("span").first()).toHaveText("81,001")
  await expect(rows.nth(0)).toHaveAttribute("data-side", "sell")
  await expect(rows.nth(1).locator("span").nth(1)).toHaveText("0.30000")
  await expect(rows.nth(1)).toHaveAttribute("data-side", "buy")
  await expect(rows.nth(3)).toHaveAttribute("data-side", "sell")
  await expect(page.getByTestId("last")).toHaveText("81,001")
})

test("both tabs keep streaming while hidden", async ({ page }) => {
  const feed = await openBook(page)
  feed.book("BTC", bids, asks)
  await expect(cells(page, "bids", 0)).toHaveText(["81,000", "1.00000", "1.00000"])
  await page.getByRole("tab", { name: "Trades" }).click()
  feed.book("BTC", ladder(81_005, -1, sizes(20)), ladder(81_006, 1, sizes(20)))
  await page.waitForTimeout(700)
  await page.getByRole("tab", { name: "Orders" }).click()
  await expect(cells(page, "bids", 0)).toHaveText(["81,005", "1.00000", "1.00000"])
  expect(feed.subscribed).toHaveLength(3)
  expect(feed.unsubscribed).toHaveLength(0)
})

test("reconnects after the server drops the socket and resubscribes", async ({ page }) => {
  const feed = await openBook(page)
  feed.book("BTC", bids, asks)
  await expect(page.getByTestId("status")).toHaveAttribute("data-status", "live")
  await feed.sockets[0].close()
  await expect(page.getByTestId("status")).toHaveAttribute("data-status", "connecting")
  await waitForSubscriptions(feed, 6)
  expect(feed.sockets).toHaveLength(2)
  await expect(page.getByTestId("status")).toHaveAttribute("data-status", "live")
})

test("tapping a level shows the cost to sweep to it and tapping again clears it", async ({ page }) => {
  const feed = await openBook(page)
  feed.book("BTC", bids, asks)
  await expect(cells(page, "bids", 2)).toHaveText(["80,998", "3.00000", "6.00000"])
  await rows(page, "bids").nth(2).click()
  await expect(page.getByTestId("sweep")).toHaveText("Sell 6.00000 BTC · avg 80,998.7 · 0.2 bps")
  await expect(rows(page, "bids").nth(2)).toHaveAttribute("aria-pressed", "true")
  await rows(page, "bids").nth(2).click()
  await expect(page.getByTestId("sweep")).toHaveCount(0)
  await expect(page.getByLabel("Precision")).toBeVisible()
})

test("imbalance line follows visible depth", async ({ page }) => {
  const feed = await openBook(page)
  feed.book("BTC", bids, asks)
  await expect(page.getByTestId("imbalance")).toHaveAttribute("data-share", "50")
  feed.book(
    "BTC",
    ladder(
      81_000,
      -1,
      sizes(20, () => 3),
    ),
    ladder(
      81_001,
      1,
      sizes(20, () => 1),
    ),
  )
  await expect(page.getByTestId("imbalance")).toHaveAttribute("data-share", "75")
})

test("rows fill the height the widget is given", async ({ page, isMobile }) => {
  const feed = await openBook(page)
  feed.book("BTC", bids, asks)
  await page.setViewportSize({ width: page.viewportSize()?.width ?? 400, height: 700 })
  await expect(cells(page, "bids", 0)).toHaveCount(3)
  const short = await rows(page, "bids").count()
  await page.setViewportSize({ width: page.viewportSize()?.width ?? 400, height: 1100 })
  await expect.poll(() => rows(page, "bids").count()).toBeGreaterThan(short)
  for (const side of ["asks", "bids"] as const) {
    const box = await page.getByTestId(side).boundingBox()
    const heights = await rows(page, side).evaluateAll((elements) =>
      elements.map((element) => element.getBoundingClientRect().height),
    )
    const gap = (box?.height ?? 0) - heights.reduce((sum, height) => sum + height, 0)
    expect(gap).toBeGreaterThan(-0.5)
    expect(gap).toBeLessThan(isMobile ? 0.5 : heights.length)
  }
})

test("pauses its streams while hidden and resumes when shown", async ({ page }) => {
  const feed = await openBook(page)
  await page.locator("[data-widget]").evaluate((widget) => {
    widget.style.display = "none"
  })
  await expect.poll(() => feed.unsubscribed.length).toBe(3)
  await page.locator("[data-widget]").evaluate((widget) => {
    widget.style.display = ""
  })
  await waitForSubscriptions(feed, 6)
})

test("desktop dashboard runs two books on one socket and wires a tap to the ticket", async ({ page, isMobile }) => {
  test.skip(isMobile, "the dashboard is the desktop layout")
  const feed = await openBook(page, undefined, "/", 6)
  expect(feed.sockets).toHaveLength(1)
  expect(feed.subscribed.map((s) => s.coin).sort()).toEqual(["BTC", "BTC", "BTC", "ETH", "ETH", "ETH"])
  feed.book("BTC", bids, asks)
  feed.book("ETH", ladder(2_364.5, -0.1, sizes(20)), ladder(2_364.6, 0.1, sizes(20)))
  const [btc, eth] = [0, 1].map((n) => page.locator("[data-widget]:not([data-paused=true])").nth(n))
  await expect(btc.getByTestId("asks").locator(":scope > *").first()).toContainText("81,001")
  await expect(eth.getByTestId("asks").locator(":scope > *").first()).toContainText("2,364.6")
  await btc.getByTestId("asks").locator(":scope > *").nth(1).click()
  await expect(page.getByTestId("ticket-market")).toHaveText("BTC-USD")
  await expect(page.getByTestId("ticket-price")).toHaveText("81,002")
})

test.describe("on a wide touch screen", () => {
  test.use({ viewport: { width: 1180, height: 820 }, hasTouch: true, isMobile: true })

  test("shows the mock instead of the desktop dashboard", async ({ page }) => {
    await openBook(page, undefined, "/")
    await expect(page.locator("[data-widget]:not([data-paused=true])")).toHaveCount(1)
    await expect(page.getByRole("complementary", { name: "Order ticket" })).toBeHidden()
  })
})
