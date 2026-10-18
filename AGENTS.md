# fullstack-fe

Orderbook widget on Hyperliquid's live `l2Book` websocket feed. Take-home for a frontend role at Fullstack, with a three-day time box.

## Read first

- [docs/brief.md](docs/brief.md) is the assignment, verbatim. Requirements come from there.
- [docs/hyperliquid-feed.md](docs/hyperliquid-feed.md) has the wire format and measured feed behavior. The default `l2Book` pushes only every ~5.4 s.
- [docs/architecture.md](docs/architecture.md) is the current plan. Change it when a decision changes.
- [docs/design.md](docs/design.md) has the palette and layout sampled from the reference screenshot.

## Hard requirements

- BTC and ETH, chosen from a dropdown.
- A dropdown that changes `nSigFigs` on the live subscription.
- A live demo page that can be shared.
- Code on GitHub.
- React or Next.js, with no excessive re-renders.
- Colors and theme close to [docs/reference/example-orderbook.png](docs/reference/example-orderbook.png).

## Rules

- Socket handling, book composition and formatting stay out of React, in `src/feed` and `src/book`. Pure functions get unit tests.
- React reads through `useSyncExternalStore`. A row renders only when its own level changed.
- Validate every subscription before sending it. The server drops the socket on bad params and sends no error.
- Animate `transform` and `opacity` only. Honor `prefers-reduced-motion`.
- Back performance claims with numbers from the debug overlay or a Chrome trace.
- Re-run the probes before trusting feed numbers that are more than a few days old.

## Commands

Probes need Node 22 or newer.

- `node scripts/probe/cadence.mjs [coin] [seconds]` measures push rates per feed against REST.
- `node scripts/probe/precision.mjs` prints the tick for every `nSigFigs` and `mantissa` setting.
- `node scripts/probe/switching.mjs` checks swap ordering, shared-socket routing and invalid subscriptions.

App commands go here once the app is scaffolded.
