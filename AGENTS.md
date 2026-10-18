# fullstack-fe

Live order book on Hyperliquid's `l2Book` websocket feed. Take-home for a frontend role at Fullstack, with a three-day time box.

## Read first

- [docs/brief.md](docs/brief.md) is the assignment, verbatim. Requirements come from there.
- [docs/architecture.md](docs/architecture.md) describes the build, the performance gates and the measured results. Change it when a decision changes.
- [docs/hyperliquid-feed.md](docs/hyperliquid-feed.md) has the wire format and measured feed behavior. The default `l2Book` pushes only every ~5.4 s.
- [docs/design.md](docs/design.md) has the palette and layout sampled from the reference screenshot.

## Hard requirements

- BTC and ETH, chosen from a dropdown.
- A dropdown that changes `nSigFigs` on the live subscription.
- A live demo page that can be shared.
- Code on GitHub.
- React or Next.js, with no excessive re-renders.
- Colors and theme close to [docs/reference/example-orderbook.png](docs/reference/example-orderbook.png).

## Stack

Next.js 16 App Router with the React Compiler, TanStack Query for server state, Jotai for client state, shadcn/ui on Base UI, Tailwind v4, Biome, Playwright. pnpm.

## Rules

- No comments in code.
- YAGNI means no bloat and no dumb decisions. Everything in the mock ships, built with the least code that does it right.
- The socket and the book engine stay out of React, in `src/lib`. Components read through `useBook(select)`.
- A row renders only when its own level changed. `e2e/perf.spec.ts` checks this, so keep it green.
- Validate every subscription before sending it. The server drops the socket on bad params and sends no error.
- Data snaps; only feedback animates. Animate `opacity` on overlays, cancel the running animation before starting another, and skip animation under `prefers-reduced-motion`.
- Match how traders expect a venue to behave. When unsure, check Hyperliquid's own book (docs/animation-research.md).
- Back performance claims with numbers from the perf suite.

## Commands

- `pnpm dev` runs the app.
- `pnpm build` makes a production build. `pnpm build:profile` keeps React's Profiler on and records `performance.measure` entries for the perf tests.
- `pnpm test` builds with profiling, serves on port 3100 and runs the Playwright suite. Run `pnpm exec playwright install chromium` once first.
- `pnpm lint` runs Biome. `pnpm format` formats.
- `node scripts/probe/cadence.mjs [coin] [seconds]`, `precision.mjs`, `switching.mjs`, `post.mjs` and `trades.mjs [coin] [seconds]` re-measure the live feed. They need Node 22 or newer.

<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
