const PUBLISH_MS = 50

export async function* paced(signal: AbortSignal, subscribe: (changed: () => void) => (() => void)[]) {
  let dirty = false
  let wake = () => {}
  const stops = subscribe(() => {
    dirty = true
    wake()
  })
  signal.addEventListener("abort", () => wake(), { once: true })
  let published = Number.NEGATIVE_INFINITY
  try {
    while (!signal.aborted) {
      if (!dirty) await new Promise<void>((resolve) => (wake = resolve))
      const wait = published + PUBLISH_MS - performance.now()
      if (wait > 0) await new Promise((resolve) => setTimeout(resolve, wait))
      await new Promise<number>(requestAnimationFrame)
      if (signal.aborted) return
      dirty = false
      published = performance.now()
      yield
    }
  } finally {
    for (const stop of stops) stop()
  }
}
