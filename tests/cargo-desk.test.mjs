// The Cargo Desk game's rules engine (public/cargo-desk/engine.js) is a plain browser
// script. It is loaded here the way a page loads it, then played for many runs of
// random orders to check that its accounting always reconciles, its limits hold,
// and its stated odds are the real ones.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

const page = {};
new Function('window', readFileSync(new URL('../public/cargo-desk/engine.js', import.meta.url), 'utf8'))(page);
const game = page.CargoDesk;
const quiet = { withReview: false };

const random = (seed) => () => {
  seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};

// Futures orders that leave the book hedged, give or take `lean` lots. On the day the
// front month expires the hedge goes into the next month, as the game requires.
function hedge(state, barrels, lean = 0) {
  const slot = state.expiryToday ? 1 : 0;
  return state.futuresPositions.map((held, month) => (month === slot ? lean - Math.round(barrels / game.lot) : 0) - held);
}

// Fills in whatever overflow booking a partial order needs, or returns null.
function complete(state, order) {
  const storage = state.round.orderBook.storage;
  const base = { storage: 0, storageCycles: 0, ...order };
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

// The plain orders, one of which must always be possible.
function safeOrders(state) {
  const book = state.round.orderBook;
  const clients = book.client ? ['redirect', 'accept', ...(book.client.defer ? ['defer'] : [])] : ['none'];
  const orders = [];
  for (const client of clients) {
    for (const sold of [0, Math.min(book.sell.max, state.storageShortfall), book.sell.max]) {
      orders.push({ side: sold ? 'sell' : 'hold', barrels: sold, client, futuresTrades: hedge(state, state.barrels - sold) });
    }
  }
  return orders;
}

// A random order: any open route, sometimes negotiated, with a lean inside the desk limit.
function randomOrder(state, pick) {
  const book = state.round.orderBook;
  const clients = book.client ? ['accept', 'redirect', ...(book.client.defer ? ['defer'] : [])] : ['none'];
  const routes = ['hold', ...['buy', 'sell', 'ship'].filter((side) => book[side]?.max)];
  let side = routes[Math.floor(pick() * routes.length)];
  let haggle;
  if ((side === 'buy' || side === 'sell') && pick() < 0.5) {
    const asks = [(1 + Math.floor(pick() * 16)) * 5];
    if (game.negotiate(state, side, asks).status === 'counter') asks.push(pick() < 0.5 ? 'take' : (1 + Math.floor(pick() * 16)) * 5);
    if (game.negotiate(state, side, asks).status === 'walked') side = 'hold';
    else haggle = { side, asks };
  }
  const barrels = side === 'hold' ? 0 : 1 + Math.floor(pick() * book[side].max);
  const lean = Math.floor(pick() * (2 * game.netLimitLots + 1)) - game.netLimitLots;
  const order = { side, barrels, client: clients[Math.floor(pick() * clients.length)], futuresTrades: hedge(state, state.barrels + (side === 'buy' ? barrels : -barrels), lean) };
  if (haggle) order.haggle = haggle;
  return order;
}

const firstValid = (state, orders) => orders.map((draft) => complete(state, draft)).find(Boolean);

test('Cargo Desk accounts reconcile, limits hold and a valid order always exists', () => {
  let afternoons = 0;
  let deals = 0;
  for (let run = 0; run < 120; run++) {
    const seed = `site-test-${run}`;
    const pick = random(run + 1);
    let state = game.replay(seed, [], quiet);
    while (state.round) {
      assert.ok(firstValid(state, safeOrders(state)), `${seed} has no plain valid order in cycle ${state.stage + 1}`);
      const order = firstValid(state, [randomOrder(state, pick), ...safeOrders(state)]);
      const quoted = game.preview(state, order);
      const next = game.replay(seed, [...state.decisions, order], quiet);
      assert.equal(next.history.length, state.history.length + 1, `${seed} rejected an order its preview accepted`);
      if (state.phase === 'pm') afternoons++;
      if (quoted.haggle?.status === 'deal' && quoted.haggle.side === order.side) deals++;
      const step = next.history.at(-1);
      const { physical, hedge: futures, logistics } = next.components;
      assert.equal(physical + futures + logistics, next.net, `${seed} components do not sum to net`);
      assert.ok(Number.isInteger(next.net), `${seed} net is not whole cents`);
      assert.equal(Object.values(step.parts).reduce((a, b) => a + b, 0), step.delta, `${seed} P&L explain does not add up in cycle ${step.cycle}`);
      assert.ok(next.occupancy >= 0 && next.occupancy <= game.capacity, `${seed} overfilled the tank`);
      assert.ok(next.futuresGross <= game.maxFuturesLots, `${seed} exceeded the open-lot limit`);
      if (next.round) assert.ok(Math.abs(next.netLots) <= game.netLimitLots, `${seed} exceeded the desk limit`);
      assert.ok(!next.futuresBook.some((month) => month.expired && month.position), `${seed} kept a position past its expiry`);
      assert.equal(
        next.components.logistics - state.components.logistics,
        quoted.clientCashflow - quoted.storageCost - quoted.transportCost - quoted.tankLease,
        `${seed} charged different logistics from the ticket`,
      );
      state = next;
    }
    const closed = game.replay(seed, state.decisions);
    assert.equal(closed.net, state.net, `${seed} does not replay to the same result`);
    assert.equal(closed.barrels, 0, `${seed} ended with crude unsold`);
    assert.ok(closed.futuresBook.every((month) => month.position === 0), `${seed} ended with futures open`);
    assert.equal(closed.entries.reduce((total, entry) => total + entry.cents, 0), closed.net, `${seed} ledger does not sum to net`);
    assert.equal(closed.review.opening, 120000, `${seed} explained P&L does not reach the final figure`);
    assert.ok(closed.review.benchmark !== null, `${seed} could not play the hold-and-hedge comparison`);
    assert.match(closed.review.grade, /^[A-E]$/);
  }
  assert.ok(afternoons > 100, 'too few afternoon tickets were played to trust the check');
  assert.ok(deals > 50, 'too few negotiated trades were played to trust the check');
});

// Every price a run goes through, in order.
function pricePath(seed, choose) {
  let state = game.replay(seed, [], quiet);
  const path = [];
  while (state.round) {
    state = game.replay(seed, [...state.decisions, choose(state)], quiet);
    path.push(...state.history.at(-1).path.slice(1).map((market) => market.prices.join()));
  }
  return path;
}

test('a seed has the same prices whatever the player does', () => {
  const pick = random(7);
  const plain = pricePath('same-market', (state) => firstValid(state, safeOrders(state)));
  const busy = pricePath('same-market', (state) => firstValid(state, [randomOrder(state, pick), ...safeOrders(state)]));
  assert.ok(plain.length >= 2 * game.totalCycles);
  assert.deepEqual(busy, plain);
});

test('events happen as often as their stated odds, and shocks about one day in ten', () => {
  let days = 0;
  let shockDays = 0;
  let settled = 0;
  let hits = 0;
  let stated = 0;
  let mornings = 0;
  let morningHits = 0;
  let morningStated = 0;
  for (let run = 0; run < 400; run++) {
    let state = game.replay(`odds-${run}`, [], quiet);
    let morningWatch = null;
    let shocked = false;
    while (state.round) {
      if (state.phase === 'am') {
        morningWatch = state.market.watch;
        shocked = false;
      }
      const day = state.stage;
      state = game.replay(state.seed, [...state.decisions, firstValid(state, safeOrders(state))], quiet);
      const path = state.history.at(-1).path;
      for (let index = 1; index < path.length; index++) {
        const market = path[index];
        if (market.shock) shocked = true;
        if (!market.resolved) continue;
        // The odds on the ticket the player last saw before the event was settled.
        const watch = path[index - 1].watch;
        assert.ok(watch, 'an event was settled that was never on watch');
        settled++;
        stated += watch.odds;
        if (market.resolved.hit) hits++;
        // And the odds shown that morning, before any midday news moved them.
        if (morningWatch) {
          mornings++;
          morningStated += morningWatch.odds;
          if (market.resolved.hit) morningHits++;
        }
      }
      if (state.stage !== day || !state.round) {
        days++;
        if (shocked) shockDays++;
      }
    }
  }
  const shockRate = (100 * shockDays) / days;
  assert.ok(Math.abs(shockRate - game.shockChance) < 2.5, `shocks hit ${shockRate.toFixed(1)}% of days, not about ${game.shockChance}%`);
  assert.ok(settled > 1500, 'too few events were settled to check their odds');
  const gap = (100 * hits) / settled - stated / settled;
  assert.ok(Math.abs(gap) < 3.5, `events happened ${gap.toFixed(1)} points away from the odds last shown`);
  const morningGap = (100 * morningHits) / mornings - morningStated / mornings;
  assert.ok(Math.abs(morningGap) < 3.5, `events happened ${morningGap.toFixed(1)} points away from their morning odds`);
});

test('the front month expires on schedule and the stocks report lands on Wednesdays', () => {
  let state = game.replay('calendar', [], quiet);
  const reports = new Set();
  while (state.round) {
    if (state.phase === 'am' && state.market.watch?.due === 'midday') reports.add(state.stage + 1);
    assert.equal(state.expiryToday, state.stage + 1 === game.expiryCycle, 'expiry is flagged on the wrong day');
    assert.equal(state.months[0], state.stage + 1 <= game.expiryCycle ? game.monthNames[0] : game.monthNames[1]);
    state = game.replay('calendar', [...state.decisions, firstValid(state, safeOrders(state))], quiet);
  }
  assert.deepEqual([...reports], game.reportCycles);
});
