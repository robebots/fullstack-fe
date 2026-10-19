import { cn } from "cn"
import type { ProfilerOnRenderCallback } from "react"

export const grid = "grid grid-cols-[30%_35%_35%] items-center px-2.5 pointer-coarse:px-3"

export const row = cn(grid, "relative h-(--row) shrink-0 text-xs contain-content")

export const split = "relative grid h-(--row) shrink-0 grid-cols-2 items-center px-2.5 text-xs contain-content"

export const bar = "absolute inset-x-0 inset-y-px"

export const cell = "relative pointer-fine:hover:font-semibold"

export const underline = "relative after:absolute after:inset-x-0 after:-bottom-px after:h-0.5 after:bg-primary"

export const bone = "block h-2 rounded-sm bg-line"

export const plain = "h-auto border-none bg-transparent p-0 dark:bg-transparent dark:hover:bg-transparent"

export const calm = typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches

export const onRender: ProfilerOnRenderCallback = (id, _phase, duration, _base, start) => {
  if (process.env.NEXT_PUBLIC_PROFILE) performance.measure(id, { start, duration })
}
