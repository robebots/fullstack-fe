# Animation research

Collected 2026-10-18. Venue UIs come from their source code or from watching the live page in headless Chromium with `document.getAnimations()`, a MutationObserver and computed styles.

## How order books animate

| Who | Depth bars | Change feedback | Update cadence |
|---|---|---|---|
| Hyperliquid, live page | Absolute `div`, inline `width: N%`, opacity 0.15, `transition: all 0s`. Bars snap. | A separate overlay `div` per row, filled with the side's color (`rgb(115, 42, 54)` on asks, `rgb(30, 93, 82)` on bids). CSS keyframe on opacity: 0, then 0.7 at 20%, then 0, over 800 ms, `fill: forwards`. Prices are colored by side. The header price fades text color from green or red to white over 1.8 s. | Not measured on their page. Their feed is the one in [hyperliquid-feed.md](hyperliquid-feed.md). |
| dYdX v4 web, [source](https://github.com/dydxprotocol/v4-web/blob/main/src/hooks/Orderbook/useDrawOrderbook.ts) | Canvas `fillRect`, width = depth / range. No tween. | When a level disappears, its size text is redrawn in the side color, the frame holds for 350 ms (`ORDERBOOK_ANIMATION_DURATION`), then the new book is drawn. Updates in place get no animation. The trades table pulses text color with a 0.5 s keyframe, gated by `prefers-reduced-motion: no-preference`. | lodash `throttle` at 500 ms |
| Serum DEX UI, [source](https://github.com/project-serum/serum-dex-ui/blob/master/src/components/Orderbook.jsx) | `width: N%`, no transition | `useEffect` on `[price, size]` adds a `flash` class and removes it after 250 ms. The class runs a 0.5 s keyframe on `background-color`. | 250 ms interval, skipped if the JSON is unchanged |
| Mango v4, [source](https://github.com/blockworks-foundation/mango-v4-ui/blob/main/components/trade/Orderbook.tsx) | Two `width: N%` divs per row, one for the level size at 30% opacity and one for the cumulative share at 40% | Same class-toggle pattern: `green-flash` or `red-flash` by side, a 0.5 s keyframe from the muted side color to transparent on `background-color`. Users can turn it off. | On store change, skipped when `isEqual` |
| michax take-home, [write-up](https://reactjsexample.com/trading-application-with-embedded-order-book-with-responsive-design/) | Width. The author measured smaller repaint areas than transform, gradient or `background-size`. Gives no numbers. | Not described | Not described |

Binance's page loaded from our server, but its socket stayed on "Connecting", so nothing moved to observe. Bybit refused the connection.

None of them use an animation library. Every production venue snaps its bars. Flashes are either a side-colored background or a side-colored overlay.

## Articles and skills

- [dev.to, CSS animations and transitions](https://dev.to/weatherclockdash/css-animations-and-transitions-what-to-animate-prefers-reduced-motion-and-performance-4lan): animate `transform` and `opacity`, and use `will-change` sparingly. Its bar pattern is `transform: scaleX(var(--progress))` with `transform-origin: left` and a transition, which is what we ship. Its own progress example then transitions `width`.
- [ogBlocks, performant animations in React](https://ogblocks.dev/blog/performant-animations-in-react): transform and opacity, and Motion's `layout` prop with `AnimatePresence`. Mostly a sales page. Motion's layout animations read element boxes, which costs too much for 24 rows at 20 Hz.
- [OceanoBe, HFT front-end performance](https://oceanobe.com/news/front%E2%80%91end-performance-optimization-for-high%E2%80%91frequency-trading-interfaces/1634): buffer socket messages, batch work into `requestAnimationFrame`, use canvas for depth. No code, and its numbers have no source.
- Meng To's `optimize-web-animations` skill ([SKILL.md](https://github.com/MengTo/Skills/blob/main/agent-skills/codex/optimize-web-animations/SKILL.md), mirrored on getclaudeskills.com, which returned 500): measure first, pause offscreen work, cancel every frame, timer and observer on unmount, and don't trust screenshots as proof.
- mcpmarket `web-animation-optimizer`: blocked with a 403 from both a fetch and a real browser, and not on GitHub under that name. Unread.

## What we took

- Bars snap. A bar is a number, and every venue shows the number as it is. A 200 ms tween showed depth that no longer existed, so it went.
- Flashes copy Hyperliquid: an overlay in the row's side color, opacity 0 to 0.3 at 20% and back to 0 over 800 ms. Opacity on an overlay stays on the compositor. A new flash cancels the running one, because overlapping animations fall back to the main thread.
- Prices are colored by side, as on Hyperliquid and Binance.
- With reduced motion on, the flash call is skipped entirely, like dYdX's gate.
- The trades tab copies the Hyperliquid tab: price colored by aggressor, size, time. New prints get the same side-colored pulse through a CSS keyframe that runs once when the row mounts. Rows are keyed by trade id, so only new prints animate.
- No animation library. Nobody uses one for this.
