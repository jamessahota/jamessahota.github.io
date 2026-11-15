// Provider parsing and last-good observations. No network or file IO on import.
export const isoDay = (now) => new Date(now).toISOString().slice(0, 10);
const nyDay = (time) => new Date(time).toLocaleDateString('en-CA', { timeZone: 'America/New_York' });

export function validateObservation(observation, now = new Date()) {
  const { value, date } = observation ?? {};
  if (!Number.isFinite(value) || value <= 0) throw new Error('price must be a finite positive number');
  if (typeof date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(date) ||
      !Number.isFinite(Date.parse(date)) || new Date(date).toISOString().slice(0, 10) !== date) {
    throw new Error('invalid observation date');
  }
  if (date > isoDay(now)) throw new Error('future observation date');
  return observation;
}

export function parseFred(csv, series, now = new Date()) {
  const [header, ...rows] = csv.trim().replaceAll('\r', '').split('\n');
  if (!['DATE', 'observation_date'].some((name) => header === `${name},${series}`)) {
    throw new Error('FRED series does not match the configured benchmark');
  }
  for (const row of rows.reverse()) {
    const [date, raw] = row.split(',');
    if (!raw || raw === '.') continue;
    return validateObservation({ value: Number(raw), date }, now);
  }
  throw new Error('no FRED observation');
}

export function parseYahoo(payload, ticker, now = new Date()) {
  const result = payload.chart?.result?.[0];
  if (result?.meta?.symbol !== ticker) throw new Error('Yahoo symbol does not match the configured benchmark');
  const closes = result.indicators?.quote?.[0]?.close ?? [];
  const today = nyDay(now);
  const session = result.meta.currentTradingPeriod?.regular;
  for (let index = closes.length - 1; index >= 0; index -= 1) {
    if (closes[index] === null || closes[index] === undefined) continue;
    const stamp = result.timestamp?.[index];
    if (!Number.isFinite(stamp)) throw new Error('missing daily bar timestamp');
    const date = nyDay(stamp * 1000);
    // Today's daily bar needs an explicitly elapsed session end before it is a close.
    if (date === today && !(Number.isFinite(session?.end) && nyDay(session.end * 1000) === today &&
        session.end * 1000 <= +new Date(now))) continue;
    return validateObservation({ value: Math.round(closes[index] * 1000) / 1000, date }, now);
  }
  throw new Error('no completed daily close');
}

export async function fetchResponse(url, fetchImpl = fetch) {
  const response = await fetchImpl(url, {
    headers: { 'User-Agent': 'Mozilla/5.0 (public research price refresh)' },
    signal: AbortSignal.timeout(15_000),
  });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return response;
}

const identity = (entry) => JSON.stringify({ label: entry.label, unit: entry.unit, fetch: entry.fetch });
const fields = (entry) => Object.fromEntries(
  ['value', 'date', 'sourceUrl', 'checkedAt'].filter((key) => entry[key] !== undefined).map((key) => [key, entry[key]]),
);

export function mergeCachedPrices(config, cache, now = new Date()) {
  const prices = structuredClone(config);
  if (cache?.version !== 1) return prices;
  for (const [key, entry] of Object.entries(prices)) {
    const cached = cache.entries?.[key];
    if (!entry.fetch || cached?.identity !== identity(entry)) continue;
    try {
      validateObservation(cached, now);
      if (entry.date && cached.date < entry.date) continue;
      if (cached.date === entry.date) {
        const checked = Date.parse(cached.checkedAt);
        const configuredCheck = Date.parse(entry.checkedAt) || 0;
        if (!Number.isFinite(checked) || checked > +new Date(now) || checked <= configuredCheck) continue;
      }
      if (cached.sourceUrl) {
        const source = new URL(cached.sourceUrl);
        const expected = new URL(entry.sourceUrl);
        if (source.protocol !== 'https:' || source.hostname !== expected.hostname) continue;
      }
      Object.assign(entry, fields(cached));
    } catch { /* Corrupt or incompatible cache entries cannot replace a committed fallback. */ }
  }
  return prices;
}

export function priceCache(prices) {
  return {
    version: 1,
    entries: Object.fromEntries(Object.entries(prices)
      .filter(([, entry]) => entry.fetch && Number.isFinite(entry.value) && entry.date)
      .map(([key, entry]) => [key, { identity: identity(entry), ...fields(entry) }])),
  };
}

export async function refreshPrices(config, { now = new Date(), fetchImpl = fetch, balticLoader, jkmLoader, log = () => {} } = {}) {
  const prices = structuredClone(config);
  let failures = 0;
  let baltic;
  await Promise.all(Object.entries(prices).map(async ([key, entry]) => {
    if (!entry.fetch) return;
    entry.lastAttemptAt = new Date(now).toISOString();
    try {
      let latest;
      switch (entry.fetch.provider) {
        case 'yahoo': {
          const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(entry.fetch.ticker)}?range=10d&interval=1d`;
          latest = parseYahoo(await (await fetchResponse(url, fetchImpl)).json(), entry.fetch.ticker, now);
          break;
        }
        case 'fred': {
          const url = `https://fred.stlouisfed.org/graph/fredgraph.csv?id=${encodeURIComponent(entry.fetch.series)}`;
          latest = parseFred(await (await fetchResponse(url, fetchImpl)).text(), entry.fetch.series, now);
          break;
        }
        case 'baltic':
          if (!balticLoader) throw new Error('Baltic source adapter unavailable');
          baltic ??= Promise.resolve().then(() => balticLoader({ fetchImpl, now }));
          latest = (await baltic)[entry.fetch.route];
          break;
        case 'tradingeconomics':
          if (!jkmLoader) throw new Error('JKM indicative source adapter unavailable');
          latest = await jkmLoader({ fetchImpl, now });
          break;
        default: throw new Error(`unsupported provider: ${entry.fetch.provider}`);
      }
      validateObservation(latest, now);
      if (entry.date && latest.date < entry.date) throw new Error('source returned an older observation');
      Object.assign(entry, latest, { checkedAt: new Date(now).toISOString(), refreshStatus: 'ok' });
      log(`${key}: ${entry.value} on ${entry.date}`);
    } catch (error) {
      failures += 1;
      entry.refreshStatus = 'failed';
      log(`${key}: refresh unavailable (${error.message}); retained ${entry.value ?? 'no price'} from ${entry.date ?? 'never'}`);
    }
  }));
  return { prices, failures };
}
