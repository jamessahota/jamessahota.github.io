import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { firstResultIndices, paperStatus } from '../src/lib/reverse-carry.ts';

const root = new URL('../dist/', import.meta.url);
const path = 'projects/ai-commodities-research/reverse-carry/';
const asset = 'data/reverse-carry/track-record.json';
const read = (file) => readFileSync(new URL(file, root), 'utf8');
const record = JSON.parse(read(asset));
const page = read(path + 'index.html');
const books = ['with_wti', 'without_wti'];

const visible = (html) => html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');

test('the opening archive distinguishes a signal and opening equity from measured performance', () => {
  const archive = page.match(/<details\b[^>]*id="session-2026-11-27"[^>]*>([\s\S]*?)<\/details>/)?.[1];
  assert.ok(archive, 'Missing 27 November 2026 archive entry');
  assert.match(visible(archive), /Signal recorded, awaiting first fill\./i);
  const rows = [...archive.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/g)].map(m => visible(m[1]));
  for (const name of ['With WTI', 'Without WTI']) {
    const row = rows.find(text => text.includes(name));
    assert.ok(row, 'Missing opening ledger row for ' + name);
    assert.match(row, /\$1,000,000\.00/);
    assert.match(row, /pending/i);
    assert.doesNotMatch(row, /\$0\.00|\b0\.00%/);
  }
  if (record.as_of_session === record.inception_session) {
    for (const book of books) {
      const card = page.match(new RegExp('aria-labelledby="name-' + book + '"[^>]*>([\\s\\S]*?)</section>'))?.[1];
      assert.ok(card, 'Missing portfolio summary for ' + book);
      const text = visible(card);
      assert.match(text, /Signal recorded, awaiting first fill\./i);
      assert.match(text, /\$1,000,000\.00/);
      assert.match(text, /pending/i);
      assert.doesNotMatch(text, /\$0\.00|\b0\.00%/);
    }
  }
});

test('each portfolio earns its first result only after holding exposure across a settlement', () => {
  const launch = structuredClone(record.sessions[0]);
  const monday = structuredClone(launch);
  const tuesday = structuredClone(launch);
  const wednesday = structuredClone(launch);
  monday.session = '2026-11-30';
  tuesday.session = '2026-12-01';
  wednesday.session = '2026-12-02';
  for (const session of [monday, tuesday, wednesday]) {
    for (const book of books) session.books[book].entry_status = 'settled_instructions';
  }
  const fill = (account, before, after) => {
    account.positions = after === 0 ? {} : { NGF27: String(after) };
    account.trades = [{ ticker: 'NGF27', before: String(before), after: String(after), signed_quantity: String(after - before) }];
  };
  fill(monday.books.with_wti, 0, -1);
  fill(tuesday.books.with_wti, -1, 0);
  fill(tuesday.books.without_wti, 0, -1);
  fill(wednesday.books.without_wti, -1, 0);
  for (const book of books) {
    assert.equal(paperStatus(launch, book, false), 'Signal recorded, awaiting first fill.');
  }
  assert.deepEqual(firstResultIndices([launch, monday]), { with_wti: Infinity, without_wti: Infinity });
  assert.equal(paperStatus(monday, 'with_wti', false), 'First fill recorded, awaiting first result.');
  assert.deepEqual(firstResultIndices([launch, monday, tuesday]), { with_wti: 2, without_wti: Infinity });
  assert.equal(tuesday.books.with_wti.daily_pnl_usd, '0');
  assert.equal(paperStatus(tuesday, 'with_wti', true), null);
  assert.equal(paperStatus(tuesday, 'without_wti', false), 'First fill recorded, awaiting first result.');
  assert.deepEqual(firstResultIndices([launch, monday, tuesday, wednesday]), { with_wti: 2, without_wti: 3 });
});

test('the project, sitemap, public download and rendered tracker use the same record', () => {
  const latest = record.sessions.at(-1);
  assert.equal(record.schema, 'reverse-carry-public-v1');
  assert.equal(record.inception_session, record.sessions[0].session);
  assert.equal(record.as_of_session, latest.session);
  assert.ok(read('projects/ai-commodities-research/index.html').includes('href="/' + path + '"'));
  assert.ok(read('sitemap.xml').includes('/' + path + '</loc>'));
  assert.ok(page.includes('href="/' + asset + '"'));
  assert.ok(page.includes('data-as-of="' + latest.session + '"'));
  assert.ok(page.includes('data-event-sha256="' + latest.event_sha256 + '"'));
  assert.deepEqual(record, JSON.parse(readFileSync(new URL('../public/' + asset, import.meta.url))));
});

test('public paper fills trace to a timely signal and each portfolio retains its drawdowns', () => {
  const start = Number(record.reference_capital_usd);
  assert.equal(Number(record.transaction_cost_usd), 0);
  let previous = null;
  for (const row of record.sessions) {
    if (previous) assert.equal(previous.signal.for_session, row.session);
    if (row.signal.status === 'recorded') {
      assert.ok(Date.parse(row.signal.recorded_at_utc) < Date.parse(row.signal.deadline_utc));
    }
    for (const book of books) {
      const account = row.books[book];
      const prior = previous?.books[book];
      const equity = Number(account.equity_usd);
      const peak = Math.max(Number(prior?.peak_equity_usd ?? start), equity);
      assert.ok(Math.abs(equity - Number(prior?.equity_usd ?? start) - Number(account.daily_pnl_usd)) < 0.005);
      assert.ok(Math.abs(equity - start - Number(account.cumulative_pnl_usd)) < 0.005);
      assert.ok(Math.abs(peak - Number(account.peak_equity_usd)) < 0.005);
      assert.ok(Math.abs(Number(account.drawdown_pct) - 100 * (equity / peak - 1)) < 1e-7);
      assert.ok(Math.abs(Number(account.max_drawdown_pct) - Math.min(Number(prior?.max_drawdown_pct ?? 0), Number(account.drawdown_pct))) < 1e-7);
      for (const trade of account.trades) {
        assert.equal(previous?.signal.status, 'recorded');
        assert.equal(trade.signal_recorded_at_utc, previous.signal.recorded_at_utc);
        assert.equal(trade.filled_at_utc, row.settlement_at_utc);
        assert.equal(Number(trade.after), Number(account.positions[trade.ticker] ?? 0));
      }
      if (book === 'without_wti') {
        assert.ok(Object.keys(account.positions).every((ticker) => !ticker.startsWith('CL')));
      }
    }
    previous = row;
  }
});
