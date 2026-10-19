"use client"

import { cn } from "cn"
import { useAtom } from "jotai"
import { frameStatsAtom } from "@/lib/prefs"
import { useFeedStatus } from "@/lib/status"
import { FrameStats } from "../frame-stats"

export function StatusBar() {
  const status = useFeedStatus()
  const live = status === "live"
  const [stats, setStats] = useAtom(frameStatsAtom)
  return (
    <footer className="flex h-7 shrink-0 items-center justify-between px-3 text-xs text-muted-foreground">
      <span
        className={cn(
          "flex items-center gap-1.5 rounded-cell border px-2 py-0.5",
          live ? "border-bid/40 text-bid" : "border-primary/40 text-primary",
        )}
      >
        <span className={cn("size-1.5 rounded-full", live ? "bg-bid" : "animate-pulse bg-primary")} />
        {live ? "Online" : "Connecting"}
      </span>
      <span className="flex gap-4">
        <button
          type="button"
          aria-pressed={stats}
          onClick={() => setStats(!stats)}
          className={cn("hover:text-foreground", stats && "text-primary")}
        >
          FPS
        </button>
        <a
          href="https://devnet.api.fullstack.trade/docs/api/"
          target="_blank"
          rel="noreferrer"
          className="hover:text-foreground"
        >
          Docs
        </a>
      </span>
      {stats && <FrameStats className="fixed bottom-9 left-2 z-40" />}
    </footer>
  )
}
