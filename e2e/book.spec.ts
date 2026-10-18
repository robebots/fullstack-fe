import { expect, type Page, test } from "@playwright/test"
import { cells, ladder, openBook, type Quote, rows, sizes, waitForSubscriptions } from "./feed"

const bids = ladder(81_000, -1, sizes(20))
const asks = ladder(81_001, 1, sizes(20))
const nine = sizes(5, () => 9)

const cents = (best: number, step: number) =>
  sizes(20).map((sz, i): Quote => [Math.round((best + i * step) * 100) / 100, sz])

async function choose(page: Page, option: string) {
  await page.getByLabel("Book settings").click()
  await page.getByRole("menuitemradio", { name: option }).click()
}

const searchButton = (page: Page) => page.locator("button[aria-label='Search markets']:visible")

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

test("USD units show notional size and total", async ({ page }) => {
  const feed = await openBook(page)
  feed.book("BTC", bids, asks)
  await page.getByLabel("Units").click()
  await page.getByRole("option", { name: "USD" }).click()
  await expect(page.getByText("Total (USD)")).toBeVisible()
  await expect(cells(page, "bids", 1)).toHaveText(["80,999", "161,998", "242,998"])
})

test("tape shows aggressor side, merges one taker's fills and links each print to the explorer", async ({ page }) => {
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
  const prints = page.getByTestId("trades").locator(":scope > div")
  const text = (index: number) => prints.nth(index).locator(":scope > span:not([aria-hidden])")
  await expect(prints).toHaveCount(4)
  await expect(text(0).first()).toHaveText("81,001")
  await expect(prints.nth(0)).toHaveAttribute("data-side", "sell")
  await expect(text(1).nth(1)).toHaveText("0.30000")
  await expect(prints.nth(1)).toHaveAttribute("data-side", "buy")
  await expect(prints.nth(3)).toHaveAttribute("data-side", "sell")
  await expect(prints.nth(0).getByRole("link")).toHaveAttribute("href", "https://app.hyperliquid.xyz/explorer/tx/0x5")
  await expect(prints.nth(1).getByRole("link")).toHaveAttribute("href", "https://app.hyperliquid.xyz/explorer/tx/0x3")
})

test("both tabs keep streaming while hidden", async ({ page }) => {
  const feed = await openBook(page)
  feed.book("BTC", bids, asks)
  await expect(cells(page, "bids", 0)).toHaveText(["81,000", "1.00000", "1.00000"])
  await page.getByRole("tab", { name: "Trades" }).click()
  feed.book("BTC", ladder(81_005, -1, sizes(20)), ladder(81_006, 1, sizes(20)))
  await page.waitForTimeout(700)
  await page.getByRole("tab", { name: "Order Book" }).click()
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

test("tapping a level on touch prices the fill and tapping again clears it", async ({ page, isMobile }) => {
  test.skip(!isMobile, "touch shows the fill in a strip; a mouse gets the hover card")
  const feed = await openBook(page)
  feed.book("BTC", bids, asks)
  await expect(cells(page, "bids", 2)).toHaveText(["80,998", "3.00000", "6.00000"])
  await rows(page, "bids").nth(2).click()
  await expect(page.getByTestId("sweep")).toHaveText("Sell 6.00000 BTC · avg 80,998.7 · 0.0023% from mid")
  await expect(rows(page, "bids").nth(2)).toHaveAttribute("aria-pressed", "true")
  await rows(page, "bids").nth(2).click()
  await expect(page.getByTestId("sweep")).toHaveCount(0)
})

test("hovering a level shows distance from mid, average price and totals", async ({ page, isMobile }) => {
  test.skip(isMobile, "hover needs a mouse")
  const feed = await openBook(page)
  feed.book("BTC", bids, asks)
  await expect(cells(page, "bids", 2)).toHaveText(["80,998", "3.00000", "6.00000"])
  await rows(page, "bids").nth(2).hover()
  const card = page.getByTestId("hover-card")
  await expect(card).toContainText("Distance from Mid0.0023%")
  await expect(card).toContainText("Average Price80,999")
  await expect(card).toContainText("Total (BTC)6.00000")
  await expect(card).toContainText("Total (USD)485,992")
  await page.mouse.move(1, 1)
  await expect(card).toHaveCount(0)
})

test("rows fill the height the widget is given", async ({ page }) => {
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
    const filled = heights.reduce((sum, height) => sum + height, 0)
    expect(Math.abs((box?.height ?? 0) - filled)).toBeLessThan(0.5)
  }
})

test("the menu shows one side, both sides or both side by side", async ({ page }) => {
  const feed = await openBook(page)
  feed.book("BTC", bids, asks)
  await expect(cells(page, "bids", 0)).toHaveCount(3)
  const both = await rows(page, "bids").count()
  await choose(page, "Bids only")
  await expect(page.getByTestId("asks")).toHaveCount(0)
  await expect.poll(() => rows(page, "bids").count()).toBeGreaterThan(both)
  await choose(page, "Asks only")
  await expect(page.getByTestId("bids")).toHaveCount(0)
  await expect(cells(page, "asks", 0)).toHaveText(["81,001", "1.00000", "1.00000"])
  await choose(page, "Side by side")
  await expect(cells(page, "bids", 0)).toHaveText(["1.00000", "81,000"])
  await expect(cells(page, "asks", 0)).toHaveText(["81,001", "1.00000"])
  const left = await page.getByTestId("bids").boundingBox()
  const right = await page.getByTestId("asks").boundingBox()
  expect(right?.x ?? 0).toBeGreaterThan(left?.x ?? 0)
  expect((right?.x ?? 0) - ((left?.x ?? 0) + (left?.width ?? 0))).toBeCloseTo(2, 1)
})

test("stacked and large panels show the book and trades together", async ({ page, isMobile }) => {
  const feed = await openBook(page)
  feed.book("BTC", bids, asks)
  await choose(page, "Stacked")
  await expect(page.getByTestId("trades")).toBeVisible()
  const book = await page.getByTestId("bids").boundingBox()
  let tape = await page.getByTestId("trades").boundingBox()
  expect(tape?.y ?? 0).toBeGreaterThan(book?.y ?? 0)
  await choose(page, "Large")
  await expect(page.getByTestId("trades")).toBeVisible()
  tape = await page.getByTestId("trades").boundingBox()
  const large = await page.getByTestId("bids").boundingBox()
  if (isMobile) expect(tape?.y ?? 0).toBeGreaterThan(large?.y ?? 0)
  else expect(tape?.x ?? 0).toBeGreaterThan(large?.x ?? 0)
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

test("the trade page streams market stats and a book click fills the order ticket", async ({ page, isMobile }) => {
  test.skip(isMobile, "the order form is part of the desktop layout")
  const feed = await openBook(page, undefined, "/trade/BTC", 4)
  expect(feed.subscribed).toContainEqual({ type: "activeAssetCtx", coin: "BTC" })
  feed.book("BTC", bids, asks)
  await expect(page.getByTestId("market-bar").filter({ visible: true })).toContainText("40x")
  await expect(cells(page, "asks", 1)).toHaveText(["81,002", "2.00000", "3.00000"])
  await rows(page, "asks").nth(1).click()
  await expect(page.getByTestId("ticket-price")).toHaveValue("81002")
  await expect(page.getByRole("button", { name: "Buy / Long" })).toHaveAttribute("aria-pressed", "true")
  await rows(page, "bids").nth(0).click()
  await expect(page.getByTestId("ticket-price")).toHaveValue("81000")
  await expect(page.getByRole("button", { name: "Sell / Short" })).toHaveAttribute("aria-pressed", "true")
})

test("search filters by name and Enter switches every subscription to the new market", async ({ page }) => {
  const feed = await openBook(page, undefined, "/trade/BTC", 4)
  await searchButton(page).click()
  const options = page.getByTestId("market-option")
  await expect
    .poll(() => options.evaluateAll((elements) => elements.map((element) => element.getAttribute("data-coin"))))
    .toEqual(["BTC", "ETH", "SOL", "HYPE"])
  await page.keyboard.type("so")
  await expect(options).toHaveCount(1)
  await page.keyboard.press("Enter")
  await expect(page).toHaveURL(/\/trade\/SOL$/)
  await waitForSubscriptions(feed, 8)
  expect(feed.subscribed.slice(4).map((subscription) => subscription.coin)).toEqual(["SOL", "SOL", "SOL", "SOL"])
  await expect
    .poll(() => feed.unsubscribed.map((subscription) => subscription.coin))
    .toEqual(["BTC", "BTC", "BTC", "BTC"])
  feed.options.decimals = 2
  feed.book("SOL", cents(103.45, -0.01), cents(103.46, 0.01))
  await expect(rows(page, "bids").nth(1)).toContainText("103.44")
  await expect(rows(page, "bids").nth(1)).toContainText("3.00")
})

test("arrow keys move through results, ⌘K opens search and ⌘S stars a market across reloads", async ({ page }) => {
  await openBook(page, undefined, "/trade/BTC", 4)
  await page.keyboard.press("Control+k")
  await expect(page.getByTestId("market-option")).toHaveCount(4)
  await page.keyboard.press("ArrowDown")
  await page.keyboard.press("ArrowDown")
  await expect(page.locator("[data-active=true]")).toContainText("SOL-USD")
  await page.keyboard.press("Control+s")
  await expect(page.getByRole("button", { name: "Remove SOL from favorites" })).toBeVisible()
  await page.reload()
  await page.keyboard.press("Control+k")
  await expect(page.getByRole("button", { name: "Remove SOL from favorites" })).toBeVisible()
})

test("strict search hides delisted markets and All shows them", async ({ page }) => {
  await openBook(page, undefined, "/trade/BTC", 4)
  await searchButton(page).click()
  await page.keyboard.type("old")
  await expect(page.getByTestId("market-option")).toHaveCount(0)
  await page.getByRole("group", { name: "Listing" }).getByRole("button", { name: "All" }).click()
  await expect(page.getByTestId("market-option")).toHaveCount(1)
  await expect(page.getByTestId("market-option")).toContainText("OLD-USD")
  await expect(page.getByTestId("market-option")).toContainText("delisted")
})

test("phones get the split book and page tabs like Hyperliquid's mobile view", async ({ page, isMobile }) => {
  test.skip(!isMobile, "the split book is the phone layout")
  const feed = await openBook(page, undefined, "/trade/BTC", 4)
  feed.book("BTC", bids, asks)
  await expect(cells(page, "bids", 0)).toHaveText(["1.00000", "81,000"])
  await expect(cells(page, "asks", 0)).toHaveText(["81,001", "1.00000"])
  await page.getByRole("button", { name: "Trades", exact: true }).click()
  await expect(page.getByTestId("trades").filter({ visible: true })).toHaveCount(1)
})
