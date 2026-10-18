# fullstack-fe

Live order book for BTC and ETH on Hyperliquid's websocket feed, built for Fullstack's frontend take-home.

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

`pnpm test` builds with `next build --profile`, serves it on port 3100 and runs 13 tests. Seven check behavior against a scripted Hyperliquid server. Six check performance and fail on a regression.

## What the tests prove

Measured on headless Chromium in a shared VM, profiling build:

| Claim | Result |
|---|---|
| A 1,000 msg/s burst stays at 60 fps | 60 fps in 7 of 9 runs; the other two lost frames to host contention (57.6 and 51 fps) |
| React commits at most once per frame and 20 times a second | about 15 commits a second at 1,000 msg/s |
| A commit is cheap | p95 1.1 to 2.1 ms, 5.2 ms at worst under host contention |
| One level change re-renders only the rows that show it | 1 commit, 3 rows |
| A message reaches the DOM within a frame | p95 17.2 to 18.8 ms |
| Switching precision stays responsive | slowest input event 24 to 48 ms |
| No leaks | +119 to +474 KB of heap over a 15 s stream |

Details, budgets and the 4x CPU numbers are in [docs/architecture.md](docs/architecture.md).

## Docs

- [Architecture](docs/architecture.md)
- [Hyperliquid feed notes](docs/hyperliquid-feed.md), measured against mainnet
- [Design reference](docs/design.md)
- [Brief](docs/brief.md)

The feed probes in `scripts/probe/` need Node 22 or newer.
