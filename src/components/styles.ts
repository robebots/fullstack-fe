import { cn } from "cn"
import type { ProfilerOnRenderCallback } from "react"

export const grid =
  "grid grid-cols-[144px_1fr_auto] items-center pr-4 pl-5 pointer-fine:grid-cols-[20%_40%_40%] pointer-fine:px-2.5"

export const row = cn(grid, "relative text-base contain-content pointer-fine:text-xs")

export const size = "relative pointer-fine:text-right"

export const bar = "absolute inset-x-0 inset-y-1 origin-left pointer-fine:inset-y-0"

export const plain = "h-auto border-none bg-transparent p-0 dark:bg-transparent dark:hover:bg-transparent"

export const calm = typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches

export const onRender: ProfilerOnRenderCallback = (id, _phase, duration, _base, start) => {
  if (process.env.NEXT_PUBLIC_PROFILE) performance.measure(id, { start, duration })
}
