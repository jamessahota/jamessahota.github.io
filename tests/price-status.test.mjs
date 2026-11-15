import assert from 'node:assert/strict';
import { test } from 'node:test';
import { changeSinceEntry, chartObservation, entryMove, observationState, pendingState, trackedObservation } from '../src/lib/price-status.ts';

const now = new Date('2026-11-15T15:00:00Z');
const spot = {
  label: 'Baltic BLPG3 spot', unit: 'US$ per tonne', source: 'Baltic Exchange', sourceUrl: 'https://www.balticexchange.com/',
  cadence: 'weekly', maxAgeDays: 14, value: 310.86, date: '2026-11-13',
};

test('related quotes stay separate from exact benchmark assessment lookup', () => {
  const view = { due: '2026-12-31', referenceTrack: 'spot' };
  assert.equal(trackedObservation(view, { spot }, now), undefined);
  assert.equal(trackedObservation({ ...view, track: 'spot' }, { spot }, now)?.value, 310.86);
});

test('an overdue unverified view awaits its outcome instead of plotting a later price', () => {
  const view = { due: '2026-11-14', track: 'spot' };
  assert.equal(pendingState(view, now), 'outcome');
  assert.equal(trackedObservation(view, { spot }, now), undefined);
  assert.equal(pendingState({ due: '2026-11-14' }, now), 'outcome');
  assert.equal(pendingState({ due: '2026-11-15' }, now), 'open');
});

test('since-entry moves are signed price changes and do not divide by zero', () => {
  assert.deepEqual(changeSinceEntry(100, 110), { absolute: 10, percent: 10 });
  assert.deepEqual(changeSinceEntry(100, 80), { absolute: -20, percent: -20 });
  assert.deepEqual(changeSinceEntry(0, 5), { absolute: 5, percent: undefined });
  assert.throws(() => changeSinceEntry(NaN, 5));
});

test('reference moves need explicit reference entry basis without becoming assessed outcomes', () => {
  const view = { due: '2026-12-31', range: { unit: spot.unit }, referenceTrack: 'spot', entry: { value: 321.86 } };
  assert.equal(entryMove(view, { spot }, now), undefined);
  const referenceView = { ...view, entry: { ...view.entry, basis: 'reference' } };
  const move = entryMove(referenceView, { spot }, now);
  assert.equal(move.basis, 'reference');
  assert.equal(move.absolute, -11);
  assert.ok(Math.abs(move.percent - (-11 / 321.86 * 100)) < 1e-10);
  assert.equal(trackedObservation(referenceView, { spot }, now), undefined);
  assert.equal(entryMove(referenceView, { spot: { ...spot, unit: 'US$ per day' } }, now), undefined);
  assert.equal(entryMove({ ...referenceView, outcome: { value: 999, date: '2026-12-31', source: 'Verified assessment' } }, { spot }, now), undefined);
});

test('charts display labelled reference points while the strict assessment lookup remains empty', () => {
  const view = { due: '2026-12-31', range: { unit: spot.unit }, referenceTrack: 'spot' };
  assert.equal(chartObservation(view, { spot }, now)?.kind, 'reference');
  assert.equal(chartObservation(view, { spot }, now)?.value, 310.86);
  assert.equal(trackedObservation(view, { spot }, now), undefined);
  assert.equal(chartObservation(view, { spot: { ...spot, unit: 'US$ per day' } }, now), undefined);
  assert.equal(chartObservation(view, { spot: { ...spot, date: '2026-11-16' } }, now), undefined);
});

test('chart points prefer verified outcomes and can show a current quote on an overdue unassessed view', () => {
  const view = { due: '2026-11-14', range: { unit: spot.unit }, track: 'spot' };
  assert.equal(chartObservation(view, { spot }, now)?.kind, 'benchmark');
  assert.equal(trackedObservation(view, { spot }, now), undefined);
  const outcome = { value: 299, date: '2026-11-14', source: 'Verified assessment' };
  assert.deepEqual(chartObservation({ ...view, outcome }, { spot }, now), { ...outcome, kind: 'outcome' });
});

test('refresh failures preserve an observation while freshness uses its market date', () => {
  assert.deepEqual(observationState({ ...spot, refreshStatus: 'failed', checkedAt: now.toISOString() }, now),
    { available: true, stale: false, failed: true });
  assert.deepEqual(observationState({ ...spot, date: '2026-10-01', checkedAt: now.toISOString() }, now),
    { available: true, stale: true, failed: false });
});

test('missing, non-finite, invalid and future observations cannot be shown as latest prices', () => {
  for (const change of [{ value: null }, { value: NaN }, { value: Infinity }, { date: null }, { date: '2026-02-30' }, { date: '2026-11-16' }]) {
    assert.equal(observationState({ ...spot, ...change }, now).available, false);
  }
});
