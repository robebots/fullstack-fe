// Three checks that shape the feed client.
// 1. After unsubscribe(old) + subscribe(new), can a snapshot from the old precision arrive after the new ack?
// 2. Can the default and fast l2Book feeds share one socket and still be told apart?
// 3. What does the server do with an invalid subscription?
// Usage: node scripts/probe/switching.mjs
import { connect, sleep, subKey, tickOf } from './lib.mjs';

async function swapOrdering(swaps = 12) {
  const conn = await connect();
  const sub = (nSigFigs) => ({ type: 'l2Book', coin: 'BTC', nSigFigs, fast: true });
  let current = 5;
  conn.subscribe(sub(current));
  await sleep(1500);
  const marks = [];
  for (let n = 0; n < swaps; n++) {
    const next = current === 5 ? 3 : 5;
    marks.push({ t: performance.now(), i: conn.log.length, from: current, to: next });
    conn.unsubscribe(sub(current));
    conn.subscribe(sub(next));
    current = next;
    await sleep(1200 + Math.random() * 600);
  }
  conn.ws.close();

  const windows = marks.map((m, n) => {
    const end = marks[n + 1]?.i ?? Infinity;
    const entries = conn.log.filter((e) => e.msg && e.i >= m.i && e.i < end);
    const ack = entries.find(
      (e) =>
        e.msg.channel === 'subscriptionResponse' &&
        e.msg.data.method === 'subscribe' &&
        subKey(e.msg.data.subscription) === subKey(sub(m.to)),
    );
    const books = entries
      .filter((e) => e.msg.channel === 'l2Book')
      .map((e) => ({ i: e.i, t: e.t, tick: tickOf(e.msg.data.levels) }));
    return { ...m, ack, books };
  });

  // Each setting's tick is the most common tick among snapshots that arrived after its ack.
  const counts = {};
  for (const w of windows) {
    if (!w.ack) continue;
    for (const b of w.books) {
      if (b.i < w.ack.i) continue;
      counts[w.to] ??= new Map();
      counts[w.to].set(b.tick, (counts[w.to].get(b.tick) ?? 0) + 1);
    }
  }
  const tickFor = Object.fromEntries(
    Object.entries(counts).map(([n, m]) => [n, [...m].sort((a, b) => b[1] - a[1])[0][0]]),
  );

  return windows.map((w) => {
    const stale = w.books.filter((b) => b.tick === tickFor[w.from]);
    const firstNew = w.books.find((b) => b.tick === tickFor[w.to]);
    return {
      swap: `${w.from} -> ${w.to}`,
      ackMs: w.ack ? Math.round(w.ack.t - w.t) : null,
      firstNewMs: firstNew ? Math.round(firstNew.t - w.t) : null,
      staleBeforeAck: w.ack ? stale.filter((b) => b.i < w.ack.i).length : stale.length,
      staleAfterAck: w.ack ? stale.filter((b) => b.i > w.ack.i).length : null,
    };
  });
}

async function sharedSocket(seconds = 12) {
  const conn = await connect();
  conn.subscribe({ type: 'l2Book', coin: 'ETH', nSigFigs: 5 });
  conn.subscribe({ type: 'l2Book', coin: 'ETH', nSigFigs: 5, fast: true });
  await sleep(seconds * 1000);
  conn.ws.close();
  const shapes = {};
  for (const e of conn.log) {
    if (e.msg?.channel !== 'l2Book') continue;
    const d = e.msg.data;
    const shape = `levels ${d.levels[0].length}/${d.levels[1].length}; keys ${Object.keys(d).join(',')}; fast=${d.fast}`;
    shapes[shape] = (shapes[shape] ?? 0) + 1;
  }
  return Object.entries(shapes).map(([shape, msgs]) => ({ shape, msgs }));
}

async function invalidSubscription(bad) {
  const conn = await connect();
  const sentAt = performance.now();
  conn.subscribe(bad);
  await sleep(2000);
  conn.subscribe({ type: 'l2Book', coin: 'BTC', fast: true });
  await sleep(3000);
  const closedByServer = conn.log.find((e) => e.closed !== undefined);
  if (conn.ws.readyState === WebSocket.OPEN) conn.ws.close();
  return {
    subscription: JSON.stringify(bad),
    inbound: [...new Set(conn.log.filter((e) => e.msg).map((e) => e.msg.channel))].join(', ') || 'nothing',
    serverClose: closedByServer ? `code ${closedByServer.closed} after ${Math.round(closedByServer.t - sentAt)}ms` : 'no',
  };
}

const [swaps, shared, ...invalid] = await Promise.all([
  swapOrdering(),
  sharedSocket(),
  invalidSubscription({ type: 'l2Book', coin: 'BTC', nSigFigs: 4, mantissa: 2 }),
  invalidSubscription({ type: 'l2Book', coin: 'NOPE' }),
]);
console.log('\n1. swap ordering, fast feed, BTC nSigFigs 5 <-> 3');
console.table(swaps);
console.log('\n2. default + fast l2Book on one socket, ETH nSigFigs 5');
console.table(shared);
console.log('\n3. invalid subscription, then a valid one on the same socket');
console.table(invalid);
