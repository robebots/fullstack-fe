# fullstack-fe

Live orderbook widget for BTC and ETH on Hyperliquid's websocket feed, built for Fullstack's frontend take-home.

Status: planning. There is no app code yet.

- [Brief](docs/brief.md)
- [Hyperliquid feed notes](docs/hyperliquid-feed.md), measured against mainnet
- [Architecture draft](docs/architecture.md)
- [Design reference](docs/design.md)

The feed probes need Node 22 or newer:

```sh
node scripts/probe/cadence.mjs BTC 30
node scripts/probe/precision.mjs
node scripts/probe/switching.mjs
```
