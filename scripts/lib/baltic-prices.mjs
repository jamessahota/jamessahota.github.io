// Public weekly Baltic gas reports. These are published spot assessments, not a live feed.
const ORIGIN = 'https://www.balticexchange.com';
const LISTING = new URL('/bin/public/balticexchange/consumer/articlefilterlist.json', ORIGIN);
LISTING.search = new URLSearchParams({
  resource: '/content/balticexchange/consumer/en/data-services/WeeklyRoundup/jcr:content/main-par/tabbedcontent2/par/tabbedcontentitem_4/par/articlefilterpane_co',
  start: '0', selectedYear: '0', loadedCount: '0',
}).toString();

function validDate(date) {
  return /^\d{4}-\d{2}-\d{2}$/.test(date) && Number.isFinite(Date.parse(date))
    && new Date(`${date}T00:00:00Z`).toISOString().slice(0, 10) === date;
}

function reportUrl(link) {
  const url = new URL(link);
  const match = url.pathname.match(/^\/en\/data-services\/WeeklyRoundup\/Gas\/News\/(\d{4})\/gas-report-week-(\d{1,2})\.html$/);
  if (!['http:', 'https:'].includes(url.protocol) || url.hostname !== 'www.balticexchange.com'
    || url.username || url.password || url.port || url.search || url.hash || !match
    || Number(match[2]) < 1 || Number(match[2]) > 53) throw new Error('untrusted Baltic report URL');
  url.protocol = 'https:';
  return url;
}

/** Select the latest published report; ignore scheduled future reports. */
export function selectBalticReport(payload, { now = new Date() } = {}) {
  if (!Array.isArray(payload?.articles) || !payload.articles.length) throw new Error('missing Baltic report listing');
  const today = now.toISOString().slice(0, 10);
  const reports = payload.articles.map((article) => {
    if (typeof article?.dateISO !== 'string' || typeof article?.link !== 'string') throw new Error('malformed Baltic report listing');
    const date = article.dateISO.slice(0, 10);
    if (!validDate(date) || !Number.isFinite(Date.parse(article.dateISO))) throw new Error('invalid Baltic listing date');
    const url = reportUrl(article.link);
    if (!url.pathname.includes(`/News/${date.slice(0, 4)}/`)) throw new Error('Baltic report year does not match date');
    return { date, sourceUrl: url.href };
  }).filter((report) => report.date <= today).sort((a, b) => b.date.localeCompare(a.date));
  if (!reports.length) throw new Error('no published Baltic report');
  return reports[0];
}

function text(html) {
  const entities = { nbsp: ' ', amp: '&', ndash: '–', mdash: '—', quot: '"', apos: "'", dollar: '$' };
  return html.replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1>/gi, '')
    .replace(/<[^>]*>/g, ' ')
    .replace(/&(#x[\da-f]+|#\d+|\w+);/gi, (entity, code) => {
      if (code[0] === '#') {
        const number = code[1].toLowerCase() === 'x' ? parseInt(code.slice(2), 16) : Number(code.slice(1));
        return number > 0 && number <= 0x10ffff ? String.fromCodePoint(number) : entity;
      }
      return entities[code.toLowerCase()] ?? entity;
    }).replace(/\s+/g, ' ').trim();
}

function articleBody(html) {
  const opening = /<div\b[^>]*\bclass\s*=\s*["'][^"']*\barticle-body\b[^"']*["'][^>]*>/i.exec(html);
  if (!opening) throw new Error('missing Baltic article body');
  const start = opening.index + opening[0].length;
  const tags = /<\/?div\b[^>]*>/gi;
  tags.lastIndex = start;
  let depth = 1;
  for (let tag; (tag = tags.exec(html));) {
    depth += /^<\/div/i.test(tag[0]) ? -1 : 1;
    if (!depth) return html.slice(start, tag.index);
  }
  throw new Error('incomplete Baltic article body');
}

/** Read a terminal route price, excluding weekly changes and TCE earnings. */
export function parseBalticRoute(paragraphs, route) {
  if (!['BLNG3', 'BLPG3'].includes(route)) throw new Error('unsupported Baltic route');
  const routePattern = new RegExp(`\\b${route}(?:-174)?\\b`, 'g');
  const matching = paragraphs.filter((paragraph) => new RegExp(`\\b${route}(?:-174)?\\b`).test(paragraph));
  if (matching.length !== 1 || [...matching[0].matchAll(routePattern)].length !== 1) throw new Error(`missing or ambiguous ${route} assessment`);
  let segment = matching[0].slice(matching[0].search(new RegExp(`\\b${route}\\b`)) + route.length);
  segment = segment.split(/\bBL(?:NG|PG)\d(?:-\d+)?\b/)[0].split(/\b(?:TCE|time[ -]charter equivalent)\b/i)[0];
  const prices = [...segment.matchAll(/\b(?:close(?:d)?|settl(?:e|ed))\s+at\s+(?:US\s*)?\$\s*(\d[\d,]*(?:\.\d+)?)\s*(\/\s*\w+|per\s+(?:metric\s+)?\w+)/gi)];
  if (prices.length !== 1) throw new Error(`missing or ambiguous ${route} closing rate`);
  const unit = prices[0][2].replace(/\s+/g, ' ').toLowerCase();
  const expected = route === 'BLNG3' ? /^(?:\/\s*day|per day)$/ : /^(?:\/\s*tonne|per (?:metric )?tonne)$/;
  const value = Number(prices[0][1].replaceAll(',', ''));
  if (!expected.test(unit) || !Number.isFinite(value) || value <= 0) throw new Error(`invalid ${route} rate or unit`);
  return value;
}

export function parseBalticReport(html, { date, sourceUrl, now = new Date() }) {
  const url = reportUrl(sourceUrl);
  if (!validDate(date) || date > now.toISOString().slice(0, 10)) throw new Error('invalid or future Baltic report date');
  const dates = [...html.matchAll(/<time\b[^>]*\bdatetime\s*=\s*["']([^"']+)["'][^>]*>/gi)].map((match) => match[1]);
  if (!dates.length || dates.some((published) => published !== date)) throw new Error('Baltic publication date does not match listing');
  const body = articleBody(html);
  const paragraphs = [...body.matchAll(/<p\b[^>]*>([\s\S]*?)<\/p>/gi)].map((match) => text(match[1]));
  return Object.fromEntries(['BLNG3', 'BLPG3'].map((route) => [route, {
    value: parseBalticRoute(paragraphs, route), date, sourceUrl: url.href,
  }]));
}

function isoWeek(date) {
  const thursday = new Date(`${date}T00:00:00Z`);
  thursday.setUTCDate(thursday.getUTCDate() + 4 - (thursday.getUTCDay() || 7));
  return Math.ceil(((thursday - Date.UTC(thursday.getUTCFullYear(), 0, 1)) / 86_400_000 + 1) / 7);
}

/** A bounded alternative to Baltic's dynamic listing, using its published weekly URL pattern. */
export function balticReportCandidates(now = new Date()) {
  const friday = new Date(`${now.toISOString().slice(0, 10)}T00:00:00Z`);
  friday.setUTCDate(friday.getUTCDate() - ((friday.getUTCDay() + 2) % 7));
  return [0, 7].map((daysAgo) => {
    const date = new Date(friday);
    date.setUTCDate(date.getUTCDate() - daysAgo);
    const week = isoWeek(date.toISOString().slice(0, 10));
    return { week, year: date.getUTCFullYear(), sourceUrl: `${ORIGIN}/en/data-services/WeeklyRoundup/Gas/News/${date.getUTCFullYear()}/gas-report-week-${week}.html` };
  });
}

export async function fetchBalticPrices({ fetchImpl = globalThis.fetch, now = new Date() } = {}) {
  const request = async (url) => {
    const response = await fetchImpl(url, {
      signal: AbortSignal.timeout(15_000), redirect: 'error',
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; public research price refresh)',
        'Accept': url === LISTING.href ? 'application/json' : 'text/html',
        'Referer': `${ORIGIN}/en/data-services/WeeklyRoundup.html`,
        ...(url === LISTING.href ? { 'X-Requested-With': 'XMLHttpRequest' } : {}),
      },
    });
    if (!response.ok) throw new Error(`Baltic HTTP ${response.status}`);
    return response;
  };
  let listingError;
  try {
    const response = await request(LISTING.href);
    if (response.headers?.get('content-type')?.includes('text/html')) throw new Error('listing returned HTML');
    const listing = await response.json();
    const report = selectBalticReport(listing, { now });
    const html = await (await request(report.sourceUrl)).text();
    return parseBalticReport(html, { ...report, now });
  } catch (error) { listingError = error; }

  // Some hosting networks receive HTML instead of the listing JSON. The actual public
  // articles remain independently usable; the calendar is only discovery, never a quote date.
  let articleError;
  for (const candidate of balticReportCandidates(now)) {
    try {
      const html = await (await request(candidate.sourceUrl)).text();
      const date = html.match(/<time\b[^>]*\bdatetime\s*=\s*["']([^"']+)["']/i)?.[1];
      if (!validDate(date ?? '') || date.slice(0, 4) !== String(candidate.year) || isoWeek(date) !== candidate.week) {
        throw new Error('article date does not match its report week');
      }
      return parseBalticReport(html, { date, sourceUrl: candidate.sourceUrl, now });
    } catch (error) { articleError = error; }
  }
  throw new Error(`Baltic listing unavailable (${listingError.message}); public reports unavailable (${articleError.message})`);
}
