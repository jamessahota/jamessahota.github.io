// Trading Economics publishes an indicative OTC/CFD market reference here.
// This is not the physical Platts AAOVQ00 assessment or a futures settlement.
export const JKM_REFERENCE_URL = 'https://tradingeconomics.com/commodity/liquefied-natural-gas-japan-korea';

const NAME = 'Liquefied Natural Gas Japan Korea';
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

function fail(message) {
  throw new Error(`JKM reference: ${message}`);
}

function positive(value) {
  return typeof value === 'number' && Number.isFinite(value) && value > 0;
}

function observations(document) {
  if (Array.isArray(document)) return document.flatMap(observations);
  if (!document || typeof document !== 'object') return [];
  return [document, ...observations(document['@graph'])];
}

/** Parses only the public page's matching, dated JKM reference; never evaluates page scripts. */
export function parseJkmReference(html, { now = new Date() } = {}) {
  if (typeof html !== 'string' || html.length > 2_000_000) fail('invalid page body');
  if (!(now instanceof Date) || !Number.isFinite(now.valueOf())) fail('invalid current date');
  const title = html.match(/<title\b[^>]*>([\s\S]*?)<\/title\s*>/i)?.[1]?.trim();
  if (!title || !/^Liquefied Natural Gas Japan Korea\s+-\s+Price\b/.test(title)) fail('unexpected page title');

  const documents = [...html.matchAll(/<script\b(?=[^>]*\btype\s*=\s*["']application\/ld\+json["'])[^>]*>([\s\S]*?)<\/script\s*>/gi)];
  let datasets;
  try {
    datasets = documents.flatMap((match) => observations(JSON.parse(match[1]))).filter((item) => {
      const types = Array.isArray(item['@type']) ? item['@type'] : [item['@type']];
      return types.includes('Dataset') && item.url === JKM_REFERENCE_URL;
    });
  } catch {
    fail('invalid structured dataset');
  }
  if (datasets.length !== 1 || datasets[0].name !== `${NAME} - Price Data`) fail('missing or ambiguous JKM dataset');
  const dataset = datasets[0];
  if (typeof dataset.description !== 'string' || !/contract for difference\s*\(CFD\)/i.test(dataset.description)) fail('reference basis is not identified');

  // The observation date appears in both the priced sentence and temporal coverage.
  // dateModified / TELastUpdate can be later and must never date the observation.
  const quote = dataset.description.match(/^LNG JKM\b.{0,80}?\b(?:to|at)\s+(\d+(?:\.\d+)?)\s+USD\/MMBTU\s+on\s+([A-Za-z]+)\s+(\d{1,2}),\s+(\d{4})(?=[,.])/i);
  if (!quote) fail('missing dated USD/MMBtu quotation');
  const value = Number(quote[1]);
  const month = MONTHS.findIndex((name) => name.toLowerCase() === quote[2].toLowerCase());
  const day = Number(quote[3]);
  const year = Number(quote[4]);
  if (!positive(value) || month < 0 || year < 2012) fail('invalid price or observation date');
  const observed = new Date(Date.UTC(year, month, day));
  if (observed.getUTCFullYear() !== year || observed.getUTCMonth() !== month || observed.getUTCDate() !== day) fail('invalid observation date');
  const date = observed.toISOString().slice(0, 10);
  if (date > now.toISOString().slice(0, 10)) fail('future observation date');
  const coverage = typeof dataset.temporalCoverage === 'string' && dataset.temporalCoverage.match(/^\d{4}-\d{2}-\d{2}\/(\d{4}-\d{2}-\d{2})$/);
  if (!coverage || coverage[1] !== date) fail('observation dates disagree');

  const visible = html.match(/<span\b(?=[^>]*\bid\s*=\s*["']market_last["'])[^>]*>\s*(\d+(?:\.\d+)?)\s*<\/span\s*>/i)?.[1];
  if (!visible || Number(visible) !== value) fail('visible price disagrees with dated quotation');
  const metadata = [...html.matchAll(/\bTEChartsMeta\s*=\s*(\[[\s\S]*?\])\s*;/g)];
  let contract;
  try {
    if (metadata.length !== 1) fail('missing or ambiguous chart metadata');
    const entries = JSON.parse(metadata[0][1]);
    if (!Array.isArray(entries) || entries.length !== 1) fail('unexpected chart entries');
    contract = entries[0];
  } catch {
    fail('invalid chart metadata');
  }
  if (contract.symbol !== 'LNGJKM:COM' || contract.ticker !== 'LNGJKM:COM' || contract.full_name !== NAME || contract.name !== 'LNG JKM' || contract.type !== 'Commodity') fail('unexpected chart instrument');
  const decimals = quote[1].split('.')[1]?.length ?? 0;
  if (!positive(contract.value) || !positive(contract.last) || contract.value !== contract.last || Number(contract.value.toFixed(decimals)) !== value) fail('chart price disagrees with dated quotation');
  return { value, date, sourceUrl: JKM_REFERENCE_URL };
}

/** Fetches the no-key public reference page, with bounded network/body time. */
export async function fetchJkmReference({ fetchImpl = fetch, now = new Date() } = {}) {
  const response = await fetchImpl(JKM_REFERENCE_URL, {
    headers: { Accept: 'text/html', 'User-Agent': 'JamesSahotaResearch/1.0' },
    signal: AbortSignal.timeout(15_000),
  });
  if (!response.ok) fail(`HTTP ${response.status}`);
  if (response.url && response.url !== JKM_REFERENCE_URL) fail('unexpected response URL');
  if (!/\btext\/html\b/i.test(response.headers.get('content-type') ?? '')) fail('unexpected response type');
  return parseJkmReference(await response.text(), { now });
}
