# fullstack-fe

A live order book widget for BTC and ETH perps on Hyperliquid, built for Fullstack's frontend take-home.

![Live BTC book on a phone: the book updating, a tap on an ask pricing the fill, then the trades tab](docs/demo.webp)

Live BTC from Hyperliquid mainnet, recorded 2026-10-18 at real speed.

## Reading it

Asks on top, bids below, best prices meeting at the spread. Phones get the mock's layout. Mouse and trackpad get Hyperliquid's desktop density.

- Bars are cumulative. A bar's length is how much you'd eat walking the book to that price. The darker segment inside it is the size resting at that one level, so walls stand out without another column.
- The line under the spread splits visible depth into bid share in green and ask share in red.
- Tap a level and the footer prices the fill: `Buy 3.34160 BTC · avg 80,956.1 · 0.2 bps`. That's the size a market order fills walking to that level, its average price, and its distance from mid. Tap again to clear.
- Flashes scale with the change. A small top-up barely blinks. A wall landing or getting pulled lights the row up.
- The trades tab colors each print by aggressor. One taker's fills across several makers merge into one print, so a 5 BTC market buy reads as one line, not six.
- The header shows the last trade, colored by who took it, and the real max leverage: 40× on BTC, 25× on ETH. The pair name and the menu icon both switch markets.
- Precision lists tick sizes for the current price (1, 10, 100) instead of raw `nSigFigs`, and drops options that would show the same book twice.

## What the obvious build gets wrong

The default `l2Book` subscription pushes every ~5.4 s, so a book built on it alone sits frozen between jumps. This one layers three sources on one socket: the fast book (5 levels every ~540 ms), `bbo` (~170 ms), and 20-level depth requested every 500 ms. The newest source owns the prices it covers.

Switching precision shows a stale book for a beat. Book messages don't say which `nSigFigs` they're for, and in 24 measured swaps a snapshot at the old precision showed up 7 times before the server acked the new one. Pushes are dropped until the ack.

A grouped book misstates the spread. At a $10 tick the top bid and ask sit a whole bucket apart. The spread row reads `bbo`, which is never grouped.

Raw prints double count. On BTC, 42 of 105 live prints were one taker hitting several makers.

Rendering every message falls over in a burst. Updates publish at most once per frame and 20 times a second, and each row subscribes to its own level. When a level changes, that row re-renders along with the rows whose totals moved. Nothing else does.

Tweened bars show depth that's already gone. Every venue snaps its bars, so only the flash animates.

## Assumptions

- Read-only. Placing an order on Hyperliquid takes a signed action from a wallet, which is outside a market data widget. The ticket in the desktop demo shows a tap handing side and price to whatever owns order entry. Nothing is sent.
- Perpetuals. The mock says Perpetuals, and Hyperliquid's BTC and ETH markets are perps.
- Mobile first. The mock is a phone screen, so phones match it. Density switches on `pointer: fine` instead of width, so a touch tablet keeps finger-sized rows.
- A widget drops into any container and works there.

## As a widget

```tsx
<OrderBook market="ETH" onPriceSelect={({ coin, side, price }) => {}} />
```

- It fills its container. Rows fit the height, 1 to 20 a side, in whole pixels.
- Each instance keeps its own state. All instances share one socket and send identical subscriptions once.
- It pauses its streams when scrolled out of view or hidden, and picks back up when shown.
- `onPriceSelect` fires on a tap. Tapping an ask means buy, tapping a bid means sell.
- `/embed/BTC` and `/embed/ETH` render one widget full page, for an iframe.

On a wide screen with a mouse, the demo page runs a BTC book and an ETH book side by side on one socket, both wired to one ticket.

One known limit. Two widgets on the same coin at different precisions can't both get the fast book, because book messages don't carry `nSigFigs` and one socket can't tell them apart. The later widget takes it. The other keeps 500 ms depth and `bbo`.

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

`pnpm test` builds with `next build --profile`, serves it on port 3100 and runs 21 tests on a Pixel 7 profile and again on desktop Chrome. Fifteen check behavior against a scripted Hyperliquid server. Six check performance and fail on a regression. The two-book dashboard test runs on desktop only.

## What the tests prove

Measured on headless Chromium in a shared VM with no GPU, profiling build:

| Claim | Result |
|---|---|
| A 1,000 msg/s burst holds 60 fps | 60 fps and p95 frame 16.7 to 16.8 ms in 5 of 6 trials. One trial dipped to 55 fps, longest frame 84 ms. |
| React commits at most once per frame and 20 times a second | 15 book commits a second at 1,000 msg/s |
| A commit is cheap | p95 0.8 to 2.0 ms |
| One level change re-renders only the rows that show it | 1 commit: the changed row and the rows deeper than it |
| A message reaches the DOM within a frame | p95 17.8 to 18.1 ms |
| Switching precision stays responsive | slowest input event 32 ms |
| No leaks | -168 to +228 KB of heap over a 15 s stream |

Budgets, method and the 4x CPU numbers are in [docs/architecture.md](docs/architecture.md).

## Docs

- [Architecture](docs/architecture.md)
- [Hyperliquid feed notes](docs/hyperliquid-feed.md), measured against mainnet
- [Animation research](docs/animation-research.md), how Hyperliquid, dYdX, Serum and Mango animate their books
- [Design reference](docs/design.md)
- [Brief](docs/brief.md)

The feed probes in `scripts/probe/` need Node 22 or newer.
