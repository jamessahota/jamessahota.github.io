import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mergeCachedPrices, parseFred, parseYahoo, priceCache, refreshPrices, validateObservation } from '../scripts/lib/market-prices.mjs';

const now = new Date('2026-11-13T18:00:00Z');
const fred = { label: 'NYH ULSD', unit: 'US$ per gallon', sourceUrl: 'https://fred.stlouisfed.org/series/DDFUELNYH',
  fetch: { provider: 'fred', series: 'DDFUELNYH' }, value: 4.204, date: '2026-11-11' };
const response = (text) => ({ ok: true, text: async () => text });
const yahoo = (end = '2026-11-13T22:00:00Z') => ({ chart: { result: [{
  meta: { symbol: 'BZ=F', currentTradingPeriod: { regular: { end: Date.parse(end) / 1000 } } },
  timestamp: ['2026-11-12T14:00:00Z', '2026-11-13T14:00:00Z'].map((day) => Date.parse(day) / 1000),
  indicators: { quote: [{ close: [96, 95.84] }] },
}] } });
const brent = (bars, session = {}) => ({ chart: { result: [{
  meta: { symbol: 'BZ=F', currentTradingPeriod: { regular: session } },
  timestamp: bars.map(([date]) => Date.parse(date) / 1000),
  indicators: { quote: [{ close: bars.map(([, close]) => close) }] },
}] } });

test('FRED reads the configured daily series and skips unpublished observations', () => {
  assert.deepEqual(parseFred('observation_date,DDFUELNYH\n2026-11-11,4.204\n2026-11-12,.', 'DDFUELNYH', now),
    { value: 4.204, date: '2026-11-11' });
  assert.throws(() => parseFred('DATE,DHOILNYH\n2026-11-11,4', 'DDFUELNYH', now), /benchmark/);
  assert.throws(() => parseFred('DATE,DDFUELNYH\n2026-11-11,garbage', 'DDFUELNYH', now), /finite/);
});

test('Yahoo intraday bars are excluded until their declared trading session has ended', () => {
  assert.deepEqual(parseYahoo(yahoo(), 'BZ=F', now), { value: 96, date: '2026-11-12' });
  assert.deepEqual(parseYahoo(yahoo(), 'BZ=F', new Date('2026-11-13T22:30:00Z')),
    { value: 95.84, date: '2026-11-13' });
  assert.throws(() => parseYahoo(yahoo(), 'CL=F', now), /benchmark/);
});

test('Brent rejects the Sunday pseudo-close even after Yahoo declares its calendar day ended', () => {
  const snapshot = brent([
    ['2026-11-13T05:00:00Z', 95.84], ['2026-11-15T05:00:00Z', 95.27],
  ], { start: Date.parse('2026-11-15T05:00:00Z') / 1000, end: Date.parse('2026-11-16T04:59:00Z') / 1000 });
  assert.deepEqual(parseYahoo(snapshot, 'BZ=F', new Date('2026-11-16T04:59:10Z')),
    { value: 95.84, date: '2026-11-13' });
});

test('Brent overnight bars remain unfinished across midnight and use the trading-day date when complete', () => {
  const snapshot = brent([
    ['2026-11-13T05:00:00Z', 95.84], ['2026-11-15T23:00:00Z', 95.27],
  ], { start: Date.parse('2026-11-15T23:00:00Z') / 1000, end: Date.parse('2026-11-16T22:00:00Z') / 1000 });
  for (const time of ['2026-11-16T04:59:10Z', '2026-11-16T05:24:00Z', '2026-11-16T21:59:00Z']) {
    assert.deepEqual(parseYahoo(snapshot, 'BZ=F', new Date(time)), { value: 95.84, date: '2026-11-13' });
  }
  assert.deepEqual(parseYahoo(snapshot, 'BZ=F', new Date('2026-11-16T22:30:00Z')),
    { value: 95.27, date: '2026-11-16' });
});

test('Brent accepts completed weekday closes after the publication buffer in both winter and summer', () => {
  for (const [date, stamp, before, after, end] of [
    ['2026-11-13', '2026-11-13T05:00:00Z', '2026-11-13T22:14:00Z', '2026-11-13T22:30:00Z', '2026-11-14T04:59:00Z'],
    ['2026-07-15', '2026-07-15T04:00:00Z', '2026-07-15T21:14:00Z', '2026-07-15T21:30:00Z', '2026-07-16T03:59:00Z'],
  ]) {
    const snapshot = brent([[stamp, 95.84]], { end: Date.parse(end) / 1000 });
    assert.throws(() => parseYahoo(snapshot, 'BZ=F', new Date(before)), /no completed/);
    assert.deepEqual(parseYahoo(snapshot, 'BZ=F', new Date(after)), { value: 95.84, date });
  }
});

test('Brent refuses an ambiguous latest bar after reopening but can retain a separated completed bar', () => {
  const bars = [['2026-11-13T05:00:00Z', 96], ['2026-11-16T05:00:00Z', 95.84]];
  assert.deepEqual(parseYahoo(brent(bars), 'BZ=F', new Date('2026-11-16T23:30:00Z')),
    { value: 96, date: '2026-11-13' });
  const next = [['2026-11-16T05:00:00Z', 95.84], ['2026-11-16T23:00:00Z', 95.27]];
  assert.deepEqual(parseYahoo(brent(next), 'BZ=F', new Date('2026-11-16T23:30:00Z')),
    { value: 95.84, date: '2026-11-16' });
});

test('Brent keeps the completed Friday close after the market shuts for the weekend', () => {
  const snapshot = brent([['2026-11-13T05:00:00Z', 95.84]]);
  for (const time of ['2026-11-13T23:30:00Z', '2026-11-14T12:00:00Z', '2026-11-15T12:00:00Z']) {
    assert.deepEqual(parseYahoo(snapshot, 'BZ=F', new Date(time)), { value: 95.84, date: '2026-11-13' });
  }
});

test('a delayed Yahoo payload cannot turn an overnight quote into a close at midnight', () => {
  const snapshot = brent([['2026-11-13T05:00:00Z', 95.84], ['2026-11-16T05:00:00Z', 95.27]]);
  snapshot.chart.result[0].meta.regularMarketTime = Date.parse('2026-11-17T04:58:00Z') / 1000;
  for (const time of ['2026-11-17T04:59:00Z', '2026-11-17T05:05:00Z']) {
    assert.deepEqual(parseYahoo(snapshot, 'BZ=F', new Date(time)), { value: 95.84, date: '2026-11-13' });
  }
});

test('Yahoo cannot accept a future timestamp hidden inside the current calendar date', () => {
  assert.throws(() => parseYahoo(brent([['2026-11-13T23:00:00Z', 95.84]]), 'BZ=F',
    new Date('2026-11-13T22:30:00Z')), /future daily bar/);
});

test('invalid values and invented or future observation dates are rejected', () => {
  for (const value of [NaN, Infinity, 0, -1, '4.2']) assert.throws(() => validateObservation({ value, date: '2026-11-11' }, now));
  for (const date of ['2026-02-30', '2026-11-14', '', null]) assert.throws(() => validateObservation({ value: 4, date }, now));
});

test('last-good cached observations survive source failure without changing their market date', async () => {
  const prior = { ...fred, value: 4.25, date: '2026-11-12', checkedAt: '2026-11-12T23:00:00Z' };
  const restored = mergeCachedPrices({ diesel: fred }, priceCache({ diesel: prior }), now);
  const result = await refreshPrices(restored, { now, fetchImpl: async () => { throw new Error('offline'); } });
  assert.equal(result.failures, 1);
  assert.equal(result.prices.diesel.value, 4.25);
  assert.equal(result.prices.diesel.date, '2026-11-12');
  assert.equal(result.prices.diesel.checkedAt, prior.checkedAt);
  assert.equal(result.prices.diesel.refreshStatus, 'failed');
  assert.equal(result.prices.diesel.lastAttemptAt, now.toISOString());
});

test('a stale, future, incompatible or foreign-source cache cannot replace the configured series', () => {
  for (const alteration of [
    { value: 4.1, date: '2026-11-10' }, { value: 4.3, date: '2026-11-14' },
    { label: 'different benchmark', date: '2026-11-12' }, { date: '2026-11-12', sourceUrl: 'https://example.com/price' },
  ]) {
    const cache = priceCache({ diesel: { ...fred, ...alteration } });
    assert.equal(mergeCachedPrices({ diesel: fred }, cache, now).diesel.value, fred.value);
  }
});

test('a verified same-day provider correction survives a later refresh failure', async () => {
  const corrected = { ...fred, value: 4.21, checkedAt: '2026-11-12T23:00:00Z' };
  const restored = mergeCachedPrices({ diesel: fred }, priceCache({ diesel: corrected }), now);
  const { prices } = await refreshPrices(restored, { now, fetchImpl: async () => { throw new Error('offline'); } });
  assert.equal(prices.diesel.value, 4.21);
  assert.equal(prices.diesel.date, fred.date);
  const newerConfig = { ...fred, checkedAt: '2026-11-13T16:00:00Z' };
  assert.equal(mergeCachedPrices({ diesel: newerConfig }, priceCache({ diesel: corrected }), now).diesel.value, fred.value);
});

test('old Yahoo parser caches are discarded without losing other providers or the corrected fallback', async () => {
  const configured = { label: 'Brent', unit: 'US$ per barrel', sourceUrl: 'https://finance.yahoo.com/quote/BZ%3DF/history/',
    fetch: { provider: 'yahoo', ticker: 'BZ=F' }, value: 95.84, date: '2026-11-13' };
  const saved = { ...configured, value: 95.27, date: '2026-11-15', checkedAt: '2026-11-16T04:59:10Z' };
  const diesel = { ...fred, value: 4.25, date: '2026-11-12', checkedAt: '2026-11-13T16:00:00Z' };
  const cache = priceCache({ brent: saved, diesel });
  cache.entries.brent.identity = JSON.stringify({ label: configured.label, unit: configured.unit, fetch: configured.fetch });
  const checked = new Date('2026-11-16T05:24:00Z');
  const restored = mergeCachedPrices({ brent: configured, diesel: fred }, cache, checked);
  assert.equal(restored.brent.value, 95.84);
  assert.equal(restored.brent.date, '2026-11-13');
  assert.equal(restored.diesel.value, 4.25);
  const { prices } = await refreshPrices(restored, { now: checked, fetchImpl: async () => { throw new Error('offline'); } });
  assert.equal(prices.brent.value, 95.84);
  assert.equal(prices.brent.date, '2026-11-13');
});

test('completed closes saved by the corrected Yahoo parser survive a later source failure', async () => {
  const configured = { label: 'Brent', unit: 'US$ per barrel', sourceUrl: 'https://finance.yahoo.com/quote/BZ%3DF/history/',
    fetch: { provider: 'yahoo', ticker: 'BZ=F' }, value: 95.84, date: '2026-11-13' };
  const checked = new Date('2026-11-16T22:30:00Z');
  const updated = await refreshPrices({ brent: configured }, {
    now: checked, fetchImpl: async () => ({ ok: true, json: async () => brent([['2026-11-16T05:00:00Z', 96.5]]) }),
  });
  assert.equal(updated.failures, 0);
  const later = new Date('2026-11-17T05:30:00Z');
  const restored = mergeCachedPrices({ brent: configured }, priceCache(updated.prices), later);
  const { prices } = await refreshPrices(restored, { now: later, fetchImpl: async () => { throw new Error('offline'); } });
  assert.equal(prices.brent.value, 96.5);
  assert.equal(prices.brent.date, '2026-11-16');
  assert.equal(prices.brent.checkedAt, checked.toISOString());
});

test('older provider observations are retained as failures, never published as a newer check', async () => {
  const { prices, failures } = await refreshPrices({ diesel: fred }, {
    now, fetchImpl: async () => response('DATE,DDFUELNYH\n2026-11-10,4.5'),
  });
  assert.equal(failures, 1);
  assert.equal(prices.diesel.date, fred.date);
  assert.equal(prices.diesel.value, fred.value);
});

test('a shared weekly request updates both routes while a separate provider fails', async () => {
  let calls = 0;
  const route = (name) => ({ label: name, unit: 'US$', fetch: { provider: 'baltic', route: name }, value: 1, date: '2026-11-06' });
  const { prices, failures } = await refreshPrices({ lng: route('BLNG3'), lpg: route('BLPG3'), diesel: fred }, {
    now, fetchImpl: async () => { throw new Error('offline'); },
    balticLoader: async () => {
      calls++;
      return { BLNG3: { value: 56000, date: '2026-11-13' }, BLPG3: { value: 310.86, date: '2026-11-13' } };
    },
  });
  assert.equal(calls, 1);
  assert.equal(failures, 1);
  assert.equal(prices.lng.value, 56000);
  assert.equal(prices.lpg.value, 310.86);
  assert.equal(prices.diesel.value, fred.value);
});

test('unknown providers fail explicitly rather than accidentally reading a FRED series', async () => {
  let requests = 0;
  const { failures } = await refreshPrices({ bad: { ...fred, fetch: { provider: 'unknown' } } }, {
    now, fetchImpl: async () => { requests++; return response(''); },
  });
  assert.equal(failures, 1);
  assert.equal(requests, 0);
});
