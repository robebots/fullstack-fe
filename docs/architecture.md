# Architecture

Status: implemented 2026-10-18. Every claim below has a test in `e2e/` that fails if it stops being true.

## Data flow

```text
https://api.hyperliquid.xyz/info   metaAndAssetCtxs: every perp with its size decimals, max leverage and stats
        |
        v
marketsQuery (src/lib/markets.ts)  the market list; refetched every 5 s while search is open

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
        +-- push: activeAssetCtx (market bar stats)
        v
paced() (src/lib/paced.ts)    yields at most once per animation frame and once per 50 ms
        |
        +-- bookFrames -> streamedQuery reducer toView: merge by recency, cumulative totals, flash marks
        +-- tradeFrames -> streamedQuery reducer toTape: merge one taker's fills, newest first, 40 kept
        +-- statsFrames -> streamedQuery: latest mark, oracle, funding, volume, open interest
        v
TanStack Query cache          one client for the page and every widget; structural sharing keeps unchanged rows' references
        v
useBook(select) / useTrades(select) / useStats(coin)   each component subscribes to the slice it shows
```

## Page

`TradePage` in `src/components/trade/` lays out Hyperliquid's trade page in Fullstack's brand.

- The market lives in the URL. `/` redirects to `/trade/BTC`, and switching markets calls `history.pushState`, which Next syncs into `usePathname`. Links are shareable and the back button works.
- From 1024 px wide: nav, a favorites strip, then a grid of market bar and chart, the book column, the order ticket, and the account tabs under the chart and book. The book column doubles when the widget reports Large mode through `onModeChange`.
- Below 1024 px: Hyperliquid's mobile view. Compact nav, a market bar with price and 24h change that expands to the full stats, page tabs for Chart, Order Book, Trades and Funding, and the book side by side.
- Both trees are in the DOM and CSS hides one. The hidden widget pauses itself, so only one streams.
- Search is a dialog. It opens from the pair name or ⌘K, takes the arrow keys, Enter and ⌘S, and sorts by any column. Favorites persist through `atomWithStorage`.
- The order ticket is a scaffold except its price. A book click calls `onPriceSelect`, which sets the side and price, and Mid reads the live mid.
- The footer's connection pill reads the feed status through `useSyncExternalStore`.
- The page runs [stats.js](https://github.com/mrdoob/stats.js/) for a live frame-rate readout. `/embed` and the widget leave it out.
- Nav, chart, order types, leverage and margin, and the account tabs are scaffolds.

## Markets

- `metaAndAssetCtxs` returns every perp on the main dex: 234 at the time of writing, 56 of them delisted. It's one HTTP request, cached, and refetched every 5 s while search is open.
- The widget waits for this list before it renders the book. That gives every market its size decimals, and it validates the coin before anything subscribes. An unknown coin shows a message instead of a subscription, because a bad subscription kills the socket.
- The market bar subscribes to `activeAssetCtx` for its coin and falls back to the list's stats until the first push lands. Open interest is shown in USD at the mark. 8h funding in search is the hourly rate times eight. The countdown runs to the next hourly payment.
- Coin icons come from `app.hyperliquid.xyz/coins/<coin>.svg`, falling back to the first letter when one is missing.

## Widget

`OrderBook` in `src/components/order-book.tsx` is the whole book and tape. The page places it in a column, and `/embed/[market]` places it full page.

- Props: `market`, `mode` (`tab`, `stacked`, `large`), `layout` (`both`, `split`, `bids`, `asks`), `view` (`book` or `trades`, which hides the tab bar for pages that own their tabs), `onPriceSelect`, `onModeChange` and `className`. `market` and `view` can change while mounted. `mode` and `layout` set the starting state, and the ⋮ menu changes it.
- Each instance creates its own Jotai store for coin, precision, unit, row count, mode, layout, tab, the tapped level and the hovered level. Two books on one page never share a dropdown.
- Every instance uses the page's `QueryClient`, so two widgets on the same coin and precision read one stream.
- An `IntersectionObserver` unmounts the widget's content when it leaves the viewport or gets hidden. The queries lose their last observer, TanStack Query aborts their signal, and `paced()` unsubscribes in its `finally`. Showing the widget again resubscribes.
- Large mode puts the book and tape side by side once the widget is at least 36 rem wide, using a container query. Narrower, it stacks them.
- Split layout shows bids on the left and asks on the right, each growing out from the center, like Hyperliquid's mobile book. A hidden side in the one-side layouts isn't rendered, and the visible one takes the whole panel.
- A click on a level sets the selection and calls `onPriceSelect` with `{ coin, side, price }`. An ask maps to buy and a bid to sell, the way a click on a venue's book fills its order form. Changing coin, precision or layout clears it.

## Feed

- One WebSocket per tab. A market uses three book subscriptions (`l2Book` with `fast: true`, `bbo`, `trades`), one repeating info request for 20-level depth, and on the trade page `activeAssetCtx`.
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

`sweepOf` prices a market order that eats the book to a level: total size, total notional, average price, and the average's distance from mid. The hover card and the tap strip both use it.

## Tape

`toTape` merges consecutive fills with the same side, price and timestamp, which is one taker order hitting several makers. On BTC that was 42 of 105 live prints. `side: "B"` is a market buy; the probe checked every print against the touch at that moment. A merged print keeps the first fill's transaction hash and links to `app.hyperliquid.xyz/explorer/tx/<hash>`. The tape keeps 40 prints, newest first, and marks everything after the first snapshot as fresh so only new prints animate.

In Tab mode both panels stay mounted and the hidden one keeps streaming, so switching is instant and the tape has no gap.

## Scheduling

`paced()` waits for data, then for the next animation frame, then yields. Every stream uses it. The book and stats keep only the latest of each source, because a newer snapshot replaces an older one. The tape keeps every print, because skipping a trade would lose information.

Publishes are at least 50 ms apart. Most Hyperliquid updates arrive further apart than that, so the cap only matters in bursts. At 1,000 msg/s it cut main-thread load from 78% to 34% at 1x CPU.

`notifyManager.setScheduler(queueMicrotask)` makes TanStack Query notify inside the same frame, so a publish reaches the DOM before that frame paints. Hidden tabs never run the animation frame, so nothing queues up while hidden.

## How it should feel

The brief asks for liveness, smoothness, readability and information. A trader judges those against the venues, so these choices follow Hyperliquid's own book (see [animation-research.md](animation-research.md)):

- Bars snap. Every venue does it. A tweened bar shows depth that no longer exists for 200 ms.
- Change is shown by a flash, not by moving data. The flash is an overlay in the row's side color that peaks at 20% of 800 ms and fades out, the curve Hyperliquid uses. Its peak opacity runs from 0.08 to 0.35 with `pulse`, so a top-up blinks and a pulled wall flares. A new flash cancels the running one, which keeps it on the compositor.
- Prices take their side's color, as on Hyperliquid, and the tape colors each print by aggressor.
- The tape merges one taker's fills, so a 5 BTC market buy reads as one print instead of six.
- Rows are keyed by slot and never reorder, so a price never jumps to another line.
- Smoothness comes from steady pacing and stable layout, not from tweening numbers.
- Reduced motion skips the flash and the print pulse entirely.

## Information

- Each bar has two layers. The light one is cumulative depth. The darker one inside it is the size at that level alone, so a wall shows up as a long dark segment.
- With a mouse, hovering a level shows a card left of the book with distance from mid, average price, and totals in the coin and in USD. The levels the sweep would eat are tinted, with a dashed line at the far edge, and the cell under the pointer goes bold. All of it updates live.
- On touch, a tap shows the same sweep in a strip under the book, and a second tap clears it.

## Rendering

- Rows are 23 px minimum with 12 px text, Hyperliquid's density. Touch raises that to 24 px and 13 px.
- Rows fit the height. A `ResizeObserver` divides a side's height by the minimum row height to get 1 to 20 rows a side, and the rows split the height exactly. Bars are inset 1 px top and bottom, which gives the row gap and means two bars never touch, so fractional row edges can't leave seams.
- The hover tint is one fixed overlay per hover, measured from the row, its column and the widget when the pointer enters a row. Rows carry no hover state, so hovering re-renders nothing in the book. A per-row `:has(~ :hover)` selector did the same job in CSS, but under the 1,000 msg/s stress it pushed message-to-DOM p95 from 20 ms to 68 ms.
- Depth bars use `scale: calc(var(--total) / var(--max))`, and the wall layer uses `--size`. Split bids scale from the right. Each row sets its own variables. The container sets `--max`, rounded up to a 1, 2 or 5 step, so it rarely changes and never re-renders rows when it does.
- Book flashes run through the Web Animations API from a layout effect, with no React state. Tape pulses are a CSS keyframe on mount.
- Rows use `contain: content`. Tape rows are memoized because the list prepends.
- In Tab mode both panels stay mounted in one grid cell. The inactive one is `visibility: hidden` and `inert` instead of `display: none`, so the card height never jumps.

## Proof

`next build --profile` keeps React's Profiler on in production. The book, each book row and the tape sit in `<Profiler>`s that write `performance.measure` entries only in that build (`NEXT_PUBLIC_PROFILE=1`). Normal builds compile the call away.

Every test runs twice, once on a Pixel 7 profile and once on desktop Chrome. `e2e/book.spec.ts` drives the UI through `page.routeWebSocket` with a scripted Hyperliquid server, plus a routed market list with BTC, ETH, SOL, HYPE and one delisted market. It covers depth, merge order, precision switches, tick labels, USD mode, the tape and its explorer links, hidden-tab streaming, reconnects, the tap strip, the hover card, rows fitting the height, the four book layouts, the three panel modes, pausing while hidden, the trade page's stats and order ticket, search filtering and selection, keyboard navigation and favorites across a reload, Strict and All, and the phone's split view.

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

The stress feed runs inside the page because Playwright's socket mock costs main-thread time per message, which made it the bottleneck at 4x. Timing gates use the best of three trials because the VM shares its CPU (about 3% steal) and contention only ever adds time. The structural gates hold for every trial, and every trial is reported.

## Measured, 2026-10-18

Headless Chromium 156 through Playwright 1.64, profiling build, on a shared 8-core AMD EPYC 9354P VM with no GPU.

| Test | Result |
|---|---|
| 1,000 msg/s at 1x CPU | 60 fps in all 6 trials, p95 frame 16.7 to 16.8 ms. One 73 ms frame in one trial. Render p95 1.6 to 3.4 ms. |
| 1,000 msg/s at 4x CPU | 8 to 10 fps, longest frame 150 to 208 ms, render p95 8.8 to 14.2 ms |
| One level change | 1 commit. Rows `bids-2` to `bids-13` with 14 rows on screen, `bids-2` to `bids-11` with 12. |
| Message to DOM | p50 10.2 to 12.4 ms, p95 19 to 20 ms, max 19.9 to 22.3 ms |
| Precision switch | slowest input event 40 ms on the phone profile, 40 to 56 ms on desktop in four reruns, 160 ms in one full-suite run under host load |
| Heap over 15 s | +350 to +775 KB after GC, with the 40-print tape filled |
| Live BTC, 20 s | 12 of 12 rows on both sides in every half-second sample |

The redesign cost frames at 4x CPU: 8 to 10 fps now against 11 to 13 before it. An A/B ruled out the font (21 to 30 frames per 3 s with a system font) and the hover selector (23 to 27 without it). The phone profile now fits 14 rows a side instead of 6, and each row has more chrome, so the cause isn't isolated yet. At 1x it holds 60 fps.

The wall layer costs paint, not React. In an earlier A/B run without it, the 4x stress did 13 to 17 fps against 11 to 13 with it. At 1x it holds 60 fps either way, and this VM rasterizes on the CPU, so a real GPU narrows the gap. It stays because it shows walls.

## Skipped on purpose

- Canvas rendering. DOM rows hold 60 fps at 1x and stay tappable and accessible.
- A Web Worker. Messages are about 1.6 KB. Most main-thread time goes to React, style and layout, and none of that can move to a worker.
- Virtualization. There are never more than 40 rows in view, and the search list holds about 180 rows.
- An animation library. CSS keyframes and the Web Animations API on opacity cover everything here.
- A socket per precision. It would lift the same-coin limit, but Hyperliquid allows 10 connections per IP, and one book per coin is the normal layout.
- Order entry, the chart and account data. Orders need a signed action from a wallet, and the brief asks for the book. The page scaffolds the rest so it reads as a whole.

## Prior art

- TkDodo, [Using WebSockets with React Query](https://tkdodo.eu/blog/using-web-sockets-with-react-query): push with `setQueryData` for frequent small updates, and set `staleTime: Infinity` when the socket delivers everything.
- TanStack Query [discussion #9065](https://github.com/TanStack/query/discussions/9065): control when the stream yields instead of writing every chunk.
- dYdX v4 web ([useDrawOrderbook.ts](https://github.com/dydxprotocol/v4-web/blob/main/src/hooks/Orderbook/useDrawOrderbook.ts)): publishes at most every 500 ms and draws on canvas.
- Serum and Mango: memoized rows, flashes toggled through refs, bars sized by width.
- Chrome, [Long Animation Frames](https://developer.chrome.com/docs/web-platform/long-animation-frames): suggests gating on LoAF in CI.
