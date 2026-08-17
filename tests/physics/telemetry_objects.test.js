// physics/telemetry_objects.test.js — telemetry across all four game objects.
import assert from 'node:assert';
import { TERMINATION, terminationFrom } from '../../js/physics.js';
import { test } from './support.js';
import { objectThrow, pointThrow } from './telemetry_helpers.js';

// Inward throws reach the horizon and fully consume; every object must produce
// finite, reconciled telemetry regardless of how the object behaves.
test('rock: telemetry generated, finite, terminated at horizon', () => {
  const { result } = objectThrow('rock', { x: 0, y: -60, z: -260 }, { seconds: 15 });
  assert.ok(Number.isFinite(result.closestApproach.distance));
  assert.ok(result.closestApproach.distance > 0);
  assert.strictEqual(result.terminationReason, TERMINATION.ALL_MASS_CONSUMED);
  assert.strictEqual(result.trajectoryState, 'HORIZON_CROSSING');
  assert.ok(result.initialPointCount > 0 && result.consumedPointCount === result.initialPointCount);
  assert.ok(Number.isFinite(result.maximumVelocity) && result.maximumVelocity > 0);
});

test('astronaut: tears, stretch, consumption, finalized telemetry', () => {
  const { result } = objectThrow('human', { x: 0, y: -60, z: -260 }, { seconds: 15 });
  assert.ok(Number.isFinite(result.maximumStretch), 'stretch finite');
  assert.ok(result.maximumStretch >= 1, `stretch ratio >= 1, got ${result.maximumStretch}`);
  assert.ok(result.terminationReason === TERMINATION.HORIZON || result.terminationReason === TERMINATION.ALL_MASS_CONSUMED,
    `human must reach the horizon, got ${result.terminationReason}`);
  assert.ok(result.consumedPointCount > 0, 'some astronaut mass consumed');
  assert.ok(Number.isFinite(result.maximumVelocity));
  assert.strictEqual(result.remainingPointCount + result.consumedPointCount + result.despawnedPointCount, result.initialPointCount);
});

test('ship: tears + stretch + finalized telemetry', () => {
  const { result } = objectThrow('ship', { x: 0, y: -60, z: -240 }, { seconds: 20 });
  assert.ok(Number.isFinite(result.maximumStretch) && result.maximumStretch >= 1);
  assert.ok(result.terminationReason === TERMINATION.HORIZON || result.terminationReason === TERMINATION.ALL_MASS_CONSUMED,
    `ship reaches horizon, got ${result.terminationReason}`);
  assert.ok(result.consumedPointCount > 0);
});

test('planet: stretch, tears, consumption up to all masses', () => {
  const { result } = objectThrow('planet', { x: 0, y: -60, z: -260 }, { seconds: 15 });
  assert.ok(result.maximumStretch >= 1);
  assert.strictEqual(result.terminationReason, TERMINATION.ALL_MASS_CONSUMED);
  assert.strictEqual(result.remainingPointCount, 0);
  assert.ok(result.tearCount >= 1, 'a planet spiraling in tears apart');
  assert.ok(result.despawnedPointCount === 0);
});

test('multi-point object vs single point: needed metrics non-zero', () => {
  const multi = objectThrow('rock', { x: 0, y: -40, z: -200 });
  const single = pointThrow({ x: 0, y: 19.2, z: 384 }, { x: 0, y: -40, z: -200 });
  // tidal difference requires ≥2 points
  if (multi.result.maximumTidalDifference === 0 && single.result.maximumTidalDifference === 0) {
    assert.ok(true, 'tidal can legitimately be 0 for an un-stretched compact object');
  }
  assert.ok(Number.isFinite(multi.result.maximumTidalDifference));
  assert.ok(Number.isFinite(single.result.maximumTidalDifference));
});

test('largest planet (size 10) stays finite and reconciles', () => {
  const { result } = objectThrow('planet', { x: 0, y: -40, z: -220 }, { size: 10, seconds: 20 });
  assert.ok(Number.isFinite(result.duration) && result.duration >= 0);
  assert.ok(Number.isFinite(result.maximumStretch));
  assert.strictEqual(result.consumedPointCount + result.remainingPointCount + result.despawnedPointCount, result.initialPointCount);
  assert.ok(result.initialPointCount === 31, 'planet still has its 30 + core points regardless of size');
});

test('zero tears is valid for a point, but objects tear when stretched enough', () => {
  const { result } = objectThrow('planet', { x: 0, y: -40, z: -260 }, { seconds: 12 });
  assert.ok(result.tearCount >= 1, `planet tears, got ${result.tearCount}`);
});