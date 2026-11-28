import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

const root = new URL('../dist/', import.meta.url);
const path = 'projects/ai-commodities-research/reverse-carry/';
const asset = 'data/reverse-carry/track-record.json';
const read = (file) => readFileSync(new URL(file, root), 'utf8');
const record = JSON.parse(read(asset));
const page = read(path + 'index.html');
const books = ['with_wti', 'without_wti'];

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
