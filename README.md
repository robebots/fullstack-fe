# fullstack-fe

A Fullstack trade page built around a live order book on Hyperliquid's feed. Made for Fullstack's frontend take-home.

**Live:** https://fullstack-fe-five.vercel.app

![Desktop trade page with the BTC book, a hover card pricing a sweep, and the order ticket](docs/desktop.png)

<img src="docs/demo.webp" alt="Phone view: the split book, a tap pricing the fill, the trades tab, then switching to ETH from search" width="390" />

Live Hyperliquid mainnet data, recorded 2026-10-18 at real speed.

## What's real and what's scaffolded

The layout follows Hyperliquid's trade page in Fullstack's brand: their logo, Funnel Sans, and the steel and orange palette from fullstack.trade.

Real:

- The order book and trades tape, streaming from Hyperliquid.
- The market bar: mark, oracle, 24h change, volume, open interest and funding with a countdown, live from `activeAssetCtx`.
- Market search over every Hyperliquid perp, with live prices, funding, volume and open interest.
- Favorites, saved in the browser.
- Clicking a level fills the order ticket's side and price. The ticket's Mid button reads the live mid.
- The connection pill in the footer.

Scaffolded, so the page reads as a whole: nav, chart, order types, leverage and margin controls, and the account tabs. Nothing places orders.

## Reading the book

- Bars are cumulative depth. The darker segment inside each one is the size resting at that level alone, so walls stand out.
- Hover a level with a mouse and a card prices a market order that sweeps to it: distance from mid, average price, and totals in the coin and in USD. The levels it would eat are tinted, with a dashed line at the far edge, as on Hyperliquid.
- On touch, tapping a level shows the same numbers in a strip under the book.
- Flashes scale with the size change. A top-up barely blinks; a wall landing or getting pulled lights the row.
- The tape colors each print by aggressor and merges one taker's fills into one line. Every print links to its transaction in the Hyperliquid explorer.
- The ⋮ menu has Hyperliquid's panel modes (Tab, Stacked, Large) and four book layouts: bids and asks, side by side, bids only, asks only.
- Phones get Hyperliquid's mobile view: page tabs for Chart, Order Book, Trades and Funding, with bids and asks side by side.

## Market search

Open it from the pair name or with ⌘K. Type to filter, ↑↓ to move, Enter to switch markets, ⌘S to star, Esc to close. Columns sort on click. Strict hides delisted markets and All shows them. Spot, outcome, tradfi and HIP tabs say coming soon, because the book only streams main-dex perps. The market lives in the URL, so `/trade/SOL` is a shareable link.

## What the obvious build gets wrong

The default `l2Book` subscription pushes every ~5.4 s, so a book built on it alone sits frozen between jumps. This one layers three sources on one socket: the fast book (5 levels every ~540 ms), `bbo` (~170 ms), and 20-level depth requested every 500 ms. The newest source owns the prices it covers.

Switching precision shows a stale book for a beat. Book messages don't say which `nSigFigs` they're for, and in 24 measured swaps a snapshot at the old precision showed up 7 times before the server acked the new one. Pushes are dropped until the ack.

A grouped book misstates the spread. At a $10 tick the top bid and ask sit a whole bucket apart. The spread row reads `bbo`, which is never grouped.

Raw prints double count. On BTC, 42 of 105 live prints were one taker hitting several makers.

Rendering every message falls over in a burst. Updates publish at most once per frame and 20 times a second, and each row subscribes to its own level. When a level changes, that row re-renders along with the rows whose totals moved. Nothing else does.

Hover effects are easy to make expensive. A per-row `:has()` selector for the sweep tint pushed message-to-DOM p95 from 20 ms to 68 ms in the stress test, so the tint is one overlay measured when the pointer enters a row.

## Assumptions

- Read-only. Placing an order on Hyperliquid takes a signed action from a wallet. The ticket shows where a click on the book lands, and nothing is sent.
- Perpetuals on Hyperliquid's main dex, priced in USD as Fullstack labels them.
- Layout follows the screen width like Hyperliquid's: the full page from 1024 px, the mobile view below. Touch only enlarges rows and text.
- Fullstack's own trading app isn't public, so its brand comes from fullstack.trade and its layout from Hyperliquid, which the brief points to.

## As a widget

```tsx
<OrderBook market="ETH" mode="large" layout="split" onPriceSelect={({ coin, side, price }) => {}} />
```

- `market` is any Hyperliquid perp and can change while mounted.
- `mode` is `tab`, `stacked` or `large`. `layout` is `both`, `split`, `bids` or `asks`. Both are starting values, and the ⋮ menu changes them. `onModeChange` reports mode changes so a page can resize the column.
- `view` set to `book` or `trades` shows one panel with no tab bar, for pages that own their tabs.
- It fills its container and fits rows to the height, 1 to 20 a side.
- Each instance keeps its own state. All instances share one socket and send identical subscriptions once.
- It pauses its streams when scrolled out of view or hidden.
- `/embed/BTC`, `/embed/SOL` and so on render one widget full page, for an iframe.

One known limit. Two widgets on the same coin at different precisions can't both get the fast book, because book messages don't carry `nSigFigs`. The later widget takes it, and the other keeps 500 ms depth and `bbo`.

## Run

```sh
pnpm install
pnpm dev
```

## Test

```sh
pnpm exec playwright install chromium
pnpm test
```

`pnpm test` builds with `next build --profile`, serves it on port 3100 and runs 25 tests on a Pixel 7 profile and again on desktop Chrome. Nineteen check behavior against a scripted Hyperliquid server and market list. Six check performance and fail on a regression. Four runs skip by design: hover and the order ticket need the desktop layout, and the tap strip and split view need a phone.

## What the tests prove

Measured on headless Chromium in a shared VM with no GPU, profiling build:

| Claim | Result |
|---|---|
| A 1,000 msg/s burst holds 60 fps | 60 fps in all 6 trials, p95 frame 16.7 to 16.8 ms |
| React commits at most once per frame and 20 times a second | about 15 book commits a second at 1,000 msg/s |
| A commit is cheap | p95 1.6 to 3.4 ms |
| One level change re-renders only the rows that show it | 1 commit: the changed row and the rows deeper than it |
| A message reaches the DOM within a frame | p95 19 to 20 ms |
| Switching precision stays responsive | slowest input event 40 to 56 ms, 160 ms in one run under host load |
| No leaks | +350 to +775 KB of heap over a 15 s stream |

Budgets, method and the 4x CPU numbers are in [docs/architecture.md](docs/architecture.md).

## Docs

- [Architecture](docs/architecture.md)
- [Design](docs/design.md)
- [Hyperliquid feed notes](docs/hyperliquid-feed.md), measured against mainnet
- [Animation research](docs/animation-research.md), how Hyperliquid, dYdX, Serum and Mango animate their books
- [Brief](docs/brief.md)

The feed probes in `scripts/probe/` need Node 22 or newer.
