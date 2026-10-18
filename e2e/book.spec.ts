import { expect, test } from "@playwright/test"
import { cells, ladder, openBook, sizes, waitForSubscriptions } from "./feed"

const bids = ladder(81_000, -1, sizes(20))
const asks = ladder(81_001, 1, sizes(20))

test("renders levels with cumulative totals, spread and mid", async ({ page }) => {
  const feed = await openBook(page)
  expect(feed.subscribed).toEqual([
    { type: "l2Book", coin: "BTC" },
    { type: "l2Book", coin: "BTC", fast: true },
    { type: "bbo", coin: "BTC" },
  ])
  feed.book("BTC", bids, asks)
  await expect(cells(page, "bids", 0)).toHaveText(["81,000", "1.00000", "1.00000"])
  await expect(cells(page, "bids", 2)).toHaveText(["80,998", "3.00000", "6.00000"])
  await expect(cells(page, "asks", 11)).toHaveText(["81,012", "12.00000", "78.00000"])
  await expect(page.getByTestId("spread")).toHaveText(/Spread\s*1\s*0\.001%/)
  await expect(page.getByTestId("mid")).toHaveText("81,000.5")
  await expect(page.getByTestId("status")).toHaveAttribute("data-status", "live")
})

test("layers the fast book and bbo over the 20-level book by recency", async ({ page }) => {
  const feed = await openBook(page)
  feed.book("BTC", bids, asks)
  feed.book(
    "BTC",
    ladder(
      81_000,
      -1,
      sizes(5, () => 9),
    ),
    ladder(
      81_001,
      1,
      sizes(5, () => 9),
    ),
    { fast: true },
  )
  await expect(cells(page, "bids", 4)).toHaveText(["80,996", "9.00000", "45.00000"])
  await expect(cells(page, "bids", 5)).toHaveText(["80,995", "6.00000", "51.00000"])
  feed.bbo("BTC", [80_998, 4], [81_001, 9])
  await expect(cells(page, "bids", 0)).toHaveText(["80,998", "4.00000", "4.00000"])
  await expect(cells(page, "bids", 1)).toHaveText(["80,997", "9.00000", "13.00000"])
  await expect(cells(page, "bids", 3)).toHaveText(["80,995", "6.00000", "28.00000"])
  feed.book("BTC", bids, asks)
  await expect(cells(page, "bids", 0)).toHaveText(["81,000", "1.00000", "1.00000"])
})

test("switching precision resubscribes and ignores snapshots until the new ack", async ({ page }) => {
  const feed = await openBook(page)
  feed.book("BTC", bids, asks)
  await expect(cells(page, "bids", 0)).toHaveText(["81,000", "1.00000", "1.00000"])
  feed.options.autoAck = false
  await page.getByLabel("Precision").click()
  await page.getByRole("option", { name: /^10\s*4 sig figs$/ }).click()
  await waitForSubscriptions(feed, 5)
  const fresh = feed.subscribed.slice(3)
  expect(fresh).toEqual([
    { type: "l2Book", coin: "BTC", nSigFigs: 4 },
    { type: "l2Book", coin: "BTC", nSigFigs: 4, fast: true },
  ])
  expect(feed.unsubscribed).toEqual(
    expect.arrayContaining([
      { type: "l2Book", coin: "BTC" },
      { type: "l2Book", coin: "BTC", fast: true },
    ]),
  )
  feed.book("BTC", bids, asks)
  await page.waitForTimeout(150)
  await expect(cells(page, "bids", 0)).toHaveCount(0)
  for (const subscription of fresh) feed.ack(subscription)
  feed.book("BTC", ladder(81_000, -10, sizes(20)), ladder(81_010, 10, sizes(20)))
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
  await page.getByLabel("Market").click()
  await page.getByRole("option", { name: "ETH-USD" }).click()
  await waitForSubscriptions(feed, 6)
  expect(feed.subscribed.slice(3).map((s) => s.coin)).toEqual(["ETH", "ETH", "ETH"])
  await expect.poll(() => feed.unsubscribed.map((s) => s.coin)).toEqual(["BTC", "BTC", "BTC"])
  feed.book("BTC", bids, asks)
  feed.book("ETH", ladder(2_364.5, -0.1, sizes(20)), ladder(2_364.6, 0.1, sizes(20)))
  await expect(cells(page, "bids", 1)).toHaveText(["2,364.4", "2.0000", "3.0000"])
  await expect(page.getByText("Size (ETH)")).toBeVisible()
})

test("USD toggle shows notional size and total", async ({ page }) => {
  const feed = await openBook(page)
  feed.book("BTC", bids, asks)
  await page.getByRole("button", { name: "USD" }).click()
  await expect(page.getByText("Total (USD)")).toBeVisible()
  await expect(cells(page, "bids", 1)).toHaveText(["80,999", "161,998", "242,998"])
})

test("reconnects after the server drops the socket and resubscribes", async ({ page }) => {
  const feed = await openBook(page)
  feed.book("BTC", bids, asks)
  await expect(page.getByTestId("status")).toHaveAttribute("data-status", "live")
  await feed.sockets[0].close()
  await expect(page.getByTestId("status")).toHaveAttribute("data-status", "connecting")
  await waitForSubscriptions(feed, 6)
  expect(feed.sockets).toHaveLength(2)
  feed.book("BTC", bids, asks)
  await expect(page.getByTestId("status")).toHaveAttribute("data-status", "live")
})
