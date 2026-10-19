import { expect, type Page, test } from "@playwright/test"
import { cells, ladder, mockFeed, openBook, type Quote, rows, sizes, waitForSubscriptions } from "./feed"

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
  feed.bbo("BTC", [80_995, 1], [81_005, 1])
  await expect(page.getByTestId("spread")).toHaveText(/^Spread\s*10\s*0\.012%$/)
  await expect(cells(page, "bids", 0)).toHaveCount(0)
  for (const subscription of fresh) feed.ack(subscription)
  feed.book("BTC", ladder(81_000, -10, sizes(20)), ladder(81_010, 10, sizes(20)), 4)
  await expect(cells(page, "bids", 1)).toHaveText(["80,990", "2.00000", "3.00000"])
  await expect(page.getByLabel("Precision")).toHaveText(/^10\b/)
})

test("rows leave slack under the 20-level snapshot, so a 3-level move shows no blank rows", async ({ page }) => {
  await page.setViewportSize({ width: page.viewportSize()?.width ?? 400, height: 1400 })
  const feed = await openBook(page)
  feed.book("BTC", bids, asks)
  await expect(cells(page, "asks", 0)).toHaveText(["81,001", "1.00000", "1.00000"])
  const slots = await rows(page, "asks").count()
  expect(slots).toBe(16)
  feed.fast("BTC", ladder(81_003, -1, nine), ladder(81_004, 1, nine))
  await expect(cells(page, "asks", 0)).toHaveText(["81,004", "9.00000", "9.00000"])
  await expect(page.getByTestId("asks").locator(":scope > button")).toHaveCount(slots)
})

test("a sweep past the depth snapshot refetches it at once and holds the last full book until it lands", async ({
  page,
}) => {
  const feed = await openBook(page)
  feed.book("BTC", bids, asks)
  await expect(cells(page, "asks", 0)).toHaveText(["81,001", "1.00000", "1.00000"])
  const slots = await rows(page, "asks").count()
  const polls = feed.requests.length
  await expect.poll(() => feed.requests.length, { intervals: [5] }).toBeGreaterThan(polls)
  await page.waitForTimeout(250)
  feed.options.answer = false
  const fewest = page.evaluate(
    () =>
      new Promise<number>((resolve) => {
        let least = Number.POSITIVE_INFINITY
        const end = performance.now() + 700
        const sample = () => {
          least = Math.min(least, document.querySelectorAll("[data-testid=asks] > button").length)
          if (performance.now() < end) requestAnimationFrame(sample)
          else resolve(least)
        }
        sample()
      }),
  )
  const sent = feed.requests.length
  feed.bbo("BTC", [81_014, 1], [81_015, 1])
  await expect.poll(() => feed.requests.length, { timeout: 200, intervals: [5] }).toBeGreaterThan(sent)
  await expect(cells(page, "asks", 0)).toHaveText(["81,001", "1.00000", "1.00000"])
  feed.book("BTC", ladder(81_014, -1, sizes(20)), ladder(81_015, 1, sizes(20)))
  feed.answer()
  await expect(cells(page, "asks", 0)).toHaveText(["81,015", "1.00000", "1.00000"])
  expect(await fewest).toBe(slots)
})

test("a trending touch refetches depth at most five times a second", async ({ page }) => {
  const feed = await openBook(page)
  feed.book("BTC", bids, asks)
  await expect(cells(page, "bids", 0)).toHaveText(["81,000", "1.00000", "1.00000"])
  const before = feed.requests.length
  for (let tick = 1; tick <= 20; tick++) {
    feed.bbo("BTC", [81_000 + tick * 30, 1], [81_001 + tick * 30, 1])
    await page.waitForTimeout(50)
  }
  expect(feed.requests.length - before).toBeLessThanOrEqual(7)
})

test("the book keeps streaming after switching precision away and back", async ({ page }) => {
  const feed = await openBook(page)
  feed.book("BTC", bids, asks)
  await expect(cells(page, "bids", 0)).toHaveText(["81,000", "1.00000", "1.00000"])
  await page.getByLabel("Precision").click()
  await page.getByRole("option", { name: /^10\s*4 sig figs$/ }).click()
  await waitForSubscriptions(feed, 4)
  await page.getByLabel("Precision").click()
  await page.getByRole("option", { name: /^1\s*full$/ }).click()
  await waitForSubscriptions(feed, 5)
  feed.fast("BTC", ladder(81_010, -1, nine), ladder(81_011, 1, nine))
  await expect(cells(page, "bids", 0)).toHaveText(["81,010", "9.00000", "9.00000"])
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
  await expect(cells(page, "bids", 0)).toHaveText(["81,005", "1.00000", "1.00000"])
  await page.getByRole("tab", { name: "Order Book" }).click()
  feed.trades("BTC", [{ side: "B", px: 81_006, sz: 0.5, time: Date.UTC(2026, 9, 18, 12), tid: 9 }])
  await expect(page.getByTestId("trades").locator(":scope > div")).toHaveCount(1)
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
  await expect(card).toContainText("Average Price80,998.7")
  await expect(card).toContainText("Total (BTC)6.00000")
  await expect(card).toContainText("Total (USD)485,992")
  await page.mouse.move(1, 1)
  await expect(card).toHaveCount(0)
})

test("the hover card follows the row under a still mouse as the book moves", async ({ page, isMobile }) => {
  test.skip(isMobile, "hover needs a mouse")
  const feed = await openBook(page)
  feed.book("BTC", bids, asks)
  await expect(cells(page, "bids", 2)).toHaveText(["80,998", "3.00000", "6.00000"])
  await rows(page, "bids").nth(2).hover()
  const card = page.getByTestId("hover-card")
  await expect(card).toContainText("Total (BTC)6.00000")
  const threes = sizes(20, () => 3)
  feed.book("BTC", ladder(80_999, -1, threes), ladder(81_000, 1, threes))
  await expect(cells(page, "bids", 2)).toHaveText(["80,997", "3.00000", "9.00000"])
  await expect(card).toContainText("Total (BTC)9.00000")
})

test("the bar scale holds through small swings and glides when it steps", async ({ page }) => {
  const feed = await openBook(page)
  const book = (top: number) => {
    const size = (i: number) => (i ? 0.001 : top)
    feed.book("BTC", ladder(81_000, -1, sizes(20, size)), ladder(81_001, 1, sizes(20, size)))
  }
  const host = page.locator("[style*='--max']").first()
  const scale = () => host.evaluate((element) => element.style.getPropertyValue("--max"))
  const glide = (to: number) =>
    host.evaluate(
      (element, target) =>
        new Promise<number[]>((resolve) => {
          const seen: number[] = []
          const end = performance.now() + 3_000
          const sample = () => {
            const value = Number(getComputedStyle(element).getPropertyValue("--max"))
            seen.push(value)
            if (value === target || performance.now() > end) resolve(seen)
            else requestAnimationFrame(sample)
          }
          sample()
        }),
      to,
    )
  book(19)
  await expect.poll(scale).toBe("20")
  const seen = glide(50)
  for (const [top, expected] of [
    [21, "50"],
    [19, "50"],
    [9, "20"],
  ] as const) {
    book(top)
    await expect(cells(page, "bids", 0)).toHaveText([/^81,000$/, `${top}.00000`, `${top}.00000`])
    await expect.poll(scale).toBe(expected)
  }
  expect((await seen).some((value) => value > 20 && value < 50)).toBe(true)
})

test("a lost depth reply doesn't stop the depth poll", async ({ page }) => {
  const feed = await openBook(page)
  feed.book("BTC", bids, asks)
  await expect(cells(page, "bids", 0)).toHaveText(["81,000", "1.00000", "1.00000"])
  feed.options.answer = false
  const sent = feed.requests.length
  await expect.poll(() => feed.requests.length).toBeGreaterThan(sent)
  feed.options.answer = true
  feed.book("BTC", ladder(80_990, -1, sizes(20)), ladder(80_991, 1, sizes(20)))
  await expect(cells(page, "bids", 0)).toHaveText(["80,990", "1.00000", "1.00000"], { timeout: 5_000 })
})

test("market links ignore case", async ({ page }) => {
  const feed = await openBook(page, { path: "/trade/eth", subscriptions: 4 })
  expect(feed.subscribed).toContainEqual({ type: "l2Book", coin: "ETH", fast: true })
  await expect(page.getByTestId("market-bar").filter({ visible: true })).toContainText("ETH")
})

test("rows are Hyperliquid's 25 px at any height and in either layout, as many as fit up to 16", async ({ page }) => {
  const feed = await openBook(page)
  feed.book("BTC", bids, asks)
  const heights = () =>
    rows(page, "bids").evaluateAll((elements) => elements.map((element) => element.getBoundingClientRect().height))
  await page.setViewportSize({ width: page.viewportSize()?.width ?? 400, height: 450 })
  await expect(cells(page, "bids", 0)).toHaveCount(3)
  const short = await rows(page, "bids").count()
  expect(new Set(await heights())).toEqual(new Set([25]))
  await page.setViewportSize({ width: page.viewportSize()?.width ?? 400, height: 1400 })
  await expect.poll(() => rows(page, "bids").count()).toBe(16)
  expect(short).toBeLessThan(16)
  expect(new Set(await heights())).toEqual(new Set([25]))
  await choose(page, "Side by side")
  await expect(cells(page, "bids", 0)).toHaveCount(2)
  await expect(rows(page, "bids")).toHaveCount(16)
  expect(new Set(await heights())).toEqual(new Set([25]))
})

test("phones open side by side like Hyperliquid and wider screens stacked", async ({ page, isMobile }) => {
  const feed = await openBook(page, { path: "/trade/BTC", subscriptions: 4 })
  feed.book("BTC", bids, asks)
  if (isMobile) {
    await expect(cells(page, "bids", 0)).toHaveText(["1.00000", "81,000"])
    await expect(cells(page, "asks", 0)).toHaveText(["81,001", "1.00000"])
  } else await expect(cells(page, "bids", 0)).toHaveText(["81,000", "1.00000", "1.00000"])
})

test("a tapped level that leaves the book clears itself without moving a row", async ({ page, isMobile }) => {
  test.skip(!isMobile, "the tap strip is the touch view")
  const feed = await openBook(page)
  feed.book("BTC", bids, asks)
  await expect(cells(page, "bids", 0)).toHaveText(["81,000", "1.00000", "1.00000"])
  const slots = await rows(page, "bids").count()
  const top = (await rows(page, "asks").first().boundingBox())?.y
  await rows(page, "bids").nth(1).tap()
  await expect(page.getByTestId("sweep")).toBeVisible()
  feed.book("BTC", ladder(80_990, -1, sizes(20)), ladder(80_991, 1, sizes(20)))
  await expect(cells(page, "bids", 0)).toHaveText(["80,990", "1.00000", "1.00000"])
  await expect(page.getByTestId("sweep")).toHaveCount(0)
  await expect(page.getByLabel("Precision")).toBeVisible()
  expect(await rows(page, "bids").count()).toBe(slots)
  expect((await rows(page, "asks").first().boundingBox())?.y).toBe(top)
})

test("the column labels sit right on the first row at any height, spare space goes below the book", async ({
  page,
}) => {
  const feed = await openBook(page)
  feed.book("BTC", bids, asks)
  await expect(cells(page, "bids", 0)).toHaveCount(3)
  for (const height of [700, 712, 724, 736]) {
    await page.setViewportSize({ width: page.viewportSize()?.width ?? 400, height })
    await page.waitForTimeout(100)
    const gap = await page.evaluate(() => {
      const header = [...document.querySelectorAll("[data-widget] span")].find((span) =>
        span.textContent?.startsWith("Size ("),
      )?.parentElement
      const top = Math.min(
        ...[...document.querySelectorAll("[data-testid=asks] > *")].map((row) => row.getBoundingClientRect().top),
      )
      return Math.round(top - (header?.getBoundingClientRect().bottom ?? 0))
    })
    expect(gap, `${height}px tall`).toBe(0)
  }
})

test("tapping a level on touch keeps every row in place", async ({ page, isMobile }) => {
  test.skip(!isMobile, "the tap strip is the touch view")
  for (const height of [760, 780, 800]) {
    await page.setViewportSize({ width: page.viewportSize()?.width ?? 400, height })
    const feed = await openBook(page, { path: "/trade/BTC", subscriptions: 4 })
    feed.book("BTC", bids, asks)
    await expect(rows(page, "bids").first()).toContainText("81,000")
    const before = await rows(page, "asks").count()
    const top = (await rows(page, "asks").first().boundingBox())?.y
    await rows(page, "bids").nth(2).tap()
    await expect(page.getByTestId("sweep")).toBeVisible()
    expect(await rows(page, "asks").count(), `${height}px tall`).toBe(before)
    expect((await rows(page, "asks").first().boundingBox())?.y, `${height}px tall`).toBe(top)
  }
})

test("the menu shows one side, both sides or both side by side", async ({ page }) => {
  await page.setViewportSize({ width: page.viewportSize()?.width ?? 400, height: 480 })
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
  await page.getByLabel("Book settings").click()
  await expect(page.getByRole("menuitemradio", { name: "Stacked" })).toBeVisible()
  if (isMobile) {
    await expect(page.getByRole("menuitemradio", { name: "Large" })).toHaveCount(0)
    return
  }
  await page.getByRole("menuitemradio", { name: "Large" }).click()
  await expect(page.getByTestId("trades")).toBeVisible()
  tape = await page.getByTestId("trades").boundingBox()
  const large = await page.getByTestId("bids").boundingBox()
  expect(tape?.x ?? 0).toBeGreaterThan(large?.x ?? 0)
})

test("switching panel mode moves the book and the tape without rebuilding them", async ({ page }) => {
  const feed = await openBook(page)
  feed.book("BTC", bids, asks)
  feed.trades("BTC", [{ side: "B", px: 81_001, sz: 0.1, time: 1, tid: 1 }])
  await expect(cells(page, "bids", 0)).toHaveText(["81,000", "1.00000", "1.00000"])
  await expect(page.getByTestId("trades").locator(":scope > div")).toHaveCount(1)
  const row = await rows(page, "bids").first().elementHandle()
  const print = await page.getByTestId("trades").locator(":scope > div").first().elementHandle()
  for (const mode of ["Stacked", "Tab", "Stacked"]) {
    await choose(page, mode)
    expect(await row?.evaluate((element) => element.isConnected), mode).toBe(true)
    expect(await print?.evaluate((element) => element.isConnected), mode).toBe(true)
  }
})

test("stacked on a phone keeps the controls on top and the book snug against the trades", async ({
  page,
  isMobile,
}) => {
  test.skip(!isMobile, "phone layout")
  const feed = await openBook(page, { path: "/trade/BTC", subscriptions: 4 })
  feed.book("BTC", bids, asks)
  await expect(rows(page, "bids").first()).toContainText("81,000")
  await choose(page, "Stacked")
  await expect(page.getByTestId("trades")).toBeVisible()
  const controls = await page.getByLabel("Precision").boundingBox()
  const firstAsk = await rows(page, "asks").last().boundingBox()
  expect(controls?.y ?? 0).toBeLessThan(firstAsk?.y ?? 0)
  const gap = await page.evaluate(() => {
    const bids = [...document.querySelectorAll("[data-testid=bids] > *")].at(-1)?.getBoundingClientRect()
    const trades = [...document.querySelectorAll("[data-widget] span")]
      .find((span) => span.textContent === "Trades")
      ?.closest("div")
      ?.getBoundingClientRect()
    return Math.round((trades?.top ?? 0) - (bids?.bottom ?? 0))
  })
  expect(gap).toBeLessThanOrEqual(1)
  expect(await page.evaluate(() => document.scrollingElement?.scrollHeight ?? 0)).toBeLessThanOrEqual(
    page.viewportSize()?.height ?? 0,
  )
})

test("pauses its streams while hidden and streams again when shown", async ({ page }) => {
  const feed = await openBook(page)
  feed.book("BTC", bids, asks)
  await expect(cells(page, "bids", 0)).toHaveText(["81,000", "1.00000", "1.00000"])
  await page.locator("[data-widget]").evaluate((widget) => {
    widget.style.display = "none"
  })
  await expect.poll(() => feed.unsubscribed.length).toBe(3)
  const polls = feed.requests.length
  await page.waitForTimeout(1_200)
  expect(feed.requests.length).toBe(polls)
  await page.locator("[data-widget]").evaluate((widget) => {
    widget.style.display = ""
  })
  await waitForSubscriptions(feed, 6)
  feed.fast("BTC", ladder(81_010, -1, nine), ladder(81_011, 1, nine))
  await expect(cells(page, "bids", 0)).toHaveText(["81,010", "9.00000", "9.00000"])
})

test("search filters by name and Enter switches every subscription to the new market", async ({ page }) => {
  const feed = await openBook(page, { path: "/trade/BTC", subscriptions: 4 })
  await searchButton(page).click()
  const field = page.getByPlaceholder("Search")
  const options = page.getByTestId("market-option")
  await expect
    .poll(() => options.evaluateAll((elements) => elements.map((element) => element.getAttribute("data-coin"))))
    .toEqual(["BTC", "ETH", "SOL", "HYPE"])
  await field.fill("so")
  await expect(options).toHaveCount(1)
  await field.press("Enter")
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
  await openBook(page, { path: "/trade/BTC", subscriptions: 4 })
  await page.keyboard.press("Control+k")
  await expect(page.getByTestId("market-option")).toHaveCount(4)
  const field = page.getByPlaceholder("Search")
  await field.press("ArrowDown")
  await field.press("ArrowDown")
  await expect(page.locator("[data-active=true]")).toContainText("SOL-USD")
  await field.press("Control+s")
  await expect(page.getByRole("button", { name: "Remove SOL from favorites" })).toBeVisible()
  await page.reload()
  await page.waitForFunction(() => document.querySelector("[data-testid=bids]"))
  await page.keyboard.press("Control+k")
  await expect(page.getByRole("button", { name: "Remove SOL from favorites" })).toBeVisible()
})

test("strict search hides delisted markets and All shows them", async ({ page }) => {
  await openBook(page, { path: "/trade/BTC", subscriptions: 4 })
  await searchButton(page).click()
  await page.getByPlaceholder("Search").fill("old")
  await expect(page.getByTestId("market-option")).toHaveCount(0)
  await page.getByRole("group", { name: "Listing" }).getByRole("button", { name: "All" }).click()
  await expect(page.getByTestId("market-option")).toHaveCount(1)
  await expect(page.getByTestId("market-option")).toContainText("OLD-USD")
  await expect(page.getByTestId("market-option")).toContainText("delisted")
})

for (const [width, height] of [
  [375, 667],
  [430, 932],
  [852, 393],
]) {
  test(`a ${width}x${height} phone gets a readable book, no sideways scroll and thumb-sized controls`, async ({
    page,
    isMobile,
  }) => {
    test.skip(!isMobile, "phone sizes")
    await page.setViewportSize({ width, height })
    const feed = await openBook(page, { path: "/trade/BTC", subscriptions: 4 })
    feed.book("BTC", bids, asks)
    await expect(rows(page, "bids").first()).toContainText("81,000")
    expect(await page.evaluate(() => document.scrollingElement?.scrollWidth ?? 0)).toBeLessThanOrEqual(width)
    expect(await rows(page, "bids").count()).toBeGreaterThanOrEqual(6)
    expect((await rows(page, "bids").first().boundingBox())?.height ?? 0).toBeGreaterThanOrEqual(24)
    for (const name of [
      "Precision",
      "Units",
      "Book settings",
      "Search markets",
      "Market details",
      "GitHub",
      "built by Rob",
    ]) {
      const box = await page
        .getByRole("button", { name })
        .or(page.getByRole("combobox", { name }))
        .or(page.getByRole("link", { name }))
        .boundingBox()
      expect(box?.height ?? 0, name).toBeGreaterThanOrEqual(40)
    }
    const controls = await page.getByLabel("Precision").boundingBox()
    const book = await rows(page, "bids").last().boundingBox()
    expect(controls?.y ?? 0).toBeGreaterThan(book?.y ?? 0)
  })
}

test("the app links its repo from the top corner and credits Rob in the footer", async ({ page }) => {
  await openBook(page, { path: "/trade/BTC", subscriptions: 4 })
  const repo = page.getByRole("link", { name: "GitHub" })
  const credit = page.getByRole("link", { name: "built by Rob" })
  await expect(repo).toHaveAttribute("href", "https://github.com/robebots/fullstack-fe")
  await expect(credit).toHaveAttribute("href", "https://robgungor.com")
  const app = await page.locator("main").boundingBox()
  const corner = await repo.boundingBox()
  const footer = await credit.boundingBox()
  const book = await page.locator("[data-widget]").boundingBox()
  expect((corner?.x ?? 0) + (corner?.width ?? 0)).toBeGreaterThan((app?.x ?? 0) + (app?.width ?? 0) - 16)
  expect(corner?.y ?? 99).toBeLessThan(16)
  expect(footer?.y ?? 0).toBeGreaterThan((book?.y ?? 0) + (book?.height ?? 0) - 1)
})

test("the loading state is the book's own layout, so nothing moves when data lands", async ({ page }) => {
  let release = () => {}
  const held = new Promise<void>((resolve) => {
    release = resolve
  })
  const feed = await mockFeed(page)
  await page.route("https://api.hyperliquid.xyz/info", async (route) => {
    await held
    await route.fallback()
  })
  await page.goto("/trade/BTC")
  const boxes = () =>
    page.evaluate(() =>
      ["asks", "bids", "spread"].map((id) => {
        const box = document.querySelector(`main [data-testid=${id}]`)?.getBoundingClientRect()
        return box && [box.x, box.y, box.width, box.height]
      }),
    )
  await expect(rows(page, "bids").first()).toBeVisible()
  const slots = await rows(page, "bids").count()
  const before = await boxes()
  release()
  await waitForSubscriptions(feed, 4)
  feed.book("BTC", bids, asks)
  await expect(rows(page, "bids").first()).toContainText("81,000")
  expect(await boxes()).toEqual(before)
  await expect(rows(page, "bids")).toHaveCount(slots)
})

test("switching panel mode keeps the book and the tape on screen", async ({ page }) => {
  const feed = await openBook(page)
  feed.book("BTC", bids, asks)
  feed.trades("BTC", [
    { side: "B", px: 81_001, sz: 0.1, time: 1, tid: 1 },
    { side: "A", px: 81_000, sz: 0.2, time: 2, tid: 2 },
  ])
  await expect(cells(page, "bids", 0)).toHaveText(["81,000", "1.00000", "1.00000"])
  feed.options.answer = false
  await choose(page, "Stacked")
  await expect(page.getByTestId("trades").locator(":scope > div")).toHaveCount(2)
  await expect(cells(page, "bids", 0)).toHaveText(["81,000", "1.00000", "1.00000"])
})

test("separate takers stay separate, zero hashes get no link, and a reconnect doesn't repeat prints", async ({
  page,
}) => {
  const feed = await openBook(page)
  const at = Date.UTC(2026, 9, 18, 12, 0, 5)
  const first = [
    { side: "B" as const, px: 81_001, sz: 0.1, time: at, tid: 11, users: ["0xa", "0xs"] as [string, string] },
    { side: "B" as const, px: 81_001, sz: 0.2, time: at, tid: 12, users: ["0xb", "0xs"] as [string, string] },
    { side: "A" as const, px: 81_000, sz: 0.3, time: at, tid: 13, hash: `0x${"0".repeat(64)}` },
  ]
  feed.trades("BTC", first)
  await page.getByRole("tab", { name: "Trades" }).click()
  const prints = page.getByTestId("trades").locator(":scope > div")
  await expect(prints).toHaveCount(3)
  await expect(prints.nth(0).getByRole("link")).toHaveCount(0)
  await expect(prints.nth(1).getByRole("link")).toHaveCount(1)
  await feed.sockets[0].close()
  await waitForSubscriptions(feed, 6)
  feed.trades("BTC", [...first, { side: "B", px: 81_002, sz: 0.4, time: at + 1_000, tid: 14 }])
  await expect(prints).toHaveCount(4)
})

test("unknown markets show a message and never subscribe", async ({ page }) => {
  const feed = await mockFeed(page)
  await page.goto("/trade/NOPE")
  await expect(page.getByText("Unknown market NOPE").filter({ visible: true })).toBeVisible()
  expect(feed.subscribed).toEqual([])
})

test("a failed market list offers a retry that recovers", async ({ page }) => {
  const feed = await mockFeed(page, 3)
  await page.goto("/embed/BTC")
  await page.getByRole("button", { name: "Retry" }).click({ timeout: 15_000 })
  await waitForSubscriptions(feed, 3)
  feed.book("BTC", bids, asks)
  await expect(cells(page, "bids", 0)).toHaveText(["81,000", "1.00000", "1.00000"])
})

test("the market bar streams live stats", async ({ page }) => {
  const feed = await openBook(page, { path: "/trade/BTC", subscriptions: 4 })
  expect(feed.subscribed).toContainEqual({ type: "activeAssetCtx", coin: "BTC" })
  const bar = page.getByTestId("market-bar")
  await expect(bar).toContainText("40x")
  feed.ctx("BTC", { markPx: "82000", oraclePx: "82010.5", funding: "-0.00002" })
  await expect(bar).toContainText("82,000")
  await page.getByRole("button", { name: "Market details" }).click()
  await expect(bar).toContainText("Oracle82,011")
  await expect(bar).toContainText("-0.0020%")
})

test("opening search pauses the book and closing it streams again", async ({ page }) => {
  const feed = await openBook(page, { path: "/trade/BTC", subscriptions: 4 })
  feed.book("BTC", bids, asks)
  await expect(rows(page, "bids").first()).toContainText("81,000")
  await page.keyboard.press("Control+k")
  await expect
    .poll(() => feed.unsubscribed.map((subscription) => subscription.type).sort())
    .toEqual(["bbo", "l2Book", "trades"])
  await page.keyboard.press("Escape")
  await waitForSubscriptions(feed, 7)
  feed.fast("BTC", ladder(81_010, -1, nine), ladder(81_011, 1, nine))
  await expect(rows(page, "bids").first()).toContainText("81,010")
})

test("switching market resets precision to full", async ({ page }) => {
  const feed = await openBook(page, { path: "/trade/BTC", subscriptions: 4 })
  feed.book("BTC", bids, asks)
  await expect(rows(page, "bids").first()).toContainText("81,000")
  await page.locator("[aria-label=Precision]:visible").click()
  await page.getByRole("option", { name: /^10\s*4 sig figs$/ }).click()
  await waitForSubscriptions(feed, 5)
  await searchButton(page).click()
  await page.getByPlaceholder("Search").fill("eth")
  await page.getByPlaceholder("Search").press("Enter")
  await expect
    .poll(() => feed.subscribed.filter((subscription) => subscription.coin === "ETH"))
    .toContainEqual({
      type: "l2Book",
      coin: "ETH",
      fast: true,
    })
})
