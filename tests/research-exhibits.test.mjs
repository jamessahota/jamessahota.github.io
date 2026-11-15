import assert from 'node:assert/strict';
import { test } from 'node:test';
import { comparisonGeometry } from '../src/lib/exhibit.ts';

const near = (actual, expected) => assert.ok(Math.abs(actual - expected) < 1e-8, `${actual} differs from ${expected}`);

test('oil output and needs share a zero baseline and a proportional scale', () => {
  const scale = comparisonGeometry([40, 100]);
  assert.equal(scale.zero, 0);
  assert.equal(scale.min, 0);
  assert.equal(scale.max, 100);
  near(scale.bars[0].width, 40);
  near(scale.bars[1].width, 100);
  assert.ok(scale.bars.every((bar) => bar.left === 0));
});

test('stock draws and seasonal builds extend on opposite sides of the same zero', () => {
  const scale = comparisonGeometry([-13.9, 8.3]);
  assert.equal(scale.min, -13.9);
  assert.equal(scale.max, 8.3);
  assert.equal(scale.bars[0].negative, true);
  assert.equal(scale.bars[1].negative, false);
  near(scale.bars[0].left + scale.bars[0].width, scale.zero);
  near(scale.bars[1].left, scale.zero);
  near(scale.bars[1].left + scale.bars[1].width, 100);
});

test('generation shares occupy their actual percentage of a 0–100 scale', () => {
  const scale = comparisonGeometry([60, 95], { min: 0, max: 100 });
  near(scale.bars[0].width, 60);
  near(scale.bars[1].width, 95);
  assert.equal(scale.max, 100);
});

test('negative-only comparisons end at zero instead of treating losses as positive', () => {
  const scale = comparisonGeometry([-10, -5]);
  assert.equal(scale.zero, 100);
  near(scale.bars[0].width, 100);
  near(scale.bars[1].width, 50);
  near(scale.bars[1].left, 50);
});

test('invalid comparison values cannot silently create misleading geometry', () => {
  assert.throws(() => comparisonGeometry([]));
  assert.throws(() => comparisonGeometry([1, NaN]));
  assert.throws(() => comparisonGeometry([Infinity, 2]));
  assert.throws(() => comparisonGeometry([60, 95], { min: 50, max: 100 }));
  assert.throws(() => comparisonGeometry([60, 95], { min: 0, max: 90 }));
});
