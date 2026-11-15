import assert from 'node:assert/strict';
import { test } from 'node:test';
import { balticReportCandidates, fetchBalticPrices, parseBalticReport, parseBalticRoute, selectBalticReport } from '../scripts/lib/baltic-prices.mjs';

const now = new Date('2026-11-15T12:00:00Z');
const sourceUrl = 'https://www.balticexchange.com/en/data-services/WeeklyRoundup/Gas/News/2026/gas-report-week-46.html';
const report = { date: '2026-11-13', sourceUrl, now };
// Paragraphs captured from Baltic Exchange's public reports, Weeks 46 and 45 of 2026.
const week46 = [
  'The BLNG2 US Gulf–Continent route weakened by $5,200 to settle at $29,900/day. Similarly, the BLNG3 US Gulf–Japan route saw a larger correction, falling $8,200 to close at $56,000/day. Although fixing activity has improved from the quieter levels, extensive tonnage availability and subdued liquidity continue to weigh on Atlantic sentiment.',
  'Similarly, the BLPG3 Houston–Chiba route declined by $11.86 to close at $310.86/tonne, while TCE returns dropped $8,172 to settle at $190,386/day, reflecting the weakening sentiment in the Atlantic market.',
];
const week45 = [
  'Similarly, the BLNG3 US Gulf–Japan route gained $2,200 week-on-week to settle at $64,600/day. The route remained supported by tightening effective availability, although a wider bid-offer spread continued to limit liquidity.',
  'Similarly, the BLPG3 Houston–Chiba route gained $8.29 to close at $322.29 per tonne, while TCE returns increased by $10,491 to $196,055/day. The route strengthened through the week as cargo activity remained healthy and the position list stayed relatively balanced.',
];
const html = (paragraphs = week46, date = report.date) => `<time class="date" datetime="${date}">13 Nov 2026</time><div class="article-body"><div class="par"><div>${paragraphs.map((p) => `<p>${p}</p>`).join('')}</div></div></div><p>BLNG3 closed at $1/day</p>`;
const listing = (date = '2026-11-13', link = sourceUrl) => ({ articles: [{ dateISO: `${date}T00:00:00.000Z`, link }] });

test('Baltic Week46 closing rates exclude changes, other routes and TCE', () => {
  const prices = parseBalticReport(html(), report);
  assert.deepEqual(prices, { BLNG3: { value: 56000, date: report.date, sourceUrl }, BLPG3: { value: 310.86, date: report.date, sourceUrl } });
});

test('Baltic Week45 supports settle at and per-tonne price wording', () => {
  assert.equal(parseBalticRoute(week45, 'BLNG3'), 64600);
  assert.equal(parseBalticRoute(week45, 'BLPG3'), 322.29);
});

test('Baltic parsing rejects missing, ambiguous, nonpositive and wrong-unit rates', () => {
  for (const p of [
    'BLPG3 fell $11.86 this week.',
    'BLPG3 closed at $310.86/day.',
    'BLPG3 closed at $0/tonne.',
    'BLPG3 closed at $300/tonne and settled at $310/tonne.',
    'BLPG3 TCE earnings closed at $190386/day.',
  ]) assert.throws(() => parseBalticRoute([p], 'BLPG3'));
  assert.throws(() => parseBalticRoute([week46[0], week46[0]], 'BLNG3'));
  assert.throws(() => parseBalticRoute(['BLNG3-174 closed at $56,000/day; BLNG3(g) closed at $40,000/day.'], 'BLNG3'));
  assert.throws(() => parseBalticRoute(week46, 'BLPG1'));
});

test('Baltic publication date must match the listing and cannot be in the future', () => {
  assert.throws(() => parseBalticReport(html(week46, '2026-11-12'), report));
  assert.throws(() => parseBalticReport(html(), { ...report, date: '2026-11-16' }));
  assert.throws(() => parseBalticReport(html(), { ...report, date: '2026-02-30' }));
  assert.throws(() => parseBalticReport(html().replace('article-body', 'unrelated'), report));
});

test('Baltic listing selects the latest non-future report and normalises HTTP', () => {
  const payload = listing('2026-11-06', sourceUrl.replace('46.html', '45.html'));
  payload.articles.push(...listing().articles, ...listing('2026-11-20', sourceUrl.replace('46.html', '47.html')).articles);
  payload.articles[1].link = sourceUrl.replace('https:', 'http:');
  assert.deepEqual(selectBalticReport(payload, { now }), { date: report.date, sourceUrl });
});

test('Baltic listing rejects malformed feeds, untrusted links and future-only reports', () => {
  for (const payload of [null, {}, { articles: [] }, { articles: [{}] }, listing('2026-02-30'), listing('2026-11-20'),
    listing('2026-11-13', sourceUrl.replace('www.balticexchange.com', 'evil.example')),
    listing('2026-11-13', sourceUrl.replace('/Gas/', '/Tanker/')),
    listing('2026-11-13', `${sourceUrl}?redirect=evil`), listing('2026-11-13', sourceUrl.replace('/2026/', '/2025/')),
  ]) assert.throws(() => selectBalticReport(payload, { now }));
});

test('Baltic adapter discovers the current report with timeout and fetches it once', async () => {
  const calls = [];
  const fetchImpl = async (url, options) => {
    calls.push({ url, options });
    return calls.length === 1 ? { ok: true, json: async () => listing() } : { ok: true, text: async () => html() };
  };
  const prices = await fetchBalticPrices({ fetchImpl, now });
  assert.equal(prices.BLNG3.value, 56000);
  assert.equal(calls.length, 2);
  assert.equal(calls[1].url, sourceUrl);
  assert.equal(calls[0].options.headers.Accept, 'application/json');
  assert.equal(calls[1].options.headers.Accept, 'text/html');
  assert.ok(calls.every(({ options }) => options.signal instanceof AbortSignal && options.redirect === 'error'));
  await assert.rejects(fetchBalticPrices({ now, fetchImpl: async () => ({ ok: false, status: 503 }) }), /HTTP 503/);
});

test('HTML listing responses fall back to a dated public report, not a guessed observation date', async () => {
  const calls = [];
  const prices = await fetchBalticPrices({ now, fetchImpl: async (url) => {
    calls.push(url);
    if (calls.length === 1) return { ok: true, headers: new Headers({ 'content-type': 'text/html' }) };
    return { ok: true, text: async () => html() };
  } });
  assert.equal(calls.length, 2);
  assert.equal(calls[1], sourceUrl);
  assert.equal(prices.BLNG3.value, 56000);
  assert.equal(prices.BLPG3.date, '2026-11-13');
});

test('calendar discovery handles the week and calendar year around New Year', () => {
  const candidates = balticReportCandidates(new Date('2027-01-04T22:30:00Z'));
  assert.equal(candidates[0].sourceUrl, sourceUrl.replace('/2026/', '/2027/').replace('46.html', '53.html'));
  assert.equal(candidates[1].sourceUrl, sourceUrl.replace('46.html', '52.html'));
});

test('fallback rejects unrelated publication weeks and future report dates', async () => {
  for (const date of ['2026-11-20', '2026-11-01']) {
    let requests = 0;
    await assert.rejects(fetchBalticPrices({ now, fetchImpl: async () => {
      requests++;
      return requests === 1 ? { ok: true, json: async () => { throw new Error('not JSON'); } }
        : { ok: true, text: async () => html(week46, date) };
    } }), /public reports unavailable/);
    assert.equal(requests, 3);
  }
});
