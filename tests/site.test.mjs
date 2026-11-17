// Smoke tests for the built site. They read the finished files in dist/, so
// they check what a visitor would actually receive.
//
//   npm run build && npm test      (or: npm run verify)

import assert from 'node:assert/strict';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const DIST = join(ROOT, 'dist');
const RESEARCH_DIR = join(ROOT, 'src/content/research');

assert.ok(existsSync(DIST), 'dist/ is missing. Run `npm run build` before `npm test`.');

// The public address, read from the one place it is set.
const SITE = readFileSync(join(ROOT, 'astro.config.mjs'), 'utf8').match(/SITE_URL = '([^']+)'/)[1];

test('trading views keep rows compact and plot entry and current reference prices', () => {
  const html = readFileSync(join(DIST, 'research/index.html'), 'utf8');
  const prices = JSON.parse(readFileSync(join(ROOT, 'src/data/latest-prices.json'), 'utf8'));
  const today = new Date().toISOString().slice(0, 10);
  const rows = [...html.matchAll(/<li[^>]*data-view-id="([^"]+)"[^>]*>([\s\S]*?)<\/li>/g)];
  assert.ok(rows.length >= 9);
  for (const [ , id, row] of rows) {
    assert.match(row, /data-entry-price/, `${id} is missing its dated entry`);
    assert.match(row, /class="record__entry"/, `${id} is missing its entry line`);
    if (row.includes('data-current-price')) {
      assert.match(row, /data-chart-kind="(?:benchmark|reference|outcome)"/, `${id} is missing its price point`);
      assert.match(row, /data-price-change/, `${id} is missing its move`);
    }
    const text = row.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
    assert.doesNotMatch(text, /to the verified outcome|to the latest observation|Latest price:|Daily observations; refreshed automatically/);
    const sources = row.match(/<p[^>]*class="[^"]*record__sources[^"]*"[^>]*>([\s\S]*?)<\/p>/)?.[1] ?? '';
    assert.equal([...sources.matchAll(/<a\b/g)].length, 1, `${id} should have one named provider link`);
    assert.doesNotMatch(sources, />Price source</);
  }
  assert.doesNotMatch(html, /Methodology and benchmark notes|data-copy-view|data-view-link/);
  for (const id of ['jkm-q4-2026', 'blpg3-q4-2026']) {
    const row = rows.find((row) => row[1] === id)[2];
    if (today <= '2026-12-31' && !row.includes('>Outcome<')) {
      assert.match(row, /data-price-reference/);
      assert.match(row, /data-chart-kind="reference"/);
    }
  }
  const jkm = rows.find((row) => row[1] === 'jkm-q4-2026')[2];
  assert.match(jkm, /JKM LNG spot/);
  assert.match(jkm, /CFD spot price quote/);
  assert.match(jkm, /25\.71/);
  if (today <= '2026-12-31') {
    assert.match(jkm, /Indicative/);
    const value = prices['jkm-indicative'].value;
    assert.ok(jkm.includes(value.toLocaleString('en-GB', {minimumFractionDigits: Number.isInteger(value) ? 0 : 2, maximumFractionDigits: 3})));
  }
  assert.doesNotMatch(jkm, /JKMX6|JKM6|TOCOM|January 2027|6:05 Markets report reference/);
  const freight = rows.find((row) => row[1] === 'blng3-q4-2026')[2];
  assert.match(freight, /29,400/);
  assert.match(freight, /datetime="2026-09-04"/);
  const lpg = rows.find((row) => row[1] === 'blpg3-q4-2026')[2];
  assert.match(lpg, /283\.33/);
  assert.match(lpg, /datetime="2026-09-04"/);
  if (today <= '2026-12-31') {
    const value = prices['blng3-spot'].value;
    assert.ok(freight.includes(value.toLocaleString('en-GB', {minimumFractionDigits: Number.isInteger(value) ? 0 : 2, maximumFractionDigits: 3})));
    assert.match(freight, /class="record__latest"/);
  }
});

test('all trading-view call dates match the report publication dates', () => {
  const content = readFileSync(join(ROOT, 'src/content/views.yaml'), 'utf8');
  for (const block of content.split(/(?=^- id: )/m).slice(1)) {
    const report = block.match(/^  report: (.+)$/m)[1];
    const formed = block.match(/^  formed: (.+)$/m)[1];
    const publication = readFileSync(join(RESEARCH_DIR, `${report}.md`), 'utf8').match(/^date: (\d{4}-\d{2}-\d{2})$/m)[1];
    assert.equal(formed, publication, `${report} uses a data or prediction-card date instead of publication`);
  }
});

test('view targets remain stable and earlier reference dates are disclosed', () => {
  const html = readFileSync(join(DIST, 'research/index.html'), 'utf8');
  const content = readFileSync(join(ROOT, 'src/content/views.yaml'), 'utf8');
  for (const block of content.split(/(?=^- id: )/m).slice(1)) {
    const id = block.match(/^- id: (.+)$/m)[1];
    const formed = block.match(/^  formed: (.+)$/m)[1];
    const referenceDate = block.match(/^  entry:\n(?:    [^\n]*\n)*?    date: (\d{4}-\d{2}-\d{2})$/m)?.[1];
    const row = html.match(new RegExp(`<li[^>]*id="view-${id}"[^>]*>([\\s\\S]*?)<\\/li>`))?.[1];
    assert.ok(row, `${id} has no shareable target`);
    assert.equal(html.split(` id="view-${id}"`).length - 1, 1, `${id} has duplicate targets`);
    assert.doesNotMatch(row, /data-copy-view|data-view-link/, `${id} still has sharing controls`);
    assert.equal(row.includes('Pre-publication reference'), Boolean(referenceDate && referenceDate < formed), `${id} has an incorrect reference-date disclosure`);
  }
});

const walk = (dir) =>
  readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? walk(path) : [path];
  });

const files = walk(DIST);
// Exact, case-sensitive paths. GitHub Pages is case-sensitive even though macOS is not.
const built = new Set(files.map((file) => '/' + relative(DIST, file).split('\\').join('/')));
const pages = files.filter((file) => file.endsWith('.html'));
const read = (file) => readFileSync(file, 'utf8');
const name = (file) => '/' + relative(DIST, file);

const visibleText = (html) =>
  html
    .replace(/<(script|style)[\s\S]*?<\/\1>/g, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ');

const attributes = (html, attribute) => [...html.matchAll(new RegExp(`\\s${attribute}="([^"]*)"`, 'g'))].map((m) => m[1]);

/** The file in dist/ that an internal address points to. */
const target = (address) => {
  const path = decodeURI(address.replace(SITE, '').split('#')[0].split('?')[0]);
  return path.endsWith('/') ? `${path}index.html` : path;
};

const isInternal = (address) => address.startsWith('/') || address.startsWith(SITE);

// Research entries, read from their front matter.
const research = readdirSync(RESEARCH_DIR)
  .filter((file) => file.endsWith('.md'))
  .map((file) => {
    const source = read(join(RESEARCH_DIR, file));
    const field = (key) => source.match(new RegExp(`^${key}:\\s*["']?(.+?)["']?\\s*$`, 'm'))?.[1];
    const authorBlock = source.match(/^authors:[ \t]*\n((?:[ \t]+-[^\n]*(?:\n|$))+)/m)?.[1] ?? '';
    const editorBlock = source.match(/^editors:[ \t]*\n((?:[ \t]+-[^\n]*(?:\n|$))+)/m)?.[1] ?? '';
    return {
      slug: file.replace(/\.md$/, ''),
      title: field('title'),
      visibility: field('visibility'),
      status: field('publicationStatus'),
      type: field('type'),
      authors: [...authorBlock.matchAll(/^[ \t]+-[ \t]+(.+)$/gm)].map((match) => match[1].replace(/^["']|["']$/g, '')),
      editors: [...editorBlock.matchAll(/^[ \t]+-[ \t]+(.+)$/gm)].map((match) => match[1].replace(/^["']|["']$/g, '')),
    };
  });

test('the main pages are built', () => {
  for (const page of [
    '/index.html',
    '/research/index.html',
    '/experience/index.html',
    '/about/index.html',
    '/cv/index.html',
    '/404.html',
    '/sitemap.xml',
    '/robots.txt',
    '/favicon.svg',
    '/og-default.png',
    '/James-Sahota-CV.pdf',
  ]) {
    assert.ok(built.has(page), `${page} was not built`);
  }
});

test('every public, finished research entry has its own page', () => {
  const expected = research.filter((entry) => entry.visibility === 'public' && entry.status !== 'in-progress');
  assert.ok(expected.length > 0, 'no public research found');
  for (const entry of expected) {
    assert.ok(built.has(`/research/${entry.slug}/index.html`), `no page for ${entry.slug}`);
  }
});

test('private research never reaches the built site', () => {
  const hidden = research.filter((entry) => entry.visibility === 'private');
  assert.ok(hidden.length > 0, 'keep at least one private example entry so this test protects something');

  const textFiles = files.filter((file) => /\.(html|xml|txt|js|json|css)$/.test(file));
  for (const entry of hidden) {
    assert.ok(!built.has(`/research/${entry.slug}/index.html`), `${entry.slug} has a page`);
    for (const file of textFiles) {
      const content = read(file);
      assert.ok(!content.includes(entry.slug), `${name(file)} mentions the private entry ${entry.slug}`);
      assert.ok(!content.includes(entry.title), `${name(file)} contains the title of a private entry`);
    }
  }
});

test('work in progress is listed but has no page of its own', () => {
  for (const entry of research.filter((item) => item.visibility === 'public' && item.status === 'in-progress')) {
    assert.ok(!built.has(`/research/${entry.slug}/index.html`), `${entry.slug} should not have a page yet`);
  }
});

test('research uses reports, commentary and company notes, with work in progress separate', () => {
  const labels = { report: 'Report', commentary: 'Commentary', 'company-note': 'Company note' };
  const shown = research.filter((item) => item.visibility === 'public');
  for (const entry of shown) {
    assert.ok(entry.type in labels, `${entry.slug} has an unsupported research type: ${entry.type}`);
  }
  // Only the labels the published work uses, so publishing the last piece in progress, or a
  // summary that happens to say "brief", never blocks a deploy.
  const index = visibleText(read(join(DIST, 'research/index.html')));
  for (const type of new Set(shown.map((item) => item.type))) {
    assert.ok(index.includes(labels[type]), `the research page is missing ${labels[type]}`);
  }
  if (shown.some((item) => item.status === 'in-progress')) {
    assert.ok(index.includes('In progress'), 'the research page is missing In progress');
  }
});

test('co-authors are credited on detail pages and omitted from selected research', () => {
  const self = read(join(ROOT, 'src/content/profile.yaml')).match(/^name:\s*(.+)$/m)[1];
  for (const entry of research.filter((item) => item.visibility === 'public' && item.status !== 'in-progress')) {
    assert.ok(entry.authors.length > 0, `no authors found for ${entry.slug}`);
    const html = read(join(DIST, `research/${entry.slug}/index.html`));
    const credits = html.match(/<div[^>]*data-research-credits[^>]*>([\s\S]*?)<\/div>/)?.[1];
    const others = entry.authors.filter((author) => author !== self);
    if (others.length) {
      assert.ok(credits, `${entry.slug} has no visible co-author credit`);
      for (const author of others) assert.ok(visibleText(credits).includes(author), `${entry.slug} omits ${author}`);
    } else {
      assert.ok(!credits, `${entry.slug} should not have a co-author credit`);
    }
    if (entry.editors.length) {
      const editorCredit = html.match(/<[^>]*data-research-editors[^>]*>([\s\S]*?)<\/(?:span|p)>/)?.[1];
      assert.ok(editorCredit, `${entry.slug} has no editor credit`);
      const structured = JSON.parse(html.match(/<script[^>]*type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/)[1]).mainEntity;
      assert.deepEqual(structured.author.map((person) => person.name), entry.authors);
      assert.deepEqual(structured.editor.map((person) => person.name), entry.editors);
      for (const editor of entry.editors) assert.ok(visibleText(editorCredit).includes(editor), `${entry.slug} omits its editor`);
    }
  }
  const home = visibleText(read(join(DIST, 'index.html')));
  assert.doesNotMatch(home, /Co-authored with|Co-authors:|Sole author|Edited by/i, 'author credits appear on the homepage');
});

test('every former orbit illustration is replaced by a sourced report-specific exhibit', () => {
  const affected = [
    'chevron-venezuela-asset-swap', 'cuba-energy-collapse', 'european-wind-energy-security',
    'hormuz-reopening-mispriced-risk', 'hormuz-under-fire-uae', 'phillips-66-q1-losses',
    'russian-oil-pricing-power', 'totalenergies-cash-returns', 'uae-leaves-opec',
    'uk-energy-security-critique', 'us-crude-inventories',
  ];
  for (const slug of affected) {
    const html = read(join(DIST, `research/${slug}/index.html`));
    assert.match(html, /data-report-exhibit="(?:bars|sequence|ranges)"/, `${slug} has no explanatory exhibit`);
    assert.match(html, /class="exhibit__note/, `${slug} has no period or interpretation note`);
    assert.match(html, /<figcaption[^>]*>[\s\S]*?<a href="https:\/\/605-markets\.com\/report\//, `${slug} has no linked report source`);
    assert.doesNotMatch(html, /rvisual__network|rvisual__orbit/, `${slug} still contains the generic orbit`);
  }
  assert.match(read(join(DIST, 'research/oil-above-100-supply-shock/index.html')), /rvisual__curve-line/, 'the actual futures curve was lost');
  const stocks = read(join(DIST, 'research/us-crude-inventories/index.html'));
  assert.match(stocks, /exhibit__bar--negative/, 'the inventory draw is not drawn as a negative change');
});

test('header charts retain their explanatory captions alongside their sources', () => {
  const expected = [
    {
      slug: 'diesel-distillate-bottleneck',
      caption: 'New York Harbor ultra-low sulphur diesel less Brent, on a common volume basis, using monthly average spot prices.',
      source: 'EIA spot prices; 6:05 Markets calculations, as published in the report.',
    },
    {
      slug: 'oil-above-100-supply-shock',
      caption: 'Contract prices on 9 September 2026, the day before Brent’s intraday move to US$105.26.',
      source: 'ICE Brent futures, 9 September 2026 snapshot, as cited in the report.',
    },
  ];
  for (const { slug, caption, source } of expected) {
    const html = read(join(DIST, `research/${slug}/index.html`));
    const header = html.match(/<figure\b[^>]*class="[^"]*\brvisual\b[^"]*"[^>]*>[\s\S]*?<\/figure>/)?.[0];
    assert.ok(header, `${slug} is missing its header figure`);
    const figcaption = header.match(/<figcaption\b[^>]*>([\s\S]*?)<\/figcaption>/)?.[1];
    assert.ok(figcaption, `${slug} is missing its figure caption`);
    assert.ok(visibleText(figcaption).includes(caption), `${slug} lost its chart's comparison or date context`);
    assert.ok(visibleText(figcaption).includes(source), `${slug} lost its chart source`);
    assert.equal(visibleText(html).split(caption).length - 1, 1, `${slug} repeats the caption outside its header`);
  }
});

test('the Phillips 66 retrospective keeps publication and review dates distinct and checks its price comparisons', () => {
  const html = read(join(DIST, 'research/phillips-66-q1-losses/index.html'));
  const structured = JSON.parse(html.match(/<script[^>]*type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/)[1]);
  assert.equal(structured.mainEntity.datePublished, '2026-04-09');
  assert.match(html, /<time datetime="2026-11-13"/);
  const review = html.match(/<div[^>]*class="[^"]*summary--review[^"]*"[^>]*>([\s\S]*?)<\/div>/)?.[1];
  assert.ok(review, 'the retrospective is missing its distinct body');
  const tableBody = review.match(/<tbody>([\s\S]*?)<\/tbody>/)?.[1];
  assert.ok(tableBody, 'the retrospective has no price-reference table');
  const rows = [...tableBody.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/g)].map((row) =>
    [...row[1].matchAll(/<td[^>]*>([\s\S]*?)<\/td>/g)].map((cell) => visibleText(cell[1]).trim()),
  );
  assert.equal(rows.length, 3);
  const reference = Number(rows[0][1]);
  assert.equal(reference, 161.07, 'the reference must be the verified publication-day close');
  for (const row of rows.slice(1)) {
    const expected = `+${((Number(row[1]) / reference - 1) * 100).toFixed(1)}%`;
    assert.equal(row[2], expected, `${row[0]} has an inconsistent price change`);
  }
  assert.match(visibleText(review), /publication-day close, excluding dividends/);
  assert.doesNotMatch(read(join(ROOT, 'src/content/views.yaml')), /report: phillips-66-q1-losses/,
    'a retrospective price comparison must not become an original scored forecast');
});

test('the flagship case appears on the homepage only and uses the approved reference prices', () => {
  const caseHtml = read(join(DIST, 'research/phillips-66-q1-losses/index.html'));
  const body = caseHtml.match(/<div[^>]*class="[^"]*summary--review[^"]*"[^>]*>([\s\S]*?)<\/div>/)[1];
  const rows = [...body.match(/<tbody>([\s\S]*?)<\/tbody>/)[1].matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/g)]
    .map((row) => [...row[1].matchAll(/<td[^>]*>([\s\S]*?)<\/td>/g)].map((cell) => visibleText(cell[1]).trim()));
  const reference = Number(rows[0][1]);
  const latest = Number(rows.at(-1)[1]);
  const expectedChange = `+${((latest / reference - 1) * 100).toFixed(1)}%`;
  const href = '/research/phillips-66-q1-losses/#summary-heading';
  for (const file of ['index.html']) {
    const html = read(join(DIST, file));
    const features = [...html.matchAll(/<article\b[^>]*data-flagship-case="phillips-66-q1-losses"[^>]*>[\s\S]*?<\/article>/g)];
    assert.equal(features.length, 1, `${file} must show one flagship feature`);
    const feature = features[0][0];
    assert.equal(Number(feature.match(/data-reference-close="([^"]+)"/)[1]), reference);
    assert.equal(Number(feature.match(/data-review-close="([^"]+)"/)[1]), latest);
    assert.equal(visibleText(feature.match(/<[^>]*data-flagship-change[^>]*>([^<]+)<\/[^>]+>/)[1]).trim(), expectedChange);
    assert.ok(feature.includes(`href="${href}"`), `${file} must open the case study directly`);
    assert.match(visibleText(feature), /Price change/);
    assert.match(visibleText(feature), /Excluding dividends/);
    const archive = html.indexOf('data-carousel');
    assert.ok(features[0].index < archive, `${file} hides the flagship below its archive`);
  }
  const home = read(join(DIST, 'index.html'));
  const hero = home.match(/<div[^>]*class="hero__actions"[^>]*>([\s\S]*?)<\/div>\s*<\/div>/)?.[1];
  assert.ok(hero?.includes('href="/research/"'), 'the opening needs a clear route to the research archive');
  assert.match(visibleText(hero), /Explore research/i);
  assert.ok(!hero.includes(`href="${href}"`), 'the opening should introduce the research before a specific case study');
  const archive = read(join(DIST, 'research/index.html'));
  assert.doesNotMatch(archive, /data-flagship-case=/, 'the research archive must not repeat the homepage feature');
  assert.match(archive, /data-item[^>]*data-vt-key="phillips-66-q1-losses"/, 'the case must remain a normal research entry');
});

test('every internal link, image, stylesheet and document exists', () => {
  for (const page of pages) {
    const html = read(page);
    // href and src cover links, images and scripts; data covers an embedded document such as the CV.
    for (const address of ['href', 'src', 'data'].flatMap((name) => attributes(html, name)).filter(isInternal)) {
      assert.ok(built.has(target(address)), `${name(page)} links to ${address}, which does not exist`);
    }
  }
});

test('links to a section of a page point at a section that exists', () => {
  const hasId = (html, id) => html.includes(` id="${id}"`);
  for (const page of pages) {
    const html = read(page);
    for (const href of attributes(html, 'href').filter((value) => value.includes('#'))) {
      const [address, id] = href.split('#');
      if (!id || (address && !isInternal(address))) continue;
      const destination = address ? read(join(DIST, target(address))) : html;
      assert.ok(hasId(destination, id), `${name(page)} links to #${id}, which does not exist`);
    }
  }
});

test('there are no dead links or placeholder text', () => {
  for (const page of pages) {
    const html = read(page);
    for (const href of attributes(html, 'href')) {
      assert.ok(href !== '' && href !== '#' && !href.startsWith('javascript:'), `${name(page)} has a dead link`);
      if (!isInternal(href) && !href.startsWith('#')) {
        assert.match(href, /^(https:\/\/|mailto:)/, `${name(page)} has an unexpected link: ${href}`);
      }
    }
    const text = visibleText(html);
    for (const placeholder of [/lorem ipsum/i, /\bTODO\b/, /\bTBC\b/, /\bTBD\b/, /\[[A-Z][^\]]{2,40}\]/, /coming soon/i]) {
      assert.doesNotMatch(text, placeholder, `${name(page)} contains placeholder text`);
    }
  }
});

test('every page has the basics: language, one h1, title, description, canonical', () => {
  const titles = new Map();
  for (const page of pages) {
    const html = read(page);
    assert.match(html, /<html lang="en-GB"/, `${name(page)} is missing lang="en-GB"`);
    assert.equal((html.match(/<h1[\s>]/g) ?? []).length, 1, `${name(page)} should have exactly one h1`);

    const title = html.match(/<title>([^<]+)<\/title>/)?.[1];
    assert.ok(title, `${name(page)} has no title`);
    assert.ok(!titles.has(title), `${name(page)} and ${titles.get(title)} share the title "${title}"`);
    titles.set(title, name(page));

    const description = html.match(/<meta name="description" content="([^"]+)"/)?.[1];
    assert.ok(description && description.length >= 40, `${name(page)} needs a fuller description`);

    assert.doesNotMatch(html, /localhost|127\.0\.0\.1/, `${name(page)} refers to a local address`);
    if (!page.endsWith('404.html')) {
      const canonical = html.match(/<link rel="canonical" href="([^"]+)"/)?.[1];
      assert.ok(canonical?.startsWith(SITE), `${name(page)} has no canonical address on ${SITE}`);
    }
  }
});

test('images have alternative text and declared dimensions', () => {
  for (const page of pages) {
    for (const [tag] of read(page).matchAll(/<img\b[^>]*>/g)) {
      assert.match(tag, /\salt="/, `${name(page)} has an image without alt text`);
      assert.match(tag, /\swidth="\d+"/, `${name(page)} has an image without a width`);
      assert.match(tag, /\sheight="\d+"/, `${name(page)} has an image without a height`);
    }
  }
});

test('the sitemap lists exactly the public pages', () => {
  const listed = [...read(join(DIST, 'sitemap.xml')).matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
  assert.ok(listed.length > 0, 'the sitemap is empty');
  for (const address of listed) {
    assert.ok(address.startsWith(SITE), `${address} is not on ${SITE}`);
    assert.ok(built.has(target(address)), `the sitemap lists ${address}, which does not exist`);
  }
  const expected = pages.map(name).filter((page) => page !== '/404.html').sort();
  assert.deepEqual(listed.map(target).sort(), expected);
});
