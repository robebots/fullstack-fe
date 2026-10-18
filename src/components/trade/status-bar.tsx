"use client"

import { cn } from "cn"
import { useFeedStatus } from "@/lib/status"

const LINKS = [
  { label: "Docs", href: "https://devnet.api.fullstack.trade/docs/api/" },
  { label: "Support", href: "https://www.fullstack.trade/" },
  { label: "Terms", href: "https://www.fullstack.trade/" },
  { label: "Privacy Policy", href: "https://www.fullstack.trade/" },
]

export function StatusBar() {
  const status = useFeedStatus()
  const live = status === "live"
  return (
    <footer className="flex h-7 shrink-0 items-center justify-between px-3 text-xs text-muted-foreground">
      <span
        data-testid="feed-status"
        data-status={status}
        className={cn(
          "flex items-center gap-1.5 rounded-[3px] border px-2 py-0.5",
          live ? "border-bid/40 text-bid" : "border-primary/40 text-primary",
        )}
      >
        <span className={cn("size-1.5 rounded-full", live ? "bg-bid" : "animate-pulse bg-primary")} />
        {live ? "Online" : "Connecting"}
      </span>
      <span className="flex gap-4">
        {LINKS.map((link) => (
          <a key={link.label} href={link.href} target="_blank" rel="noreferrer" className="hover:text-foreground">
            {link.label}
          </a>
        ))}
      </span>
    </footer>
  )
}
