import assert from 'node:assert/strict';
import { test } from 'node:test';
import { fetchJkmReference, JKM_REFERENCE_URL, parseJkmReference } from '../scripts/lib/jkm-reference.mjs';

// Minimal public markup captured from Trading Economics on 15 November 2026.
// Keeps source observation (13th), modification (13th) and page update (14th) separate.
const description = "LNG JKM fell to 31.35 USD/MMBTU on November 13, 2026, down 0.04% from the previous day. Over the past month, LNG JKM's price has risen 18.82%, and is up 181.76% compared to the same time last year, according to trading on a contract for difference (CFD) that tracks the benchmark market for this commodity.";
const dataset = {
  '@type': 'Dataset',
  name: 'Liquefied Natural Gas Japan Korea - Price Data',
  description,
  url: JKM_REFERENCE_URL,
  temporalCoverage: '2012-09-27/2026-11-13',
  dateModified: '20261113T12:00:00.00Z',
};
const metadata = {
  value: 31.351000000000,
  converted_value: 31.351000000000,
  symbol: 'LNGJKM:COM',
  last: 31.351000000000,
  type: 'Commodity',
  name: 'LNG JKM',
  full_name: 'Liquefied Natural Gas Japan Korea',
  ticker: 'LNGJKM:COM',
  timezone: 'UTC',
  supported_resolutions: ['D', 'W', 'M'],
};
function fixture({ data = dataset, meta = metadata, visible = '31.35', title = 'Liquefied Natural Gas Japan Korea - Price - Chart - Historical Data - News' } = {}) {
  return `<title>\n\t${title}\n</title>
<script type="application/ld+json">${JSON.stringify({ '@context': 'https://schema.org/', '@graph': [{ '@type': 'Organization', name: 'TRADING ECONOMICS' }, data] })}</script>
<script>var TELastUpdate = '202611141716'; TEChartsMeta = ${JSON.stringify([meta])}; console.log('TEChartsMeta:', TEChartsMeta);</script>
<span id="market_last">${visible}</span>`;
}
const now = new Date('2026-11-15T12:00:00Z');

test('JKM reference uses the dated rounded public quotation, not the access/update date', () => {
  assert.deepEqual(parseJkmReference(fixture(), { now }), { value: 31.35, date: '2026-11-13', sourceUrl: JKM_REFERENCE_URL });
});

test('a wrong commodity, currency, unit, or unidentified reference basis cannot refresh JKM', () => {
  const wrong = [
    fixture({ title: 'Brent - Price - Chart - Historical Data - News' }),
    fixture({ data: { ...dataset, name: 'Brent - Price Data' } }),
    fixture({ data: { ...dataset, url: 'https://tradingeconomics.com/commodity/brent-crude-oil' } }),
    fixture({ meta: { ...metadata, ticker: 'CO1:COM' } }),
    fixture({ meta: { ...metadata, symbol: 'NG1:COM' } }),
    fixture({ meta: { ...metadata, full_name: 'Natural Gas' } }),
    fixture({ data: { ...dataset, description: description.replace('USD/MMBTU', 'JPY/MMBTU') } }),
    fixture({ data: { ...dataset, description: description.replace('USD/MMBTU', 'USD/tonne') } }),
    fixture({ data: { ...dataset, description: description.replace('contract for difference (CFD)', 'official spot assessment') } }),
  ];
  for (const html of wrong) assert.throws(() => parseJkmReference(html, { now }));
});

test('invalid, nonpositive, or inconsistent price fields fail closed', () => {
  for (const price of ['NaN', 'Infinity', '0', '-3', '31.35garbage', '31,35', '1e309']) {
    assert.throws(() => parseJkmReference(fixture({ data: { ...dataset, description: description.replace('31.35 USD', `${price} USD`) } }), { now }));
  }
  assert.throws(() => parseJkmReference(fixture({ visible: '32.15' }), { now }));
  assert.throws(() => parseJkmReference(fixture({ meta: { ...metadata, value: 32.15, last: 32.15 } }), { now }));
  assert.throws(() => parseJkmReference(fixture({ meta: { ...metadata, last: 31.49 } }), { now }));
});

test('invalid, conflicting, missing, or future observation dates cannot be substituted with update dates', () => {
  for (const date of ['February 30, 2026', 'Notamonth 13, 2026', 'November 31, 2026', 'November 16, 2026']) {
    assert.throws(() => parseJkmReference(fixture({ data: { ...dataset, description: description.replace('November 13, 2026', date) } }), { now }));
  }
  assert.throws(() => parseJkmReference(fixture({ data: { ...dataset, temporalCoverage: '2012-09-27/2026-11-14' } }), { now }));
  assert.throws(() => parseJkmReference(fixture({ data: { ...dataset, temporalCoverage: undefined } }), { now }));
  assert.throws(() => parseJkmReference(fixture(), { now: new Date('invalid') }));
});

test('markup changes or ambiguous data are rejected rather than evaluated or guessed', () => {
  const html = fixture();
  assert.throws(() => parseJkmReference(html.replace('TEChartsMeta = [', 'ChangedMetadata = ['), { now }));
  assert.throws(() => parseJkmReference(html.replace('"@graph"', '"changedGraph"'), { now }));
  assert.throws(() => parseJkmReference(html.replace('"value":31.351', '"value":(31.351)'), { now }));
  assert.throws(() => parseJkmReference(`${html}<script type="application/ld+json">${JSON.stringify(dataset)}</script>`, { now }));
});

test('fetch adapter requests only the public page with a timeout and preserves its observation date', async () => {
  let requests = 0;
  const result = await fetchJkmReference({ now, fetchImpl: async (url, options) => {
    requests += 1;
    assert.equal(url, JKM_REFERENCE_URL);
    assert.equal(options.headers.Accept, 'text/html');
    assert.ok(options.signal instanceof AbortSignal);
    return new Response(fixture(), { headers: { 'content-type': 'text/html; charset=utf-8' } });
  } });
  assert.equal(requests, 1);
  assert.deepEqual(result, { value: 31.35, date: '2026-11-13', sourceUrl: JKM_REFERENCE_URL });
});

test('HTTP failures and a non-HTML response do not produce a replacement price', async () => {
  await assert.rejects(fetchJkmReference({ now, fetchImpl: async () => new Response('denied', { status: 403 }) }), /HTTP 403/);
  await assert.rejects(fetchJkmReference({ now, fetchImpl: async () => new Response('{}', { headers: { 'content-type': 'application/json' } }) }), /response type/);
  await assert.rejects(fetchJkmReference({ now, fetchImpl: async () => { throw new Error('network failed'); } }), /network failed/);
});
