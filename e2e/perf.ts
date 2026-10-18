import type { Page, TestInfo } from "@playwright/test"

declare global {
  interface Window {
    stopRecording?: () => { frames: number[]; longFrames: number[] }
    streamFeed?: (perSecond: number, ms: number) => Promise<number>
    latencies?: number[]
    eventDurations?: number[]
  }
}

export const quantile = (values: number[], p: number) => {
  const sorted = [...values].sort((a, b) => a - b)
  return sorted[Math.min(sorted.length - 1, Math.floor(p * sorted.length))] ?? 0
}

const round = (value: number) => Math.round(value * 10) / 10

export async function startRecording(page: Page) {
  await page.evaluate(() => {
    performance.clearMeasures()
    const frames: number[] = []
    const longFrames: number[] = []
    let id = requestAnimationFrame(function count(time) {
      frames.push(time)
      id = requestAnimationFrame(count)
    })
    const observer = new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) longFrames.push(entry.duration)
    })
    observer.observe({ type: "long-animation-frame" })
    window.stopRecording = () => {
      cancelAnimationFrame(id)
      observer.disconnect()
      return { frames, longFrames }
    }
  })
}

export async function stopRecording(page: Page) {
  const { frames, longFrames, measures } = await page.evaluate(() => {
    const recorded = window.stopRecording?.() ?? { frames: [], longFrames: [] }
    const measures = performance.getEntriesByType("measure").map(({ name, duration }) => ({ name, duration }))
    return { ...recorded, measures }
  })
  const commits = measures.filter((m) => m.name === "book").map((m) => m.duration)
  const gaps = frames.slice(1).map((time, i) => time - frames[i])
  return {
    frames: frames.length,
    frameP50Ms: round(quantile(gaps, 0.5)),
    frameP95Ms: round(quantile(gaps, 0.95)),
    commits: commits.length,
    renderP95Ms: round(quantile(commits, 0.95)),
    renderMaxMs: round(quantile(commits, 1)),
    longFrames: longFrames.length,
    longestFrameMs: Math.round(Math.max(0, ...longFrames)),
    rendered: measures.filter((m) => m.name !== "book").map((m) => m.name),
  }
}

export async function report(info: TestInfo, metrics: object) {
  console.log(`${info.title}: ${JSON.stringify(metrics)}`)
  await info.attach("metrics", { body: JSON.stringify(metrics, null, 2), contentType: "application/json" })
}

export function inPageFeed() {
  let seed = 7
  const random = () => {
    seed = (seed * 1_103_515_245 + 12_345) % 2_147_483_648
    return seed / 2_147_483_648
  }
  const level = (px: number) => ({ px: px.toFixed(1), sz: (random() * 4 + 0.01).toFixed(5), n: 1 })
  const side = (best: number, step: number, count: number) =>
    Array.from({ length: count }, (_, i) => level(best + i * step))
  const depth = `"l2Book","data":{"coin":"BTC","levels":${JSON.stringify([side(81_000, -1, 20), side(81_001, 1, 20)])},"time":`
  const bodies: string[] = []
  let bid = 81_000
  for (let i = 0; i < 2_000; i++) {
    bid += Math.round((random() - 0.5) * 3)
    bodies.push(
      i % 2
        ? `"bbo","data":{"coin":"BTC","bbo":${JSON.stringify([level(bid), level(bid + 1)])},"time":`
        : `"l2Book","data":{"coin":"BTC","fast":true,"levels":${JSON.stringify([side(bid, -1, 5), side(bid + 1, 1, 5)])},"time":`,
    )
  }
  const sockets: FakeSocket[] = []
  let time = 1
  const emit = (body: string) => {
    const data = `{"channel":${body}${time++}}}`
    for (const socket of sockets) socket.onmessage?.(new MessageEvent("message", { data }))
  }
  class FakeSocket {
    static OPEN = 1
    readyState = 0
    onopen: (() => void) | null = null
    onmessage: ((event: MessageEvent) => void) | null = null
    onclose: (() => void) | null = null
    constructor() {
      sockets.push(this)
      setTimeout(() => {
        this.readyState = 1
        this.onopen?.()
      })
    }
    send(raw: string) {
      const { method, subscription } = JSON.parse(raw)
      if (method !== "subscribe") return
      const echo =
        subscription.type === "bbo" ? subscription : { nSigFigs: null, mantissa: null, fast: false, ...subscription }
      emit(`"subscriptionResponse","data":{"method":"subscribe","subscription":${JSON.stringify(echo)},"time":`)
      if (subscription.type === "l2Book" && !subscription.fast) emit(depth)
    }
    close() {}
  }
  window.WebSocket = FakeSocket as unknown as typeof WebSocket
  window.streamFeed = (perSecond, ms) =>
    new Promise((resolve) => {
      const start = performance.now()
      let sent = 0
      const timer = setInterval(() => {
        const due = Math.min(ms, performance.now() - start) * (perSecond / 1000)
        while (sent < due) emit(bodies[sent++ % bodies.length])
      }, 4)
      setTimeout(() => {
        clearInterval(timer)
        resolve(sent)
      }, ms)
    })
}

export function trackLatency() {
  const arrivals = new Map<string, number>()
  const latencies: number[] = []
  const Native = window.WebSocket
  window.WebSocket = class extends Native {
    constructor(url: string | URL, protocols?: string | string[]) {
      super(url, protocols)
      this.addEventListener("message", (event) => {
        const marker = /"sz":"(7\.\d{5})"/.exec(String(event.data))?.[1]
        if (marker) arrivals.set(marker, performance.now())
      })
    }
  }
  new MutationObserver(() => {
    const text = document.querySelector("[data-testid=asks] > div > span:nth-of-type(2)")?.textContent ?? ""
    const arrived = arrivals.get(text)
    if (arrived === undefined) return
    latencies.push(performance.now() - arrived)
    arrivals.delete(text)
  }).observe(document, { subtree: true, childList: true, characterData: true })
  window.latencies = latencies
}
