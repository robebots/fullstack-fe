# fullstack-fe

Live order book and trades tape for BTC and ETH on Hyperliquid's websocket feed, built for Fullstack's frontend take-home. Mobile follows Fullstack's mock; desktop follows Hyperliquid's layout.

Next.js 16, React 19 with the React Compiler, TanStack Query for the live book, Jotai for client state, shadcn/ui on Base UI, Tailwind v4, Playwright.

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

`pnpm test` builds with `next build --profile`, serves it on port 3100 and runs 15 tests on a Pixel 7 profile and again on desktop Chrome. Nine check behavior against a scripted Hyperliquid server. Six check performance and fail on a regression.

## What the tests prove

Measured on headless Chromium in a shared VM, profiling build:

| Claim | Result |
|---|---|
| A 1,000 msg/s burst stays at 60 fps | p95 frame 16.8 ms, no frame over 50 ms |
| React commits at most once per frame and 20 times a second | about 15 book commits a second at 1,000 msg/s |
| A commit is cheap | p95 0.8 to 2.0 ms |
| One level change re-renders only the rows that show it | 1 commit, 3 rows |
| A message reaches the DOM within a frame | p95 17.8 ms |
| Switching precision stays responsive | slowest input event 32 ms |
| No leaks | +26 to +533 KB of heap over a 15 s stream |

Details, budgets and the 4x CPU numbers are in [docs/architecture.md](docs/architecture.md).

## Docs

- [Architecture](docs/architecture.md)
- [Hyperliquid feed notes](docs/hyperliquid-feed.md), measured against mainnet
- [Animation research](docs/animation-research.md), how Hyperliquid, dYdX, Serum and Mango animate their books
- [Design reference](docs/design.md)
- [Brief](docs/brief.md)

The feed probes in `scripts/probe/` need Node 22 or newer.
