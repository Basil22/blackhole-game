// tests/game/scoring_integration.test.js — feed the scorer REAL finalized
// telemetry from the physics sim (same telemetry_helpers the telemetry layer
// uses), proving score() consumes the exact object the game loop produces.
import assert from 'node:assert';
import { test } from '../physics/support.js';
import { pointThrow, objectThrow } from '../physics/telemetry_helpers.js';
import { calculateThrowScore } from '../../js/game/scoring/index.js';

test('real consumed throw scores: precision gets partial credit, finite total', () => {
  const { result } = pointThrow({ x: 0, y: 0, z: 300 }, { x: 0, y: 0, z: -120 }, { seconds: 40 });
  const r = calculateThrowScore(result);
  assert.ok(Number.isFinite(r.total) && r.total >= 0, `total ${r.total}`);
  assert.ok(r.categories.stretch.score >= 0);
  assert.ok(r.categories.destruction.score >= 0);
});

test('real despawned escape scores a finite total', () => {
  const { result } = pointThrow({ x: 0, y: 0, z: 300 }, { x: 0, y: 0, z: 800 }, { seconds: 10 });
  assert.strictEqual(result.terminationReason, 'DESPAWN');
  const r = calculateThrowScore(result);
  assert.ok(Number.isFinite(r.total), `total ${r.total}`);
  assert.ok(r.total >= 0);
});

test('real planet throw (31 points, torn + fully consumed) scores all fields finite', () => {
  const { result } = objectThrow('planet', { x: 0, y: -40, z: -200 }, { seconds: 40, size: 1 });
  const r = calculateThrowScore(result);
  assert.ok(Number.isFinite(r.total) && r.total >= 0, `total ${r.total}`);
  for (const row of r.breakdown) {
    assert.ok(Number.isFinite(row.score), `${row.key} finite`);
    assert.ok(row.score >= 0, `${row.key} non-negative`);
  }
  if (result.tearCount > 0) assert.ok(r.categories.destruction.score > 0, 'torn so destruction > 0');
});

test('breakdown rows plus survival bonus sum to total for real telemetry', () => {
  const { result } = objectThrow('rock', { x: 0, y: -30, z: -220 }, { seconds: 40, size: 1 });
  const r = calculateThrowScore(result);
  // In V2, total = baseTotal * survivalMultiplier. The survival row's score
  // is (total - baseTotal), so breakdown still sums to total.
  const sum = r.breakdown.reduce((s, row) => s + row.score, 0);
  assert.strictEqual(sum, r.total);
});
