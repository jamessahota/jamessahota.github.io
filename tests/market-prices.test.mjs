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
