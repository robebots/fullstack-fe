const PUBLISH_MS = 50

export async function* paced(signal: AbortSignal, subscribe: (changed: () => void) => (() => void)[]) {
  let dirty = false
  let wake = () => {}
  let interrupt = () => {}
  const stops = subscribe(() => {
    dirty = true
    wake()
  })
  signal.addEventListener("abort", () => interrupt(), { once: true })
  const until = (start: (resolve: () => void) => void) =>
    signal.aborted
      ? Promise.resolve()
      : new Promise<void>((resolve) => {
          interrupt = resolve
          start(resolve)
        })
  let published = Number.NEGATIVE_INFINITY
  try {
    while (!signal.aborted) {
      if (!dirty) await until((resolve) => (wake = resolve))
      const wait = published + PUBLISH_MS - performance.now()
      if (wait > 0) await until((resolve) => setTimeout(resolve, wait))
      await until((resolve) => requestAnimationFrame(() => resolve()))
      if (signal.aborted) return
      dirty = false
      published = performance.now()
      yield
    }
  } finally {
    for (const stop of stops) stop()
  }
}
