import { expect, type Page, test } from "@playwright/test"
import { cells, ladder, openBook, sizes } from "./feed"
import { inPageFeed, quantile, report, startRecording, stopRecording, trackLatency } from "./perf"

async function openStressBook(page: Page, cpu: number) {
  await page.addInitScript(inPageFeed)
  await page.goto("/")
  await expect(cells(page, "bids", 11)).toHaveCount(3)
  const cdp = await page.context().newCDPSession(page)
  await cdp.send("Emulation.setCPUThrottlingRate", { rate: cpu })
  return cdp
}

async function streamTrial(page: Page) {
  await startRecording(page)
  const sent = await page.evaluate(() => window.streamFeed?.(1_000, 3_000) ?? 0)
  const { rendered, ...metrics } = await stopRecording(page)
  return { sent, ...metrics }
}

for (const cpu of [1, 4]) {
  test(`renders at most once per frame under a 1,000 msg/s stream at ${cpu}x CPU`, async ({ page }, info) => {
    await openStressBook(page, cpu)
    const trials = [await streamTrial(page), await streamTrial(page), await streamTrial(page)]
    await report(info, { cpu, trials })
    for (const trial of trials) {
      expect(trial.commits).toBeLessThanOrEqual(trial.frames)
      expect(trial.commits).toBeLessThanOrEqual(3_000 / 50 + 1)
    }
    const median = (key: "frames" | "frameP95Ms" | "renderP95Ms" | "longestFrameMs") =>
      quantile(
        trials.map((trial) => trial[key]),
        0.5,
      )
    expect(median("renderP95Ms")).toBeLessThan(4 * cpu)
    if (cpu === 1) {
      expect(median("frames") / 3).toBeGreaterThan(55)
      expect(median("frameP95Ms")).toBeLessThan(20)
    } else {
      expect(median("longestFrameMs")).toBeLessThan(250)
    }
  })
}

test("one level change re-renders only the rows that show it", async ({ page }, info) => {
  const feed = await openBook(page)
  const bids = ladder(81_000, -1, sizes(20))
  const asks = ladder(81_001, 1, sizes(20))
  feed.book("BTC", bids, asks)
  await expect(cells(page, "bids", 11)).toHaveText(["80,989", "12.00000", "78.00000"])
  await startRecording(page)
  feed.book(
    "BTC",
    bids.map(([px, sz], i) => [px, i === 9 ? sz + 0.5 : sz]),
    asks,
  )
  await expect(cells(page, "bids", 9)).toHaveText(["80,991", "10.50000", "55.50000"])
  const { commits, rendered } = await stopRecording(page)
  await report(info, { commits, rendered })
  expect(commits).toBe(1)
  expect(rendered.sort()).toEqual(["bids-10", "bids-11", "bids-9"])
})

test("a message reaches the DOM within one frame", async ({ page }, info) => {
  const feed = await openBook(page, trackLatency)
  feed.book("BTC", ladder(81_000, -1, sizes(20)), ladder(81_001, 1, sizes(20)))
  await expect(cells(page, "asks", 0)).toHaveCount(3)
  for (let i = 1; i <= 60; i++) {
    feed.bbo("BTC", [81_000, 1], [81_001, Number(`7.${String(i).padStart(5, "0")}`)])
    await page.waitForTimeout(100)
  }
  const latencies = await page.evaluate(() => window.latencies ?? [])
  const metrics = {
    samples: latencies.length,
    p50Ms: Math.round(quantile(latencies, 0.5) * 10) / 10,
    p95Ms: Math.round(quantile(latencies, 0.95) * 10) / 10,
    maxMs: Math.round(quantile(latencies, 1) * 10) / 10,
  }
  await report(info, metrics)
  expect(latencies.length).toBeGreaterThan(50)
  expect(metrics.p95Ms).toBeLessThan(25)
})

test("switching precision responds well inside the INP budget", async ({ page }, info) => {
  const feed = await openBook(page)
  feed.book("BTC", ladder(81_000, -1, sizes(20)), ladder(81_001, 1, sizes(20)))
  await expect(cells(page, "bids", 0)).toHaveCount(3)
  await page.evaluate(() => {
    const durations: number[] = []
    new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) durations.push(entry.duration)
    }).observe({ type: "event", durationThreshold: 16 } as PerformanceObserverInit)
    window.eventDurations = durations
  })
  await page.getByLabel("Precision").click()
  await page.getByRole("option", { name: /^10\s*4 sig figs$/ }).click()
  await expect(page.getByLabel("Precision")).toHaveText(/^10\b/)
  await page.waitForTimeout(200)
  const durations = await page.evaluate(() => window.eventDurations ?? [])
  const slowestMs = Math.max(0, ...durations)
  await report(info, { eventsOver16ms: durations.length, slowestMs })
  expect(slowestMs).toBeLessThan(100)
})

test("heap stays flat across a 15 s stream", async ({ page }, info) => {
  const cdp = await openStressBook(page, 1)
  const heap = async () => {
    await page.evaluate(() => performance.clearMeasures())
    await cdp.send("HeapProfiler.collectGarbage")
    return (await cdp.send("Runtime.getHeapUsage")).usedSize
  }
  await page.evaluate(() => window.streamFeed?.(200, 3_000))
  const before = await heap()
  const sent = await page.evaluate(() => window.streamFeed?.(200, 15_000) ?? 0)
  const after = await heap()
  const growthKb = Math.round((after - before) / 1024)
  await report(info, { sent, beforeKb: Math.round(before / 1024), afterKb: Math.round(after / 1024), growthKb })
  expect(growthKb).toBeLessThan(1024)
})
