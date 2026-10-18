# Hyperliquid feed notes

Two sources feed this file. One is the [websocket docs](https://hyperliquid.gitbook.io/hyperliquid-docs/for-developers/api/websocket/subscriptions); any docs URL returns markdown with `.md` appended. The other is live runs of `scripts/probe/` against mainnet on 2026-10-18, while BTC traded near 81,100 and ETH near 2,364. Re-run the probes before relying on these numbers.

## Connection

- Mainnet is `wss://api.hyperliquid.xyz/ws` and testnet is `wss://api.hyperliquid-testnet.xyz/ws`.
- Subscribe with `{"method":"subscribe","subscription":{...}}`. Unsubscribe by sending the same subscription object with `"method":"unsubscribe"`.
- The server closes any connection it hasn't sent anything to for 60 s. `{"method":"ping"}` gets `{"channel":"pong"}` back, about 150 ms round trip from our server.
- Per-IP limits are 10 connections, 30 new connections a minute, 1000 subscriptions and 2000 client messages a minute.
- The server can drop a connection without warning. Resubscribing returns a fresh snapshot, so there is nothing to replay.

## l2Book

Subscription:

```ts
{ type: "l2Book", coin: "BTC", nSigFigs?: 2 | 3 | 4 | 5 | null, mantissa?: 2 | 5, fast?: boolean }
```

- `mantissa` is only valid with `nSigFigs: 5`. The docs also allow 1, which changes nothing.
- `fast: true` returns 5 levels per side instead of 20.

Message:

```json
{"channel":"l2Book","data":{"coin":"BTC","time":1792347395774,"levels":[[{"px":"81100.0","sz":"2.28969","n":8}],[{"px":"81101.0","sz":"12.4848","n":40}]]}}
```

- `levels[0]` holds bids and `levels[1]` holds asks, best price first. `px` and `sz` are strings. `n` is the number of orders at the level.
- Every message is a full snapshot. There are no deltas to apply.
- Two undocumented fields show up. `spread` is a string that appears only when `nSigFigs` is set. `fast: true` appears on fast-feed messages, so the two book feeds can share one socket and still be told apart.
- The ack echoes a normalized subscription. Match acks against this form:

```json
{"channel":"subscriptionResponse","data":{"method":"subscribe","subscription":{"type":"l2Book","coin":"BTC","nSigFigs":null,"mantissa":null,"fast":false}}}
```

### Cadence

`node scripts/probe/cadence.mjs BTC 40`:

| Feed | Levels per side | Msgs/s | Gap p50 | Gap p90 | Gap max |
|---|---|---|---|---|---|
| `l2Book` | 20 | 0.20 | 5,359 ms | 5,552 ms | 5,552 ms |
| `l2Book` with `fast: true` | 5 | 1.82 | 545 ms | 651 ms | 863 ms |
| `bbo` | 1 | 3.48 | 186 ms | 625 ms | 1,600 ms |
| `trades` | | 0.88 | 856 ms | 2,213 ms | 5,242 ms |
| `activeAssetCtx` | | 1.00 | 1,016 ms | 1,234 ms | 1,396 ms |

ETH over 30 s matched. The default book's p50 gap was 5,351 ms, fast was 531 ms and `bbo` was 136 ms. `bbo` gaps dropped to 20 ms in bursts.

The docs comment on `WsBook` says "pushed on each block that is at least 0.5 since last push". That describes the fast feed. The default feed ran ten times slower in every run, on both coins.

REST is fresher than the default socket feed. Polling `POST https://api.hyperliquid.xyz/info` with `{"type":"l2Book","coin":"BTC"}` every 500 ms returned 70 distinct 20-level snapshots in 79 polls, and `data.time` advanced 543 ms per step at p50. Each call costs weight 2 against a 1200/min per-IP budget.

### Precision

`node scripts/probe/precision.mjs`:

| Setting | BTC tick | ETH tick |
|---|---|---|
| full, `nSigFigs` omitted | 1 | 0.1 |
| `nSigFigs: 5` | 1 | 0.1 |
| `nSigFigs: 5, mantissa: 2` | 2 | 0.2 |
| `nSigFigs: 5, mantissa: 5` | 5 | 0.5 |
| `nSigFigs: 4` | 10 | 1 |
| `nSigFigs: 3` | 100 | 10 |
| `nSigFigs: 2` | 1,000 | 100 |

Every row matched the predicted tick:

```text
tick(nSigFigs, mantissa) = 10^(floor(log10(mid)) + 1 - nSigFigs) * (mantissa ?? 1)
tick(full)               = min(1, max(10^(floor(log10(mid)) - 4), 10^-(6 - szDecimals)))
```

`szDecimals` comes from `POST /info` with `{"type":"meta"}`. BTC is 5 and ETH is 4.

What that means for the UI:

- At today's prices, full precision and `nSigFigs: 5` return the same book for both coins. The dropdown should collapse them into one option.
- The tick is uniform across a snapshot. ETH at `nSigFigs: 2` ran from 2,300 down to 400 in steps of 100, so one decimals setting covers the whole book.
- Grouping rounds bids down and asks up. At `nSigFigs: 2` the BTC touch of 81,137 / 81,138 shows as 81,000 / 82,000, so the grouped spread is never under one bucket.
- Ticks shift when the mid crosses a power of ten. If BTC passes 100,000, `nSigFigs: 5` becomes a $10 tick while full precision stays at $1 under the integer-price rule. Labels have to recompute from the live mid.

### Switching precision

`node scripts/probe/switching.mjs` swaps BTC between `nSigFigs` 5 and 3 on the fast feed. It sends `unsubscribe(old)` and `subscribe(new)` back to back. Across 24 swaps in two runs:

- The ack arrived 156 to 269 ms after the send, and the first new snapshot arrived with it.
- 7 swaps delivered one stale snapshot from the old precision before the ack. None arrived after it.

Messages don't carry `nSigFigs`. The client has to drop each book feed's messages from the switch until that feed's new ack lands.

### Invalid subscriptions

`{"nSigFigs": 4, "mantissa": 2}` and `{"coin": "NOPE"}` each got no reply at all. The server closed the socket with code 1006 after 176 ms and 196 ms. A valid subscription sent afterward never got an ack because the socket was already gone.

## bbo

`{ type: "bbo", coin }` returns data shaped like this. Either side can be null.

```json
{"coin":"BTC","time":1792347396047,"bbo":[{"px":"81100.0","sz":"2.28457","n":8},{"px":"81101.0","sz":"12.4848","n":40}]}
```

The server pushes it on blocks where the best bid or offer changed. It ignores `nSigFigs`.

## trades

`{ type: "trades", coin }` returns `WsTrade[]` with `coin`, `side` (`"B"` or `"A"`), `px`, `sz`, `time`, `hash`, `tid` and `users: [buyer, seller]`. The first message after subscribing held the last 30 trades. After that most messages carried one trade. Some `hash` values are all zeros. Confirm that `side` is the taker's side before coloring prints by it.

## activeAssetCtx

`{ type: "activeAssetCtx", coin }` pushes about once a second. The context carries `markPx`, `oraclePx`, `midPx`, `funding`, `openInterest`, `prevDayPx`, `dayNtlVlm`, `dayBaseVlm`, `premium` and `impactPxs`, all as strings.

## Latency

Wall clock minus `data.time` on fast-feed messages ran 324 ms at p50 from our NTP-synced server. That number includes the block-to-push delay and the network.
