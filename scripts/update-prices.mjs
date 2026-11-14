// Refreshes the latest prices shown beside open views on the research page.
//
//   npm run prices
//
// Reads src/data/latest-prices.json, fetches the newest closing price for every entry that has
// a `fetch` source, and writes the file back. Nothing else is changed. An entry without `fetch`
// (for a price with no free source) is left exactly as typed. If a source cannot be reached,
// the entry keeps its previous price and the script says so. Commit the file afterwards.

import { readFile, writeFile } from 'node:fs/promises';

const file = new URL('../src/data/latest-prices.json', import.meta.url);
const prices = JSON.parse(await readFile(file, 'utf8'));

/** The newest daily close from Yahoo Finance's chart data: { value, date }. */
async function yahoo(ticker) {
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(ticker)}?range=10d&interval=1d`;
  const response = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  const result = (await response.json()).chart?.result?.[0];
  const closes = result?.indicators?.quote?.[0]?.close ?? [];
  for (let index = closes.length - 1; index >= 0; index -= 1) {
    if (typeof closes[index] !== 'number') continue;
    // Daily bars are stamped at the start of the trading day in New York.
    const date = new Date(result.timestamp[index] * 1000).toLocaleDateString('en-CA', { timeZone: 'America/New_York' });
    return { value: Math.round(closes[index] * 1000) / 1000, date };
  }
  throw new Error('no closing price in the response');
}

/** The newest observation of a FRED series: { value, date }. */
async function fred(series) {
  const response = await fetch(`https://fred.stlouisfed.org/graph/fredgraph.csv?id=${encodeURIComponent(series)}`);
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  const rows = (await response.text()).trim().split('\n').slice(1);
  for (let index = rows.length - 1; index >= 0; index -= 1) {
    const [date, value] = rows[index].split(',');
    if (value && value !== '.' && Number.isFinite(Number(value))) return { value: Number(value), date };
  }
  throw new Error('no observation in the response');
}

let failures = 0;
for (const [key, entry] of Object.entries(prices)) {
  if (!entry.fetch) {
    console.log(`${key}: typed by hand, left as it is`);
    continue;
  }
  try {
    const latest = entry.fetch.provider === 'yahoo' ? await yahoo(entry.fetch.ticker) : await fred(entry.fetch.series);
    const changed = latest.value !== entry.value || latest.date !== entry.date;
    Object.assign(entry, latest);
    console.log(`${key}: ${latest.value} on ${latest.date}${changed ? '' : ' (unchanged)'}`);
  } catch (error) {
    failures += 1;
    console.warn(`${key}: could not be updated (${error.message}); kept ${entry.value ?? 'no price'} from ${entry.date ?? 'never'}`);
  }
}

await writeFile(file, `${JSON.stringify(prices, null, 2)}\n`);
if (failures) process.exitCode = 1;
