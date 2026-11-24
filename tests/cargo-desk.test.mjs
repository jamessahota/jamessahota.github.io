// The Cargo Desk game's rules engine (public/cargo-desk/engine.js) is a plain browser
// script. It is loaded here the way a page loads it, then played for many runs of
// random orders to check that its accounting always reconciles and its limits hold.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

const page = {};
new Function('window', readFileSync(new URL('../public/cargo-desk/engine.js', import.meta.url), 'utf8'))(page);
const game = page.CargoDesk;

const random = (seed) => () => {
  seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};

// The smallest futures change that keeps crude plus futures inside the desk limit.
function hedge(state, barrels, trades = [0, 0, 0, 0]) {
  const out = trades.slice();
  const held = state.futuresPositions.map((lots, month) => lots + out[month]);
  let net = barrels / game.lot + held.reduce((a, b) => a + b, 0);
  while (net > game.netLimitLots) { out[0]--; held[0]--; net--; }
  for (let month = 0; net < -game.netLimitLots && month < held.length;) {
    if (held[month] < 0) { out[month]++; held[month]++; net++; } else month++;
  }
  return out;
}

// Fills in whatever overflow booking a partial order needs, or returns null.
function complete(state, order) {
  const storage = state.round.orderBook.storage;
  const base = { storage: 0, storageCycles: 1, ...order };
  const first = game.preview(state, base);
  if (first.ok) return base;
  for (const booked of new Set([Math.min(storage.max, first.storageRequired || 0), storage.max])) {
    for (let cycles = 1; booked && cycles <= storage.maxCycles; cycles++) {
      const attempt = { ...base, storage: booked, storageCycles: cycles };
      if (game.preview(state, attempt).ok) return attempt;
    }
  }
  return null;
}

function candidates(state, pick) {
  const book = state.round.orderBook;
  const clients = book.client ? ['accept', 'redirect', ...(book.client.defer ? ['defer'] : [])] : ['none'];
  const routes = ['hold', ...['buy', 'sell', 'ship'].filter((side) => book[side]?.max)];
  const orders = [];
  // A random order first, then the plain ones that must always be possible.
  const side = routes[Math.floor(pick() * routes.length)];
  const barrels = side === 'hold' ? 0 : 1 + Math.floor(pick() * book[side].max);
  const client = clients[Math.floor(pick() * clients.length)];
  const spread = [0, 0, 0, 0].map(() => (pick() < 0.3 ? Math.floor(pick() * 7) - 3 : 0));
  orders.push({ side, barrels, client, futuresTrades: hedge(state, state.barrels + (side === 'buy' ? barrels : -barrels), spread) });
  for (const choice of clients) {
    for (const sold of [0, Math.min(book.sell.max, state.storageShortfall), book.sell.max]) {
      orders.push({ side: sold ? 'sell' : 'hold', barrels: sold, client: choice, futuresTrades: hedge(state, state.barrels - sold) });
    }
  }
  return orders;
}

test('Cargo Desk accounts reconcile, limits hold and a valid order always exists', () => {
  for (let run = 0; run < 150; run++) {
    const seed = `site-test-${run}`;
    const pick = random(run + 1);
    let state = game.replay(seed, []);
    while (state.round) {
      const order = candidates(state, pick).map((draft) => complete(state, draft)).find(Boolean);
      assert.ok(order, `${seed} has no valid order in cycle ${state.stage + 1}`);
      const quoted = game.preview(state, order);
      const next = game.replay(seed, [...state.decisions, order]);
      assert.equal(next.stage, state.stage + 1, `${seed} rejected an order its preview accepted`);
      const { physical, hedge: futures, logistics } = next.components;
      assert.equal(physical + futures + logistics, next.net, `${seed} components do not sum to net`);
      assert.ok(Number.isInteger(next.net), `${seed} net is not whole cents`);
      assert.ok(next.occupancy >= 0 && next.occupancy <= game.capacity, `${seed} overfilled the tank`);
      assert.ok(next.futuresGross <= game.maxFuturesLots, `${seed} exceeded the open-lot limit`);
      if (next.round) assert.ok(Math.abs(next.netLots) <= game.netLimitLots, `${seed} exceeded the desk limit`);
      assert.equal(
        next.components.logistics - state.components.logistics,
        quoted.clientCashflow - quoted.storageCost - quoted.transportCost - quoted.tankLease,
        `${seed} charged different logistics from the ticket`,
      );
      state = next;
    }
    assert.equal(state.stage, game.totalCycles);
    assert.equal(state.barrels, 0, `${seed} ended with crude unsold`);
    assert.ok(state.futuresPositions.every((lots) => lots === 0), `${seed} ended with futures open`);
    assert.equal(state.entries.reduce((sum, entry) => sum + entry.cents, 0), state.net, `${seed} ledger does not sum to net`);
    assert.equal(game.replay(seed, state.decisions).net, state.net, `${seed} does not replay to the same result`);
  }
});

test('a seed has the same prices whatever the player does', () => {
  const prices = (decide) => {
    let state = game.replay('same-market', []);
    const path = [];
    while (state.round) {
      state = game.replay('same-market', [...state.decisions, decide(state)]);
      path.push(state.market.prices.join());
    }
    return path;
  };
  const pick = random(7);
  const quiet = prices((state) => candidates(state, pick).slice(1).map((draft) => complete(state, draft)).find(Boolean));
  const busy = prices((state) => candidates(state, pick).map((draft) => complete(state, draft)).find(Boolean));
  assert.equal(quiet.length, game.totalCycles);
  assert.deepEqual(busy, quiet);
});
