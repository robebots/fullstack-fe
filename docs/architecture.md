# Architecture

Status: implemented 2026-10-18. Every claim below has a test in `e2e/` that fails if it stops being true.

## Data flow

```text
wss://api.hyperliquid.xyz/ws
        |
        v
Feed (src/lib/feed.ts)           one socket, ack-gated subscriptions, reconnect, watchdog
        |  l2Book, l2Book fast, bbo
        v
frames() (src/lib/book.ts)       keeps the latest of each source, yields at most once per frame, at most 20 a second
        |  sources
        v
streamedQuery (src/lib/queries.ts)
  reducer: toView(sources, previous view)   merge by recency, cumulative totals, flash timestamps
        |  BookView in the TanStack Query cache, structurally shared
        v
useBook(select)                  one observer per component, select picks the slice it shows
        |
        v
<BookRow> x 24                   re-renders only when its own level changed
```

Jotai holds client state: coin, precision, unit and connection status. TanStack Query holds the server state: one live book per coin and precision.

## Feed

- One WebSocket per tab. A market uses three subscriptions: the 20-level `l2Book`, the 5-level `l2Book` with `fast: true`, and `bbo`.
- Entries are keyed by channel, coin and the `fast` flag, the same fields the messages carry. Subscribing a new precision on the same key sends `unsubscribe(old)` then `subscribe(new)`.
- An entry drops messages until the server acks it. Book messages don't carry `nSigFigs`, and in 24 measured swaps a stale snapshot arrived before the ack 7 times and never after it.
- The socket reconnects with backoff from 250 ms to 5 s and resubscribes everything. A watchdog closes the socket after 10 s of silence, which covers sleep and network changes that never fire `close`.
- The UI only offers valid `nSigFigs` and `mantissa` pairs. The server drops the whole socket on a bad one.

## Book engine

`toView` is pure. Each side merges the three sources newest first. The newest source owns every price it covers, and an older source only adds levels beyond that edge. If `bbo` says the best bid fell from 100 to 98, the fast book's 100 and 99 levels drop out.

`bbo` is never grouped, so it only joins the rows at full precision. It always drives the spread and mid, so the true spread stays visible when the book is grouped into $1,000 buckets.

Each row carries price, size, cumulative size, cumulative notional and `flashAt`. `flashAt` changes only when that price's size changed since the last frame, or when a new price appears inside the previous range. Unchanged rows come out deep-equal, and TanStack Query's structural sharing keeps their references, so a row's `select` returns the same object and React skips it.

## Scheduling

`frames()` waits for a message, then for the next animation frame, then yields a copy of the latest sources. Messages that arrive in between overwrite the previous ones. The feed is lossy by design, because only the latest book matters.

Publishes are at least 50 ms apart. Most Hyperliquid updates arrive further apart than that: the fast book every ~540 ms and bbo every ~170 ms at p50. The cap matters during bursts. At 1,000 msg/s it cut main-thread load from 78% to 34% at 1x CPU.

`notifyManager.setScheduler(queueMicrotask)` makes TanStack Query notify inside the same frame, so a publish reaches the DOM before that frame paints. Hidden tabs never run the animation frame, so nothing queues up while hidden.

## Rendering

- Rows are keyed by slot, meaning distance from the touch. The DOM never reorders; text and one custom property change.
- Depth bars use `scale: calc(var(--total) / var(--max))`. Each row sets `--total`. The container sets `--max`, rounded up to a 1, 2 or 5 step, so it rarely changes and never re-renders rows when it does. Bars ease over 200 ms on the compositor.
- Flashes animate the opacity of an overlay through the Web Animations API from a layout effect, with no React state. The previous flash on a row is cancelled first. Overlapping flashes made Chrome refuse to composite them (`TargetHasIncompatibleAnimations`).
- Rows use `contain: content`, fixed heights and tabular numerals.
- `prefers-reduced-motion` turns off bar transitions and hides flashes.

## Proof

`next build --profile` keeps React's Profiler on in production. Every row and the whole book sit in a `<Profiler>` that writes a `performance.measure` only in that build (`NEXT_PUBLIC_PROFILE=1`). Normal builds compile the call away.

`e2e/book.spec.ts` drives the UI through `page.routeWebSocket` with a scripted Hyperliquid server. It covers rendering, merge order, ack gating on precision switches, tick labels, coin switching, USD mode and reconnects.

`e2e/perf.spec.ts` covers the claims:

| Claim | How it's measured | Gate |
|---|---|---|
| Never more than one commit per frame, never more than 20 a second | In-page feed at 1,000 msg/s, three 3 s trials, Profiler commits against `requestAnimationFrame` count | every trial: commits ≤ frames and ≤ 61 |
| Rendering is cheap | Profiler `actualDuration` per commit | median trial p95 < 4 ms per 1x of CPU |
| Smooth at 1x under a 100x burst | `requestAnimationFrame` intervals, plus Long Animation Frames for the report | median trial over 55 fps, p95 frame < 20 ms |
| No freeze at 4x CPU | CDP `Emulation.setCPUThrottlingRate` | median trial's longest frame < 250 ms |
| One level change touches only its rows | Profiler measures for one changed level | exactly one commit, rows 9 to 11 only |
| Messages reach the DOM within a frame | Socket arrival time against MutationObserver time | p95 < 25 ms |
| Controls stay responsive | Event Timing during a precision switch | slowest event < 100 ms |
| No leaks | CDP heap after GC, before and after a 15 s stream | growth < 1 MB |

The stress feed runs inside the page because Playwright's socket mock costs main-thread time per message. With the mock, it was the bottleneck at 4x, not the app. Timing gates use the median of three trials because the VM shares its CPU (about 3% steal) and one stall in one trial shouldn't fail the suite. The structural gates hold for every trial.

## Measured, 2026-10-18

Headless Chromium 156 through Playwright 1.64, profiling build, on a shared 8-core AMD EPYC 9354P VM with no GPU, so Chromium rasterizes and composites on the CPU.

| Test | Result |
|---|---|
| 1,000 msg/s at 1x CPU, 9 runs | Seven runs held 60 fps with p95 frame 16.7 to 16.8 ms, render p95 1.1 to 2.1 ms and no frame over 50 ms. Two lost frames to host contention: one 144 ms stall (57.6 fps, render p95 3.5 ms), and one run at 51 fps with p95 frame 33 ms and render p95 5.2 ms. That run is why timing gates use the median of three trials. Commits stayed near 15 a second in every run. |
| 1,000 msg/s at 4x CPU, 9 runs | 17 to 26 fps, longest frame 75 to 109 ms, render p95 5.4 to 10.6 ms |
| One level change | 1 commit, rows `bids-9`, `bids-10`, `bids-11` |
| Message to DOM | p50 8.8 to 10.4 ms, p95 17.2 to 18.8 ms, max 20.3 ms |
| Precision switch | slowest input event 24 to 48 ms |
| Heap over 15 s | +119 to +474 KB after GC |

At the real feed rate the main thread runs 22 to 33% busy at 1x. About 4 points of that is the test's own feed generator. At 4x it runs 85 to 93% busy at 25 to 34 fps. With every animation off, 4x still runs 64% busy at 38 fps. Most of the cost is the work each update needs anyway: React, style, layout and paint, all on the CPU because the VM has no GPU.

## Decisions

- TanStack Query owns the live book because it is server state. `streamedQuery` ties the socket subscription to the query's lifetime: when the last observer leaves, the abort signal unsubscribes. Switching back to a market starts a fresh stream instead of showing a stale cached book.
- `select` with structural sharing gives row-level subscriptions without a hand-written store.
- Jotai holds the four pieces of client state. `statusAtom` subscribes to the socket in `onMount`.
- shadcn/ui on Base UI for the coin and precision selects and the unit toggle. Nothing in the hot path uses them.
- React Compiler is on, so no manual `memo` or `useCallback`.
- Colors come from the example's palette, which matches Tailwind v4 neutrals. Prices stay white like the example, and flashes are neutral so an ask row never flashes green.

## Skipped on purpose

- Canvas rendering. DOM rows hold 60 fps at 1x and stay selectable and accessible.
- A Web Worker. Messages are about 1.6 KB. Most main-thread time goes to React, style and layout, and none of that can move to a worker.
- Virtualization. There are never more than 24 rows.
- URL state, persistence and a trades tab. The brief doesn't ask for them.

## Prior art

- TkDodo, [Using WebSockets with React Query](https://tkdodo.eu/blog/using-web-sockets-with-react-query): push with `setQueryData` for frequent small updates, and set `staleTime: Infinity` when the socket delivers everything.
- TanStack Query [discussion #9065](https://github.com/TanStack/query/discussions/9065): control when the stream yields instead of writing every chunk.
- dYdX v4 web client ([orderbook.ts](https://github.com/dydxprotocol/v4-web/blob/main/src/bonsai/websocket/orderbook.ts)): merges deltas outside React and publishes at most every 500 ms. It draws on canvas.
- Serum DEX UI ([Orderbook.jsx](https://github.com/project-serum/serum-dex-ui/blob/master/src/components/Orderbook.jsx)): samples every 250 ms, memoized rows, flashes toggled through refs.
- Chrome, [Long Animation Frames](https://developer.chrome.com/docs/web-platform/long-animation-frames): suggests gating on LoAF in CI.
