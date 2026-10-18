"use client"

import { useEffect, useRef } from "react"
import Stats from "stats.js"

export function FrameStats({ className }: { className?: string }) {
  const host = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const stats = new Stats()
    stats.dom.style.position = "static"
    host.current?.append(stats.dom)
    let frame = requestAnimationFrame(function tick() {
      stats.update()
      frame = requestAnimationFrame(tick)
    })
    return () => {
      cancelAnimationFrame(frame)
      stats.dom.remove()
    }
  }, [])
  return <div ref={host} className={className} />
}
