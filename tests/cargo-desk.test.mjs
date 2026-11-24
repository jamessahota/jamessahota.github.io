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
new Function('window', readFileSync(new URL('../public/cargo-desk/scenarios.js', import.meta.url), 'utf8'))(page);
const scenarios = page.CargoScenarios;
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

// --- Historical scenarios ------------------------------------------------------------

const words = (text) => text.trim().split(/\s+/).length;

test('each historical scenario is complete and well formed', () => {
  assert.ok(scenarios.length >= 4, 'the historical scenarios are missing');
  for (const scenario of scenarios) {
    const where = `scenario ${scenario.key}`;
    assert.equal(scenario.dates.length, 11, `${where} needs the prior close and ten trading days`);
    assert.equal(scenario.prices.length, 11, `${where} needs a price row for each date`);
    scenario.dates.forEach((date, index) => {
      assert.match(date, /^\d{4}-\d{2}-\d{2}$/);
      const weekday = new Date(`${date}T12:00:00Z`).getUTCDay();
      assert.ok(weekday >= 1 && weekday <= 5, `${where} has a weekend date, ${date}`);
      if (index) assert.ok(date > scenario.dates[index - 1], `${where} dates are out of order at ${date}`);
    });
    for (const row of scenario.prices) {
      assert.equal(row.length, 5, `${where} needs spot and four futures on every row`);
      assert.ok(row.every(Number.isSafeInteger), `${where} prices must be whole cents`);
    }
    // A month that expires mid-run needs a fifth month to take its place, and a price for it.
    assert.equal(scenario.months.length, scenario.expiry ? 5 : 4, `${where} lists the wrong number of months`);
    if (scenario.expiry) assert.ok(Number.isSafeInteger(scenario.afterExpiry?.price), `${where} needs a price for the newly listed month`);
    assert.equal(scenario.days.length, 10, `${where} needs a briefing and a result for each of its ten days`);
    for (const [index, day] of scenario.days.entries()) {
      for (const text of [day.known, day.happened]) {
        assert.ok(text && words(text) >= 5 && words(text) <= 48, `${where} day ${index + 1} has a missing or overlong text`);
        assert.match(text, /[.]$/, `${where} day ${index + 1} text should be a finished sentence`);
      }
    }
    for (const text of [scenario.intro, scenario.aftermath, scenario.summary]) assert.ok(text && words(text) >= 8 && words(text) <= 70, `${where} intro, summary or aftermath is missing or overlong`);
    // Every date must be a weekday, with no gap longer than a long weekend.
    scenario.dates.forEach((date, index) => {
      if (index) assert.ok((new Date(`${date}T12:00:00Z`) - new Date(`${scenario.dates[index - 1]}T12:00:00Z`)) / 864e5 <= 4, `${where} skips trading days before ${date}`);
    });
  }
});

test('a historical scenario plays its real prices and keeps the books straight', () => {
  for (const scenario of scenarios) {
    const options = { ...quiet, scenario };
    for (let run = 0; run < 25; run++) {
      const seed = `scenario-${scenario.key}`;
      const pick = random(run + 11);
      let state = game.replay(seed, [], options);
      assert.equal(state.net, 0, `${scenario.key} should open with the cargo bought and hedged at that day's prices`);
      while (state.round) {
        assert.equal(state.phase, 'am', `${scenario.key} must have no afternoon tickets`);
        assert.equal(state.market.watch, null, `${scenario.key} must quote no odds`);
        // Before the front month expires, the ticket shows that close's real row in full.
        if (!scenario.expiry || state.stage < scenario.expiry) assert.deepEqual(state.market.prices, scenario.prices[state.stage], `${scenario.key} is not on its real prices on day ${state.stage + 1}`);
        assert.equal(state.market.prices[0], scenario.prices[state.stage][0], `${scenario.key} is not on its real spot price on day ${state.stage + 1}`);
        assert.equal(state.market.briefing, scenario.days[state.stage].known, `${scenario.key} shows the wrong briefing on day ${state.stage + 1}`);
        const order = firstValid(state, [randomOrder(state, pick), ...safeOrders(state)]);
        assert.ok(order, `${scenario.key} has no valid order on day ${state.stage + 1}`);
        const next = game.replay(seed, [...state.decisions, order], options);
        assert.equal(next.history.length, state.history.length + 1, `${scenario.key} rejected an order its preview accepted`);
        const step = next.history.at(-1);
        assert.equal(Object.values(step.parts).reduce((a, b) => a + b, 0), step.delta, `${scenario.key} P&L explain does not add up`);
        if (next.round) assert.ok(Math.abs(next.netLots) <= game.netLimitLots, `${scenario.key} exceeded the desk limit`);
        state = next;
      }
      const closed = game.replay(seed, state.decisions, { scenario });
      assert.equal(closed.history.at(-1).market.prices[0], scenario.prices[10][0], `${scenario.key} did not end on its real closing price`);
      assert.equal(closed.barrels, 0);
      assert.ok(closed.futuresBook.every((month) => month.position === 0), `${scenario.key} ended with futures open`);
      assert.equal(closed.entries.reduce((total, entry) => total + entry.cents, 0), closed.net, `${scenario.key} ledger does not sum to net`);
      assert.ok(closed.review.benchmark !== null, `${scenario.key} could not play the hold-and-hedge comparison`);
      assert.equal(closed.review.grade, null, `${scenario.key} should not be given a letter grade`);
      assert.equal(closed.history.length, game.totalCycles, `${scenario.key} should take exactly ten tickets`);
    }
  }
});

test('a malformed scenario is refused at the start of a run', () => {
  const good = scenarios[0];
  assert.throws(() => game.replay('bad', [], { scenario: { ...good, dates: good.dates.slice(1) } }), /dates/);
  assert.throws(() => game.replay('bad', [], { scenario: { ...good, expiry: 10 } }), /expiry/);
  assert.throws(() => game.replay('bad', [], { scenario: { ...good, months: good.months.slice(0, 4) } }), /month/);
  assert.throws(() => game.replay('bad', [], { scenario: { ...good, terminal: { events: ['nonsense'] } } }), /unknown terminal event/);
});

test('the expiring contract in a scenario settles at its real final price', () => {
  const scenario = scenarios.find((item) => item.expiry);
  let state = game.replay(`scenario-${scenario.key}`, [], { ...quiet, scenario });
  while (state.round && state.stage < scenario.expiry) {
    assert.equal(state.expiryToday, state.stage + 1 === scenario.expiry);
    state = game.replay(state.seed, [...state.decisions, firstValid(state, safeOrders(state))], { ...quiet, scenario });
  }
  const expired = state.history.at(-1).market.expired;
  assert.equal(expired.name, scenario.months[0]);
  assert.equal(expired.price, scenario.prices[scenario.expiry][1], 'the expiring month must settle at the front-month price of its last day');
  assert.equal(state.months[0], scenario.months[1], 'the next month should be the front month after expiry');
});

test('the hedge shortcut keeps a valid gross-limit spread intact', () => {
  const state = game.replay('review-ui-0', [], quiet);
  const ticket = {
    side: 'buy', barrels: 2000, client: 'redirect', storage: 0, storageCycles: 0,
    futuresTrades: [0, 7, 0, -7],
  };
  assert.equal(game.preview(state, ticket).ok, true);
  const adjusted = game.hedgeOrder(state, ticket);
  assert.deepEqual(adjusted.trades, ticket.futuresTrades);
  assert.equal(adjusted.limited, true);
  assert.equal(game.preview(state, { ...ticket, futuresTrades: adjusted.trades }).ok, true);
});

test('an emergency sale relieves a storage shortage after a local buyer walks', () => {
  const seed = 'review0';
  const first = {
    side: 'buy', barrels: 3000, client: 'accept', storage: 6000, storageCycles: 1,
    futuresTrades: [-3, 0, 0, 0],
  };
  const state = game.replay(seed, [first], quiet);
  assert.equal(state.storageShortfall, 5000);
  assert.equal(state.round.orderBook.storage.max, 4000);
  const ticket = {
    side: 'emergency', barrels: 1000, client: 'redirect', storage: 4000, storageCycles: 1,
    futuresTrades: [1, 0, 0, 0],
  };
  assert.equal(game.preview(state, ticket).ok, false);
  const haggle = { side: 'sell', asks: [80, 80] };
  assert.equal(game.preview(state, { ...ticket, haggle }).ok, true);
  const next = game.replay(seed, [first, { ...ticket, haggle }], quiet);
  assert.equal(next.history.length, 2);
  assert.ok(next.entries.some(entry => entry.label === 'Emergency crude sale'));
});

test('drawdown includes quiet midday marks between tickets', () => {
  const state = game.replay('risk-audit-1', [{
    side: 'hold', barrels: 0, client: 'redirect', storage: 0, storageCycles: 0,
    futuresTrades: [0, 0, 0, 0],
  }], quiet);
  assert.equal(state.net, 173000);
  assert.equal(state.maxDrawdown, 289000);
});

test('afternoon asks worsen against spot from the firm morning quote', () => {
  let state = game.replay('audit-0', [], quiet);
  while (state.stage < 2) state = game.replay(state.seed, [...state.decisions, complete(state, safeOrders(state)[0])], quiet);
  const next = game.replay(state.seed, [...state.decisions, complete(state, safeOrders(state)[0])], quiet);
  assert.equal(next.phase, 'pm');
  assert.equal(next.round.orderBook.buy.price - next.market.prices[0],
    state.round.orderBook.buy.price - state.market.prices[0] + 10);
});

test('an estimated post-expiry mark cannot be used for a fresh trade', () => {
  const scenario = scenarios.find(item => item.key === 'apr2020');
  const options = { ...quiet, scenario };
  let state = game.replay('scenario-apr2020', [], options);
  while (state.stage < scenario.expiry) state = game.replay(state.seed, [...state.decisions, complete(state, safeOrders(state)[0])], options);
  assert.equal(state.market.estimated, true);
  const order = complete(state, safeOrders(state)[0]);
  order.futuresTrades[3] = 1;
  assert.match(game.preview(state, order).errors.futuresTrades, /estimated mark/);
  assert.equal(game.replay(state.seed, [...state.decisions, order], options).history.length, scenario.expiry);
  assert.equal(game.replay(state.seed, [...state.decisions, order], {
    ...options, legacyEstimateThrough: scenario.expiry + 1,
  }).futuresBook.at(-1).averageEntry, scenario.afterExpiry.legacyPrice);
});

const deliveryReplayOptions = { withReview: false };

function order(state, changes = {}) {
  const ticket = {
    side: "hold", barrels: 0, storage: 0, storageCycles: 0,
    client: state.incoming ? "redirect" : "none",
    ...changes,
  };
  const traded = ticket.side === "buy" ? ticket.barrels : -ticket.barrels;
  const open = state.availableBarrels + traded - (ticket.delivery?.barrels ?? 0);
  return { ...ticket, futuresTrades: changes.futuresTrades ?? hedge(state, open) };
}

function entry(state, changes, options = deliveryReplayOptions) {
  const ticket = order(state, changes);
  const quote = game.preview(state, ticket);
  assert.equal(quote.ok, true, JSON.stringify(quote.errors));
  const next = game.replay(state.seed, [...state.decisions, ticket], options);
  const step = next.history.at(-1);
  assert.equal(next.history.length, state.history.length + 1);
  assert.equal(Object.values(step.parts).reduce((total, value) => total + value, 0), step.delta);
  assert.equal(next.reserved + next.availableBarrels, next.barrels);
  return next;
}

test("a forward fixes the physical mark and leaves futures as independent orders", () => {
  const start = game.replay("fixed-local");
  const delivery = { cycle: 4, barrels: 6000, route: "local", month: 1 };
  const ticket = order(start, { delivery, futuresTrades: [6, 0, 0, 0] });
  const estimate = game.preview(start, ticket);
  const contract = estimate.delivery;
  assert.equal(contract.fixedGross, start.market.prices[2] + contract.basis);
  assert.equal(contract.netVsSpot, 6000 * (contract.fixedGross - start.market.prices[0]));
  assert.equal(estimate.reserved, 6000);
  assert.equal(estimate.availableBarrels, 0);
  assert.equal(estimate.netLots, 0);
  assert.equal(estimate.perSpotDime, 0);
  assert.equal(estimate.perDollar, 0);
  const after = entry(start, ticket);
  assert.deepEqual(after.decisions[0].delivery, delivery);
  assert.equal(after.deliveryContracts[0].fixedGross, contract.fixedGross);
  assert.equal(after.components.physical, 6000 * (contract.fixedGross - start.cargoCost));
  assert.equal(after.futuresGross, 0);
  assert.equal(after.history[0].parts.trading, contract.netVsSpot);

  const invalidSale = order(after, { side: "sell", barrels: 1 });
  assert.equal(game.preview(after, invalidSale).physicalLimit, 0);
  assert.equal(game.preview(after, invalidSale).ok, false);
});

test("the ticket can buy and book the same crude", () => {
  const start = game.replay("buy-and-book");
  const delivery = { cycle: 6, barrels: 7000, route: "local", month: 2 };
  const after = entry(start, { side: "buy", barrels: 1000, delivery });
  assert.equal(after.reserved, 7000);
  assert.equal(after.availableBarrels, 0);
  assert.equal(after.futuresGross, 0);
  assert.equal(after.occupancy, 7000);
});

test("committed client and forward barrels require overflow through delivery", () => {
  const start = game.replay("committed-storage");
  const delivery = { cycle: 5, barrels: 6000, route: "local", month: 0 };
  const shortLease = order(start, { client: "accept", storage: 2000, storageCycles: 1, delivery });
  const estimate = game.preview(start, shortLease);
  assert.equal(estimate.storageRequired, 2000);
  assert.match(estimate.errors.storageCycles, /Committed cargo needs 2,000 bbl of overflow in cycle 2/);
  const term = start.round.orderBook.client.throughCycle;
  const next = entry(start, { ...shortLease, storageCycles: term });
  assert.equal(next.clientTotal, 6000);
  assert.equal(next.occupancy, 10000);
  assert.equal(next.storageBooked, 2000);
  assert.equal(next.storageShortfall, 0);
});

test("Gulf capacity is reduced by prior bookings and tariffs settle only once", () => {
  const start = game.replay("gulf-capacity");
  const first = { cycle: 4, barrels: 2500, route: "gulf", month: 1 };
  const booked = game.preview(start, order(start, { delivery: first })).delivery;
  assert.equal(booked.tariffCost, 2500 * booked.tariff);
  let state = entry(start, { delivery: first });
  assert.ok(!state.entries.some(item => item.label === "Forward pipeline tariff"));
  while (state.stage < 1 || state.phase === "pm") state = entry(state);
  assert.equal(state.deliveryOptions.cycles.find(day => day.cycle === 4).routes.gulf.max, 1500);
  const over = order(state, { delivery: { ...first, barrels: 1501 } });
  assert.match(game.preview(state, over).errors.delivery, /Book 1 to 1,500 bbl/);
  state = entry(state, { delivery: { ...first, barrels: 1500 } });
  while (state.stage < 4) state = entry(state);
  assert.equal(state.deliveryContracts.length, 0);
  assert.equal(state.deliveryHistory.length, 2);
  assert.equal(state.barrels, 2000);
  assert.equal(state.availableBarrels, 2000);
  assert.equal(state.deliveryHistory[0].fixedGross, booked.fixedGross);
  assert.equal(state.deliveryHistory[0].settledCycle, 4);
  const charges = state.entries.filter(item => item.label === "Forward pipeline tariff");
  assert.equal(charges.length, 2);
  assert.equal(charges[0].cents, -booked.tariffCost);
  assert.equal(charges[0].cycle, 4);
});

test("Harvey closes dated Gulf slots while leaving local and reopened slots available", () => {
  const scenario = scenarios.find(item => item.key === "harvey2017");
  const options = { ...deliveryReplayOptions, scenario };
  let state = game.replay("scenario-harvey2017", [], options);
  for (const { cycle, routes } of state.deliveryOptions.cycles) {
    assert.equal(routes.local.max, 12000);
    if (cycle >= 3 && cycle <= 6) {
      assert.equal(routes.gulf.max, 0);
      assert.match(routes.gulf.unavailable, /Gulf route is closed/);
    } else {
      assert.equal(routes.gulf.max, 4000);
      assert.equal(routes.gulf.unavailable, undefined);
    }
  }

  while (state.stage < 3) state = entry(state, {}, options);
  const delivery = { cycle: 5, barrels: 2000, route: "gulf", month: 0 };
  const blocked = order(state, { delivery });
  assert.match(game.preview(state, blocked).errors.delivery, /closed on Wed 30 Aug 2017/);
  assert.equal(game.replay(state.seed, [...state.decisions, blocked], options).history.length, 3);
  assert.ok(game.preview(state, order(state, { delivery: { ...delivery, route: "local" } })).ok);
  assert.ok(game.preview(state, order(state, { delivery: { ...delivery, cycle: 7 } })).ok);
});

test("a saved Harvey booking settles under its original rules without opening new closed slots", () => {
  const scenario = scenarios.find(item => item.key === "harvey2017");
  const options = { ...deliveryReplayOptions, scenario, legacyDeliveryThrough: 4 };
  let state = game.replay("scenario-harvey2017", [], options);
  while (state.stage < 3) state = entry(state, {}, options);
  const first = order(state, { delivery: { cycle: 5, barrels: 2000, route: "gulf", month: 0 } });
  const afterBooking = game.replay(state.seed, [...state.decisions, first], options);
  assert.equal(afterBooking.deliveryContracts[0].barrels, 2000);
  const second = order(afterBooking, { delivery: { ...first.delivery, cycle: 6 } });
  assert.match(game.preview(afterBooking, second).errors.delivery, /closed on Thu 31 Aug 2017/);
  assert.equal(game.replay(state.seed, [...afterBooking.decisions, second], options).history.length, 4);
  const settled = entry(afterBooking, {}, options);
  assert.equal(settled.deliveryHistory[0].settledCycle, 5);
  assert.equal(settled.deliveryHistory[0].barrels, 2000);
});

test("cycle ten settles the contracted cargo before the auction", () => {
  const start = game.replay("forward-to-close");
  const delivery = { cycle: 10, barrels: 4000, route: "local", month: 0 };
  let state = entry(start, { delivery });
  while (state.round) state = entry(state);
  assert.equal(state.deliveryContracts.length, 0);
  assert.equal(state.deliveryHistory.length, 1);
  assert.equal(state.deliveryHistory[0].settledCycle, 10);
  assert.equal(state.deliveryHistory[0].monthName, "Dec");
  assert.equal(state.barrels, 0);
  assert.equal(state.futuresGross, 0);
  const [sold, auction] = state.entries.filter(item => /Local forward delivery|Closing auction/.test(item.label));
  assert.match(sold.detail, /^4,000 bbl/);
  assert.match(auction.detail, /^2,000 bbl/);
  assert.equal(state.entries.reduce((total, item) => total + item.cents, 0), state.net);
  assert.equal(game.replay(state.seed, state.decisions).review.opening, 120000);
});

test("the calendar rules reject same-day bookings, unavailable months, and afternoon orders", () => {
  let state = game.replay("calendar-rules");
  const delivery = { cycle: 2, barrels: 1000, route: "local", month: 0 };
  assert.ok(game.preview(state, order(state, { delivery: { ...delivery, cycle: 1 } })).errors.delivery);
  assert.ok(game.preview(state, order(state, { delivery: { ...delivery, month: 4 } })).errors.delivery);
  while (state.phase !== "pm" && state.round) state = entry(state);
  assert.equal(state.phase, "pm");
  assert.equal(state.deliveryOptions, null);
  assert.ok(game.preview(state, order(state, { delivery: { ...delivery, cycle: state.stage + 2 } })).errors.delivery);
});

test("saved orders without delivery selections still replay", () => {
  const start = game.replay("legacy-order");
  const orders = [{ side: "hold", barrels: 0, storage: 0, storageCycles: 0, client: "redirect", futuresTrades: [0, 0, 0, 0] }];
  const after = game.replay(start.seed, orders);
  assert.equal(after.history.length, 1);
  assert.deepEqual(after.decisions, orders);
  assert.equal(after.reserved, 0);
  assert.equal(after.availableBarrels, start.barrels);
  assert.deepEqual(game.replay(start.seed, [{ ...orders[0], delivery: null }]), after);
});

// Cargo Desk tutorial tests mirrored from the standalone project.
new Function('window', readFileSync(new URL('../public/cargo-desk/tutorial-engine.js', import.meta.url), 'utf8'))(page);
{
const g = game;
const t = page.CargoTutorial;

const parts = ["trading", "price", "basis", "spreads", "clients", "costs"];

function open(barrels = 2000) {
  const opened = t.buy(t.init(), { barrels, shortLots: barrels / g.lot });
  assert.equal(opened.ok, true, opened.error);
  return opened.state;
}

function book(state, route = "local", month = 1) {
  const choice = { route, month, closeLots: state.barrels / g.lot };
  const offer = t.forwardQuote(state, choice);
  assert.equal(offer.ok, true, offer.error);
  const booked = t.forward(state, choice);
  assert.equal(booked.ok, true, booked.error);
  return booked.state;
}

test("the isolated opening matches the live engine book and quotes", () => {
  const first = t.init();
  const second = t.init();
  assert.notEqual(first, second);
  assert.deepEqual(first, second);
  assert.deepEqual(first.market, g.replay(t.seed, [], { withReview: false }));
  assert.equal(first.step, "buy");
  assert.equal(first.market.barrels, 6000);
  assert.equal(first.market.cargoCost, 7220);
  assert.deepEqual(first.market.futuresPositions, [-6, 0, 0, 0]);
  assert.equal(first.opening, 120000);
  assert.deepEqual(first.buyQuote, { price: 7261, hedgePrice: 7360, monthName: "Dec", tankLease: 80000, clientFee: 163700 });
  assert.equal(first.market.decisions.length, 0);
  const max = Math.min(4 * g.lot, first.market.round.orderBook.buy.max, g.capacity - first.market.occupancy);
  assert.deepEqual(t.purchaseSizes, Array.from({ length: Math.floor(max / g.lot) }, (_, index) => (index + 1) * g.lot));
});

test("every offered parcel, route and WTI month executes and reconciles", () => {
  for (const barrels of t.purchaseSizes) {
    const bought = open(barrels);
    assert.equal(bought.step, "forward");
    assert.equal(bought.market.stage, 1);
    assert.equal(bought.market.phase, "am");
    assert.equal(bought.market.barrels, 6000 + barrels);
    assert.equal(bought.market.futuresPositions[0], -6 - barrels / g.lot);
    assert.equal(bought.market.netLots, 0);
    assert.equal(bought.market.decisions[0].client, "redirect");
    assert.equal(bought.forwardOptions.length, 8);
    const routes = new Set(bought.forwardOptions.map((option) => option.route));
    assert.deepEqual(routes, new Set(["local", "gulf"]));

    for (const route of routes) {
      for (const reference of bought.market.deliveryOptions.months) {
        const booked = book(bought, route, reference.month);
        assert.equal(booked.step, "settle");
        assert.equal(booked.market.stage, 2);
        assert.equal(booked.market.phase, "am");
        assert.equal(booked.market.reserved, barrels);
        assert.equal(booked.market.availableBarrels, 6000);
        assert.deepEqual(booked.market.futuresPositions, [-6, 0, 0, 0]);
        assert.equal(booked.market.netLots, 0);
        assert.equal(booked.contract.fixedGross, reference.price + booked.contract.basis);

        const settlement = t.settle(booked);
        assert.equal(settlement.ok, true, settlement.error);
        const done = settlement.state;
        assert.equal(done.step, "complete");
        assert.equal(done.market.stage, t.deliveryCycle);
        assert.equal(done.market.barrels, 6000);
        assert.equal(done.market.reserved, 0);
        assert.equal(done.market.futuresPositions[0], -6);
        assert.equal(done.market.deliveryHistory.length, 1);
        assert.equal(done.market.deliveryHistory[0].settledCycle, t.deliveryCycle);
        assert.equal(done.market.deliveryHistory[0].fixedGross, done.contract.fixedGross);
        assert.equal(done.market.deliveryHistory[0].tariffCost, done.contract.tariffCost);
        assert.deepEqual(done.market.history.map((ticket) => [ticket.cycle, ticket.phase]), [[1, "am"], [2, "am"], [3, "am"], [3, "pm"]]);
        assert.equal(done.breakdown.total, done.market.net - done.opening);
        assert.equal(parts.reduce((sum, part) => sum + done.breakdown[part], 0), done.breakdown.total);
        assert.equal(done.breakdown.costs, -done.breakdown.tankFees - done.breakdown.clientFees - done.breakdown.tariffCost);
        assert.equal(done.breakdown.parcel.priceMargin, barrels * (done.contract.fixedGross - done.buyQuote.price));
        assert.deepEqual(done.market, g.replay(t.seed, done.market.decisions, { withReview: false }));
      }
    }
  }
});

test("the flat hedge is a suggestion, while the live limit and input rules still apply", () => {
  const start = t.init();
  const under = t.buyQuote(start, { barrels: 2000, shortLots: 1 });
  assert.equal(under.ok, true);
  assert.equal(under.netLots, 1);
  assert.equal(under.estimate.netLots, 1);
  assert.equal(under.suggestedLots, 2);
  assert.equal(t.buy(start, { barrels: 2000, shortLots: 1 }).state.step, "forward");
  assert.equal(t.buyQuote(start, { barrels: 2000, shortLots: 3 }).netLots, -1);
  const missingHedge = t.buyQuote(start, { barrels: 2000 });
  assert.match(missingHedge.error, /whole number of lots/);
  assert.equal(missingHedge.netLots, 2);
  for (const shortLots of [-1, 1.5, 100]) {
    const rejected = t.buy(start, { barrels: 2000, shortLots });
    assert.equal(rejected.state, start);
    assert.match(rejected.estimate.errors.futuresTrades, /whole number of lots/);
  }
  const overShort = t.buy(start, { barrels: 2000, shortLots: 5 });
  assert.equal(overShort.state, start);
  assert.equal(overShort.netLots, -3);
  assert.match(overShort.estimate.errors.exposure, /net position would be 3 lots short.*limit is 2/i);

  const bought = open();
  const unclosed = t.forwardQuote(bought, { route: "local", month: 1, closeLots: 0 });
  assert.equal(unclosed.ok, true);
  assert.equal(unclosed.netLots, -2);
  assert.equal(unclosed.suggestedLots, 2);
  assert.equal(unclosed.contract.fixedGross, 7295);
  assert.equal(t.forward(bought, { route: "local", month: 1, closeLots: 0 }).state.step, "settle");
  assert.equal(t.forwardQuote(bought, { route: "local", month: 1, closeLots: 3 }).netLots, 1);
  assert.match(t.forwardQuote(bought, { route: "local", month: 1 }).error, /whole number of lots/);
  const overLong = t.forward(bought, { route: "gulf", month: 0, closeLots: 5 });
  assert.equal(overLong.state, bought);
  assert.equal(overLong.netLots, 3);
  assert.match(overLong.estimate.errors.exposure, /net position would be 3 lots long.*limit is 2/i);
});

test("2,000 bbl and three buybacks on Gulf Dec advances and reflects the remaining long lot", () => {
  const bought = open();
  const choice = { route: "gulf", month: 0, closeLots: 3 };
  const quote = t.forwardQuote(bought, choice);
  assert.equal(quote.ok, true);
  assert.equal(quote.suggestedLots, 2);
  assert.equal(quote.netLots, 1);
  const booked = t.forward(bought, choice);
  assert.equal(booked.ok, true);
  const { state: done } = t.settle(booked.state);
  assert.equal(done.step, "complete");
  assert.equal(done.breakdown.endingNetLots, 1);
  assert.equal(done.breakdown.endingCrudeBarrels, 6000);
  assert.deepEqual(done.breakdown.endingFuturesPositions, [-5, 0, 0, 0]);
  assert.equal(done.breakdown.futuresPnl, done.market.components.hedge - bought.openingFuturesPnl);
  assert.equal(done.breakdown.price, -165000);
  assert.equal(done.breakdown.total, -242700);
});

test("every legal signed adjustment settles across tilted buys and partial delivery sizes", () => {
  for (const purchase of t.purchaseSizes) {
    for (let shortLots = 0; shortLots <= 6; shortLots++) {
      const purchaseNet = purchase / g.lot - shortLots;
      const bought = t.buy(t.init(), { barrels: purchase, shortLots });
      assert.equal(bought.ok, Math.abs(purchaseNet) <= g.netLimitLots);
      if (!bought.ok) continue;

      for (const barrels of t.purchaseSizes.filter(size => size <= purchase)) {
        const neutral = barrels / g.lot - purchaseNet;
        for (const { route, month } of bought.state.forwardOptions) {
          for (let net = -g.netLimitLots; net <= g.netLimitLots; net++) {
            const choice = { route, month, barrels, closeLots: neutral + net };
            const quote = t.forwardQuote(bought.state, choice);
            assert.equal(quote.ok, true, quote.error);
            assert.equal(quote.suggestedLots, neutral);
            assert.equal(quote.netLots, net);
            assert.equal(quote.contract.barrels, barrels);
            const booked = t.forward(bought.state, choice);
            assert.equal(booked.ok, true, booked.error);
            const settled = t.settle(booked.state);
            assert.equal(settled.ok, true, settled.error);
            const done = settled.state;
            assert.equal(done.breakdown.endingCrudeBarrels, 6000 + purchase - barrels);
            assert.equal(done.breakdown.endingNetLots, net);
            assert.equal(done.breakdown.futuresPnl, done.market.components.hedge - done.openingFuturesPnl);
            assert.equal(done.breakdown.drawdown, done.market.maxDrawdown);
            assert.equal(parts.reduce((sum, part) => sum + done.breakdown[part], 0), done.breakdown.total);
            assert.equal(done.breakdown.parcel.barrels, barrels);
            assert.equal(done.breakdown.parcel.marginAfterTariff, done.breakdown.parcel.priceMargin - done.contract.tariffCost);
          }
        }
      }
    }
  }
});

test("invalid sizes, routes, months and premature actions preserve the current step", () => {
  const start = t.init();
  for (const barrels of [0, 999, 3000, "1000", null, NaN]) {
    assert.equal(t.buy(start, { barrels, shortLots: 1 }).ok, false);
  }
  assert.equal(t.buy(start, null).ok, false);
  assert.equal(t.forward(start, { route: "local", month: 1, closeLots: 1 }).state, start);
  assert.equal(t.settle(start).state, start);
  const bought = open(1000);
  for (const [route, month] of [["ship", 0], ["local", 4], ["gulf", "1"], ["local", null]]) {
    const invalid = t.forward(bought, { route, month, closeLots: 1 });
    assert.equal(invalid.ok, false);
    assert.equal(invalid.state, bought);
    assert.equal(invalid.options.length, 8);
  }
  for (const barrels of [0, 500, 2000, null, "1000"]) {
    const invalid = t.forward(bought, { route: "local", month: 1, barrels, closeLots: 1 });
    assert.equal(invalid.state, bought);
    assert.match(invalid.error, /delivery size.*up to the 1,000 barrels/i);
  }
  assert.equal(t.forward(bought, null).ok, false);
  assert.equal(t.settle(bought).state, bought);
  const done = t.settle(book(bought)).state;
  assert.equal(t.settle(done).ok, false);
});

test("the Local and Gulf Jan examples show how tariffs change the lesson result", () => {
  const bought = open();
  const local = t.forwardQuote(bought, { route: "local", month: 1, closeLots: 2 });
  const gulf = t.forwardQuote(bought, { route: "gulf", month: 1, closeLots: 2 });
  assert.deepEqual([local.fixedGross, local.tariff, local.netPrice], [7295, 0, 7295]);
  assert.deepEqual([gulf.fixedGross, gulf.tariff, gulf.netPrice], [7345, 97, 7248]);
  const { breakdown } = t.settle(book(bought)).state;
  assert.deepEqual(breakdown, {
    trading: 38000, price: 0, basis: 422000, spreads: 0, clients: 0, costs: -403700,
    total: 56300, opening: 120000, closing: 176300, clientFees: 163700, tankFees: 240000, tariffCost: 0,
    futuresPnl: 1214000, endingNetLots: 0, endingCrudeBarrels: 6000, endingFuturesPositions: [-6, 0, 0, 0], drawdown: 285700,
    parcel: { barrels: 2000, buyPrice: 7261, fixedGross: 7295, priceMargin: 68000, tariffCost: 0, marginAfterTariff: 68000 },
  });
  const gulfBreakdown = t.settle(book(bought, "gulf")).state.breakdown;
  assert.equal(gulfBreakdown.total, -37700);
  assert.equal(gulfBreakdown.tariffCost, 194000);
  assert.equal(breakdown.total - gulfBreakdown.total, 2000 * (local.netPrice - gulf.netPrice));
});
}
// End Cargo Desk tutorial tests.
