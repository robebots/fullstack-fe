# Architecture

Status: implemented 2026-10-18. Every claim below has a test in `e2e/` that fails if it stops being true.

## Data flow

```text
wss://api.hyperliquid.xyz/ws
        |
        v
Feed (src/lib/feed.ts)        one socket per tab, shared by every widget: subscriptions gated on their ack,
        |                     handler sets per subscription, info requests matched by id,
        |                     reconnect with backoff, 10 s silence watchdog
        |
        +-- depth: l2Book info request every 500 ms (20 levels)
        +-- push: l2Book fast (5 levels, ~540 ms), bbo (~170 ms)
        +-- push: trades
        v
paced() (src/lib/paced.ts)    yields at most once per animation frame and once per 50 ms
        |
        +-- bookFrames -> streamedQuery reducer toView: merge by recency, cumulative totals, flash marks
        +-- tradeFrames -> streamedQuery reducer toTape: merge one taker's fills, newest first, 40 kept
        v
TanStack Query cache          one client for every widget; structural sharing keeps unchanged rows' references
        v
useBook(select) / useTrades(select)   each component subscribes to the slice it shows
```

## Widget

`OrderBook` in `src/components/order-book.tsx` is the whole widget. Pages only place it.

- Props are `market`, `onPriceSelect` and `className`. It fills its container.
- Each instance creates its own Jotai store for coin, precision, unit, row count and the tapped level. Two books on one page never share a dropdown.
- Every instance uses one module-level `QueryClient`, so two widgets on the same coin and precision read one stream.
- An `IntersectionObserver` unmounts the widget's content when it leaves the viewport or gets hidden. The queries lose their last observer, TanStack Query aborts their signal, and `paced()` unsubscribes in its `finally`. Showing the widget again resubscribes.
- A tap on a level sets the selection and calls `onPriceSelect` with `{ coin, side, price }`. An ask maps to buy and a bid to sell, the way a click on a venue's book fills its order form.
- `/embed/[market]` renders one widget full page for iframes. The home page renders the mock on phones and, on a wide screen with a mouse, a BTC book and an ETH book wired to a demo ticket.

## Feed

- One WebSocket per tab. A market uses three subscriptions (`l2Book` with `fast: true`, `bbo`, `trades`) and one repeating info request for 20-level depth.
- The 20-level `l2Book` subscription only pushes every ~5.4 s. Merged under a fresh top of book, its levels left holes in the ladder whenever price moved. An info request over the same socket returns a fresh book in ~155 ms, so depth is polled every 500 ms instead. Replies carry the request id, so they can't be mistaken for another precision.
- Subscriptions are keyed by channel, coin and the `fast` flag, the same fields the messages carry. Identical subscriptions share one entry with a set of handlers, and the last handler out unsubscribes. A different precision on the same key sends `unsubscribe(old)` then `subscribe(new)`, and the entry drops pushes until the server acks it. In 24 measured swaps a stale snapshot arrived before the ack 7 times and never after.
- That key is also the known limit. Book messages don't carry `nSigFigs`, so two widgets on one coin at different precisions can't share the fast book. The later one takes it, and the other keeps 500 ms depth and `bbo`.
- Entries and request handlers are registered before anything is sent, so even an instant reply finds its handler.
- On a drop the client reconnects with backoff from 250 ms to 5 s, resubscribes everything and fails pending requests. A watchdog closes the socket after 10 s of silence, which covers sleep and network changes that never fire `close`.
- The UI only offers valid `nSigFigs` and `mantissa` pairs. The server drops the whole socket on a bad one.

## Book engine

`toView` is pure. Each side merges depth, the fast book and `bbo`, newest first. The newest source owns every price it covers, and an older source only adds levels beyond that edge. If `bbo` says the best bid fell from 100 to 98, the older 100 and 99 levels drop out.

`bbo` is never grouped, so it only joins the rows at full precision. It always drives the spread, so the true spread stays visible when the book is grouped into $1,000 buckets.

Each row carries price, size, cumulative size, cumulative notional, `flashAt` and `pulse`. `flashAt` changes only when that price's size changed since the last frame, or when a new price appears inside the previous range. `pulse` is the size change over the larger of the two sizes, and a new level counts as 1. Unchanged rows come out deep-equal, structural sharing keeps their references, and React skips them.

## Tape

`toTape` merges consecutive fills with the same side, price and timestamp, which is one taker order hitting several makers. On BTC that was 42 of 105 live prints. `side: "B"` is a market buy; the probe checked every print against the touch at that moment. The tape keeps 40 prints, newest first, and marks everything after the first snapshot as fresh so only new prints animate.

The header shows the last print, colored by aggressor. Both tabs stay mounted and the hidden one keeps streaming, so switching is instant and the tape has no gap.

## Scheduling

`paced()` waits for data, then for the next animation frame, then yields. Both streams use it. The book keeps only the latest of each source, because a newer snapshot replaces an older one. The tape keeps every print, because skipping a trade would lose information.

Publishes are at least 50 ms apart. Most Hyperliquid updates arrive further apart than that, so the cap only matters in bursts. At 1,000 msg/s it cut main-thread load from 78% to 34% at 1x CPU.

`notifyManager.setScheduler(queueMicrotask)` makes TanStack Query notify inside the same frame, so a publish reaches the DOM before that frame paints. Hidden tabs never run the animation frame, so nothing queues up while hidden.

## How it should feel

The brief asks for liveness, smoothness, readability and information. A trader judges those against the venues, so these choices follow Hyperliquid's own book (see [animation-research.md](animation-research.md)):

- Bars snap. Every venue does it. A tweened bar shows depth that no longer exists for 200 ms.
- Change is shown by a flash, not by moving data. The flash is an overlay in the row's side color that peaks at 20% of 800 ms and fades out, the curve Hyperliquid uses. Its peak opacity runs from 0.08 to 0.35 with `pulse`, so a top-up blinks and a pulled wall flares. A new flash cancels the running one, which keeps it on the compositor.
- Prices stay white, as in the mock. Side reads from the bar color, and the tape colors each print by aggressor.
- The tape merges one taker's fills, so a 5 BTC market buy reads as one print instead of six.
- Rows are keyed by slot and never reorder. Whole-pixel row heights and tabular numerals keep digits from jumping.
- Smoothness comes from steady pacing and stable layout, not from tweening numbers.
- Reduced motion skips the flash and the print pulse entirely.

## Information

- Each bar has two layers. The light one is cumulative depth. The darker one inside it is the size at that level alone, so a wall shows up as a long dark segment.
- A 2 px line under the spread splits visible depth into bid share and ask share.
- Tapping a level prices a market order that sweeps to it: size, average fill and distance from mid in basis points. Levels the sweep would eat get a light tint, and the tapped one a stronger one. It updates live and clears on a second tap, a coin change or a precision change.

## Rendering

- Phones follow the mock, measured at 1x: 80 px header card, 52 px tabs with a 3 px underline under the label, 56 px column header, rows sized from the mock's 36.5 px pitch with bars inset 4 px, a 35 px spread row and a 56 px footer. Inter matched the mock's text proportions within 2%, closer than nine other fonts we tested. [design.md](design.md) has the details.
- Density follows the pointer, not the width. Tailwind's `pointer-fine:` variants switch the same components to Hyperliquid's desktop book: rows of at least 23 px, 12 px type, controls on top. A touch tablet keeps finger-sized rows.
- Rows fit the height. A `ResizeObserver` on the ask side divides its height by the minimum row height to get 1 to 20 rows a side, then gives every row the same whole-pixel pitch. Fractional pitches left 1 px seams between bars, because the scaled bars snap to different pixels.
- Depth bars use `scale: calc(var(--total) / var(--max))`, and the wall layer uses `--size`. Each row sets its own variables. The container sets `--max`, rounded up to a 1, 2 or 5 step, so it rarely changes and never re-renders rows when it does.
- Book flashes run through the Web Animations API from a layout effect, with no React state. Tape pulses are a CSS keyframe on mount.
- Rows use `contain: content`. Tape rows are memoized because the list prepends.
- Both tab panels stay mounted in one grid cell. The inactive one is `visibility: hidden` and `inert` instead of `display: none`, so the card height never jumps.

## Proof

`next build --profile` keeps React's Profiler on in production. The book, each book row and the tape sit in `<Profiler>`s that write `performance.measure` entries only in that build (`NEXT_PUBLIC_PROFILE=1`). Normal builds compile the call away.

Every test runs twice, once on a Pixel 7 profile and once on desktop Chrome. `e2e/book.spec.ts` drives the UI through `page.routeWebSocket` with a scripted Hyperliquid server that answers subscriptions and depth requests. It covers depth, merge order, precision switches, tick labels, coin switching, USD mode, the tape, hidden-tab streaming, reconnects, the fill price on tap, the imbalance line, rows fitting the height, pausing while hidden, and two books on one socket feeding the ticket.

`e2e/perf.spec.ts` covers the claims:

| Claim | How it's measured | Gate |
|---|---|---|
| Never more than one book commit per frame, never more than 20 a second | In-page feed at 1,000 msg/s with depth, fast book, bbo and trades, three 3 s trials | every trial: commits ≤ frames and ≤ 61 |
| Rendering is cheap | Profiler `actualDuration` per book commit | best trial p95 < 4 ms per 1x of CPU |
| Smooth at 1x under a 100x burst | `requestAnimationFrame` intervals, plus Long Animation Frames for the report | best trial over 55 fps, p95 frame < 20 ms |
| No freeze at 4x CPU | CDP `Emulation.setCPUThrottlingRate` | best trial's longest frame < 250 ms |
| One level change touches only its rows | Profiler measures after changing the third bid | exactly one commit, rendering that row and the deeper rows on screen |
| Messages reach the DOM within a frame | Socket arrival time against MutationObserver time | p95 < 25 ms |
| Controls stay responsive | Event Timing during a precision switch | slowest event < 100 ms |
| No leaks | CDP heap after GC, before and after a 15 s stream | growth < 1 MB |

The stress feed runs inside the page because Playwright's socket mock costs main-thread time per message, which made it the bottleneck at 4x. Timing gates use the best of three trials because the VM shares its CPU (about 3% steal) and contention only ever adds time. A median still failed once when load stayed high for a whole test. The structural gates hold for every trial, and every trial is reported.

## Measured, 2026-10-18

Headless Chromium 156 through Playwright 1.64, profiling build, on a shared 8-core AMD EPYC 9354P VM with no GPU.

| Test | Result |
|---|---|
| 1,000 msg/s at 1x CPU | 60 fps in 5 of 6 trials with p95 frame 16.7 to 16.8 ms. One trial hit 55 fps, longest frame 84 ms. Render p95 0.8 to 2.0 ms. |
| 1,000 msg/s at 4x CPU | 11 to 13 fps, longest frame 116 to 210 ms, render p95 4.7 to 18.7 ms |
| One level change | 1 commit. Rows `bids-2` to `bids-5` with 6 rows on screen, `bids-2` to `bids-10` with 11. |
| Message to DOM | p50 10.9 to 11.0 ms, p95 17.8 to 18.1 ms, max 18.7 to 19.3 ms |
| Precision switch | slowest input event 32 ms |
| Heap over 15 s | -168 to +228 KB after GC, with the 40-print tape filled |
| Live BTC, 20 s | 12 of 12 rows on both sides in every half-second sample |

The wall layer costs paint, not React. Without it the 4x run did 13 to 17 fps with a longest frame of 97 to 142 ms, against 11 to 13 fps and 116 to 210 ms with it. At 1x it holds 60 fps either way, and this VM rasterizes on the CPU, so a real GPU narrows the gap. It stays because it shows walls.

Earlier builds ran the stress test nine times. Two runs lost frames to host contention, and those runs are why the timing gates take the best trial.

## Skipped on purpose

- Canvas rendering. DOM rows hold 60 fps at 1x and stay tappable and accessible.
- A Web Worker. Messages are about 1.6 KB. Most main-thread time goes to React, style and layout, and none of that can move to a worker.
- Virtualization. There are never more than 40 rows in view.
- An animation library. CSS keyframes and the Web Animations API on opacity cover everything here.
- A socket per precision. It would lift the same-coin limit, but Hyperliquid allows 10 connections per IP, and one book per coin is the normal layout.
- Order entry. It needs a signed action from a wallet, and the brief asks for a market data widget.

## Prior art

- TkDodo, [Using WebSockets with React Query](https://tkdodo.eu/blog/using-web-sockets-with-react-query): push with `setQueryData` for frequent small updates, and set `staleTime: Infinity` when the socket delivers everything.
- TanStack Query [discussion #9065](https://github.com/TanStack/query/discussions/9065): control when the stream yields instead of writing every chunk.
- dYdX v4 web ([useDrawOrderbook.ts](https://github.com/dydxprotocol/v4-web/blob/main/src/hooks/Orderbook/useDrawOrderbook.ts)): publishes at most every 500 ms and draws on canvas.
- Serum and Mango: memoized rows, flashes toggled through refs, bars sized by width.
- Chrome, [Long Animation Frames](https://developer.chrome.com/docs/web-platform/long-animation-frames): suggests gating on LoAF in CI.
