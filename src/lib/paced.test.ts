import { afterEach, expect, test, vi } from "vitest"
import { paced } from "./paced"

let frames = true

vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) =>
  frames ? setTimeout(() => callback(performance.now()), 1) : 0,
)

afterEach(() => {
  frames = true
})

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

function start() {
  const controller = new AbortController()
  const stop = vi.fn()
  let changed = () => {}
  const updates = paced(controller.signal, (notify) => {
    changed = notify
    return [stop]
  })
  const first = updates.next()
  return { controller, stop, updates, first, changed: () => changed() }
}

test("a burst of changes publishes once", async () => {
  const { controller, updates, first, changed } = start()
  for (let i = 0; i < 10; i++) changed()
  await first
  expect(await Promise.race([updates.next(), sleep(120).then(() => "idle")])).toBe("idle")
  controller.abort()
})

test("aborting while idle ends the stream and unsubscribes", async () => {
  const { controller, stop, first } = start()
  controller.abort()
  expect(await first).toEqual({ done: true, value: undefined })
  expect(stop).toHaveBeenCalledOnce()
})

test("an abort during the publish throttle ends the stream even with frames paused", async () => {
  const { controller, stop, updates, first, changed } = start()
  changed()
  await first
  frames = false
  const second = updates.next()
  changed()
  controller.abort()
  expect(await Promise.race([second, sleep(300).then(() => "hung")])).toEqual({ done: true, value: undefined })
  expect(stop).toHaveBeenCalledOnce()
})
