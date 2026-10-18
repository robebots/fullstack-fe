# Architecture

Status: draft for discussion, 2026-10-18. Update this file when a decision changes.

## What the feed forces

The measurements are in [hyperliquid-feed.md](hyperliquid-feed.md). Four of them drive the design.

1. The default `l2Book` sends 20 levels per side about every 5.4 s. A widget built on it alone changes every five seconds, which fails the liveness priority before styling even starts.
2. `l2Book` with `fast: true` sends 5 levels every ~540 ms. `bbo` sends the top of book on blocks where it changes, p50 140 to 190 ms. Liveness has to come from these two.
3. Book messages don't say which `nSigFigs` built them. After a precision switch the only way to tell old snapshots from new ones is to wait for the new ack.
4. A bad subscription makes the server drop the socket within ~200 ms, with no error message. Validation has to happen before anything goes on the wire.

## Data flow

```text
wss://api.hyperliquid.xyz/ws
        |
        v
FeedClient       one socket, ack-gated subscriptions, reconnect, watchdog
        |  typed messages
        v
BookEngine       pure TS: compose default + fast + bbo, totals, diffs, stats
        |  BookView (immutable; unchanged rows keep their identity)
        v
FrameScheduler   at most one publish per animation frame
        |
        v
BookStore        useSyncExternalStore with per-row selectors
        |
        v
React            <OrderBook> lays out N slots; each <BookRow> subscribes to its own slot
```

The feed and engine code never imports React. Both run in Vitest under Node with no DOM.

## FeedClient

- One WebSocket per tab. For the selected market it holds five subscriptions: `l2Book`, `l2Book` with `fast: true`, `bbo`, `trades` and `activeAssetCtx`.
- Subscriptions are keyed the way acks echo them, as `type`, `coin`, `nSigFigs ?? null`, `mantissa ?? null` and `fast ?? false`.
- A precision switch sends `unsubscribe(old)` then `subscribe(new)` for both book feeds. Each feed drops its `l2Book` messages until its new ack arrives. In 24 measured swaps a stale snapshot arrived before the ack 7 times and never after it.
- Routing goes by `channel`, then `data.coin`, then `data.fast` for the two book feeds. Messages for the wrong coin get dropped, which handles coin switches without extra state.
- The API accepts `nSigFigs` of 2 to 5 or null, and `mantissa` of 2 or 5 only alongside `nSigFigs: 5`. The settings type only allows valid pairs, and the client checks again before sending.
- On a drop, the client reconnects with exponential backoff and jitter, from 250 ms up to 5 s. It resubscribes everything and replaces state with the first snapshot. The last book stays on screen, dimmed, under a reconnecting badge.
- If the server closes the socket within a second of a subscribe twice in a row, the client stops retrying that set and shows an error. Otherwise one bad subscription turns into a reconnect loop.
- The fast book should arrive every ~0.5 s. With no book message for 3 s the widget shows a stale state, and at 10 s the client forces a reconnect. A ping every 30 s covers the server's 60 s idle rule.
- `requestAnimationFrame` pauses in background tabs, so rendering pauses with it. The socket stays open, so a returning tab is current on its first frame.

## BookEngine

Pure functions, unit-tested against recorded fixtures.

### Compose

Each side merges three sources by recency. The source with the newest `time` owns every price it covers, and an older source only adds levels beyond that range.

```text
bids, newest source first:   bbo (1 level) -> fast (5) -> default (20)
take a level from an older source only if its price is below every bid already taken
asks mirror this with "above"
```

The same rule handles consumed liquidity. Say `bbo` reports the best bid dropped from 100 to 98. The fast book's 100 and 99 levels sit above 98, so they fall away.

`bbo` is never grouped. It feeds the rows only when the selected tick equals the full-precision tick, which is true today for both coins at `nSigFigs: 5`. At coarser ticks it drives the spread row alone. That keeps the real spread on screen when the book is grouped into $1,000 buckets and the grouped spread can't read under one bucket.

### Derived values

Per row: price, size, order count `n`, cumulative size, cumulative notional, a depth ratio for the bar, size against the largest visible level, and average order size `sz / n`.

Per book: best bid and ask, mid, spread in price and bps, bid/ask imbalance over visible depth, mid direction since the last frame, and update age.

### Diff

The engine compares every price with the previous frame and tags rows `up`, `down` or `new`. Each tag carries a counter that only moves on a new change event, and rows fire a flash once per counter value.

### Numbers

Sizes accumulate as integers scaled by `szDecimals` (BTC 5, ETH 4), so totals never show float drift. Formatting uses one cached `Intl.NumberFormat` per decimals and style pair.

## Scheduling and the store

- Messages reach the engine as they arrive. The scheduler publishes the latest `BookView` once per animation frame. The feed averages 7 to 9 messages a second today with bursts 20 ms apart, and no burst renders more than once per frame.
- Rows are keyed by slot, meaning distance from the touch, not by price. The DOM never reorders. When the touch moves, prices shift through fixed rows and only text and transforms change.
- The engine reuses row objects that didn't change. `useSyncExternalStore` hands React the same reference and the row skips its render.
- Settings live in the URL. `?coin=ETH&tick=1` opens the demo in that state, which makes the shared link more useful.

## Rendering

- Rows have a fixed height and columns a fixed width, with `font-variant-numeric: tabular-nums`. A digit change never shifts anything else.
- The panel height sets the rows per side through a `ResizeObserver`, up to 20.
- Depth bars are absolutely positioned and sized with `transform: scaleX(ratio)` from the left edge. The compositor animates them with no layout work.
- Bar transitions last as long as the recent gap between book updates, clamped to 80 to 300 ms. In a slow market bars glide from one snapshot to the next, and in a fast one they keep up.
- The bar scale, the largest cumulative size on screen, eases toward its new value. One big order appearing at depth doesn't jolt every bar at once.
- Flashes run on a per-row overlay through the Web Animations API, started from a layout effect when the row's change counter moves. They hold no React state, so a flash costs no render. Their strength scales with the relative size change, and `prefers-reduced-motion` turns them off.
- The best bid and ask rows get a slightly stronger tint so the touch reads at a glance. The header shows the mid with an up or down cue from `bbo`.

## Information features

Must have:

1. Cumulative depth bars, as in the example.
2. Spread row with the spread in price and percent, taken from the real touch.
3. Flashes on size changes, green up and red down, and a fade-in for new levels.
4. Coin dropdown for BTC and ETH, plus a precision dropdown. Options show the tick computed from the live mid (BTC today offers 1, 2, 5, 10, 100 and 1,000) with the nSigFigs value beside each. Settings that produce the same tick collapse into one option.
5. Coin and USD toggle for size and total.
6. Connection state with a live dot, update age, and stale and reconnecting states.

Should have:

7. Hovering a level highlights every row between it and the touch. A tooltip shows total size, total notional, average fill price and slippage from mid in bps, which is the cost of a market order that sweeps to that level.
8. A brighter inner bar for the level's own size, so walls stand out inside the cumulative shape.
9. Trade prints marked on the level they hit, colored by side and fading over a second. Grouped books map prints the same way grouping does, bids down and asks up.
10. Imbalance meter for bid size against ask size in visible depth.
11. Trades tab fed by `trades`, matching the example's tabs.

Could have:

12. Average order size from `n`. A big level held by one order means something different from the same size spread across fifty orders.
13. Market header from `activeAssetCtx` with mark, oracle, funding, 24h change and open interest.
14. A faint divider where fast data ends at level 5. Deeper levels can be up to ~5 s old, and their age shows on hover.
15. Debug overlay at `?debug=1` with messages per second per feed, renders per second and frame time.

## Proving performance

- React Profiler `onRender` counts feed the debug overlay. The target is zero renders for any row whose level didn't change.
- A recorder script saves real sessions as NDJSON. A `ReplaySocket` with the same interface as the live client plays them back at 1× or 10×. Tests get deterministic runs, and `?feed=replay&speed=10` becomes a stress demo of a fast market.
- The README gets numbers from a Chrome performance trace and a short GIF.

## Skipped on purpose

- Web Worker. Payloads run ~1.6 KB at under 10 a second, so parsing them costs almost nothing on the main thread.
- Canvas rendering. Forty rows of DOM text stay cheap, selectable and readable by screen readers.
- Virtualization. There are never more than 40 rows.
- State libraries. The store is about 40 lines on top of `useSyncExternalStore`.
- REST polling for deep levels. It would refresh levels 6 to 20 every block, but the brief asks for the websocket. It stays a fallback if 5 s old depth looks wrong in practice.

## Stack

- Next.js 16 App Router, React 19, TypeScript and Tailwind v4. Use the versions `create-next-app` pins. TypeScript 7 is current on npm, so check Next's support before moving to it.
- A static page. The widget is a client component that renders skeleton rows on the server and connects on mount.
- No animation or charting library. CSS transitions and the Web Animations API cover the motion.
- Vitest for the client and engine, Playwright for a smoke test.
- Vercel, deploying from `main`.

## Layout

```text
src/
  app/              page, layout, globals.css
  feed/             client.ts, subscriptions.ts, types.ts, replay.ts
  book/             compose.ts, derive.ts, diff.ts, precision.ts, format.ts
  store/            book-store.ts, scheduler.ts, settings.ts
  ui/               OrderBook, BookRow, SpreadRow, PrecisionMenu, CoinSelect,
                    UnitToggle, TradesTab, StatusDot, DebugOverlay
scripts/probe/      feed measurements
scripts/record.mjs  NDJSON recorder for fixtures
test/               Vitest suites and fixtures
e2e/                Playwright
```

## Three days

Day 1. Scaffold, deploy an empty page to Vercel, FeedClient with ack gating, compose with tests, rows and bars on screen, coin and precision dropdowns. A shareable link works by the end of the day.

Day 2. Flashes, adaptive transitions, spread and mid, unit toggle, hover sweep tooltip, trades tab, reconnect and stale states.

Day 3. Inner size bars, trade prints on levels, imbalance meter, debug overlay, replay and stress mode, Playwright smoke test, performance trace, README with a GIF and design notes, final deploy.

## Decisions to confirm

| Decision | Default |
|---|---|
| Layer `fast` and `bbo` over the default book | Yes. The default feed alone updates every ~5 s. |
| Price text color | White, as in the example |
| Bar anchor | Left edge, as in the example |
| Rows per side | Fill the panel height, up to 20 |
| Precision labels | Tick size, with nSigFigs beside it |
| Deep-level freshness | Divider at level 5 and age on hover, no REST polling |
| Demo URL | A Vercel project under Rob's account |
