// tests/game/scoring.test.js — V2 uncapped scoring engine tests.
// The engine is pure (given telemetry -> score), so these tests drive it with
// crafted finalized-telemetry replicas.
import assert from 'node:assert';
import { test } from '../physics/support.js';
import { calculateThrowScore } from '../../js/game/scoring/index.js';
import { makeTelemetry } from './scoring_helpers.js';

const score = (telemetry) => calculateThrowScore(telemetry);

test('consumed throw: precision gets partial credit, absorption scores', () => {
  const r = score(makeTelemetry({
    closestApproach: { distance: 30, time: 2, position: { x: 0, y: 0, z: -30 }, velocity: { x: 0, y: 0, z: 0 } },
    maximumStretch: 2.5, tearCount: 4, consumedPointCount: 12, remainingPointCount: 0,
    terminationReason: 'ALL_MASS_CONSUMED', trajectoryState: 'HORIZON_CROSSING',
    consumptionFraction: 1, absorptionDuration: 0.8,
  }));
  assert.ok(r.categories.precision.score > 0, 'consumed throws get partial precision credit');
  assert.ok(r.categories.absorption.score > 0, 'absorption rewards consumption');
  assert.ok(r.categories.stretch.score > 0, 'stretch rewards the spaghettification');
  assert.ok(r.categories.destruction.score > 0, 'destruction rewards the tearing');
});

test('perfect near miss: high precision + survival multiplier', () => {
  const r = score(makeTelemetry({
    closestApproach: { distance: 42, time: 3, position: { x: 0, y: 0, z: -42 }, velocity: { x: 0, y: 0, z: 0 } },
    timeNearHorizon: 0.6,
  }));
  assert.ok(r.categories.precision.score > 2500, 'precision high for near miss');
  assert.ok(r.survival.multiplier > 1.0, 'survival multiplier > 1 for survived throw');
  assert.ok(r.total > r.baseTotal, 'survival multiplier increases total');
});

test('distant escape: low score', () => {
  const r = score(makeTelemetry({
    closestApproach: { distance: 380, time: 1, position: { x: 0, y: 0, z: -380 }, velocity: { x: 0, y: 0, z: 800 } },
    maximumStretch: 1, tearCount: 0, consumedPointCount: 0, timeNearHorizon: 0,
    trajectoryState: 'ESCAPING',
  }));
  assert.ok(r.total < 500, `boring escape stays low, got ${r.total}`);
  assert.strictEqual(r.categories.stretch.score, 0);
  assert.strictEqual(r.categories.destruction.score, 0);
  assert.ok(r.categories.precision.score < 200, 'far away precision is near zero');
});

test('increasing stretch increases stretch score (monotone above 1x)', () => {
  const a = score(makeTelemetry({ maximumStretch: 2 }));
  const b = score(makeTelemetry({ maximumStretch: 5 }));
  const c = score(makeTelemetry({ maximumStretch: 8 }));
  assert.ok(a.categories.stretch.score > 0);
  assert.ok(b.categories.stretch.score > a.categories.stretch.score,
    `${b.categories.stretch.score} > ${a.categories.stretch.score}`);
  assert.ok(c.categories.stretch.score > b.categories.stretch.score,
    `${c.categories.stretch.score} > ${b.categories.stretch.score}`);
});

test('increasing tear count increases destruction', () => {
  const a = score(makeTelemetry({ tearCount: 2 }));
  const b = score(makeTelemetry({ tearCount: 5 }));
  const c = score(makeTelemetry({ tearCount: 10 }));
  assert.ok(b.categories.destruction.score >= a.categories.destruction.score);
  assert.ok(c.categories.destruction.score >= b.categories.destruction.score);
  assert.ok(a.categories.destruction.score > 0 || b.categories.destruction.score > 0);
});

test('absorption rewards gradual consumption more than instant', () => {
  const instant = score(makeTelemetry({
    consumedPointCount: 12, consumptionFraction: 1, absorptionDuration: 0,
    terminationReason: 'ALL_MASS_CONSUMED',
  }));
  const gradual = score(makeTelemetry({
    consumedPointCount: 12, consumptionFraction: 1, absorptionDuration: 2.0,
    terminationReason: 'ALL_MASS_CONSUMED',
  }));
  assert.ok(gradual.categories.absorption.score > instant.categories.absorption.score,
    'gradual absorption scores higher than instant');
});

test('survival multiplier is 1.0 for consumed throws', () => {
  const r = score(makeTelemetry({
    consumedPointCount: 12, consumptionFraction: 1,
    terminationReason: 'ALL_MASS_CONSUMED',
  }));
  assert.strictEqual(r.survival.multiplier, 1);
  assert.strictEqual(r.survival.survived, false);
});

test('survival multiplier increases with proximity for survived throws', () => {
  const far = score(makeTelemetry({
    closestApproach: { distance: 200, time: 1, position: { x: 0, y: 0, z: -200 }, velocity: { x: 0, y: 0, z: 0 } },
    consumedPointCount: 0,
  }));
  const close = score(makeTelemetry({
    closestApproach: { distance: 42, time: 3, position: { x: 0, y: 0, z: -42 }, velocity: { x: 0, y: 0, z: 0 } },
    consumedPointCount: 0, timeNearHorizon: 0.5,
  }));
  assert.ok(close.survival.multiplier > far.survival.multiplier,
    'closer survival gives higher multiplier');
});

test('degenerate single-point object: zero stretch even if stretch claim is faked', () => {
  const r1 = score(makeTelemetry({ initialSpan: 0, maximumStretch: 1, initialPointCount: 1, pointCount: 1 }));
  assert.strictEqual(r1.categories.stretch.score, 0);
  const r2 = score(makeTelemetry({ initialSpan: 0, maximumStretch: 5, initialPointCount: 1 }));
  assert.strictEqual(r2.categories.stretch.score, 0, 'zero-span object cannot get fake stretch');
});

test('NaN/Infinity safety: every field degrades to a finite score', () => {
  const r = score(makeTelemetry({
    closestApproach: { distance: Infinity, time: NaN, position: { x: NaN, y: 0, z: 0 }, velocity: { x: 0, y: 0, z: 0 } },
    maximumStretch: NaN, tearCount: NaN, timeNearHorizon: Infinity,
    initialSpan: NaN, maximumSpan: Infinity,
  }));
  assert.ok(Number.isFinite(r.total), `total finite: ${r.total}`);
  for (const cat of Object.values(r.categories)) {
    assert.ok(Number.isFinite(cat.score), `${cat.key} finite`);
  }
});

test('deterministic output: identical telemetry, bit-identical score', () => {
  const t = makeTelemetry({ closestApproach: { distance: 45, time: 3, position: { x: 0, y: 0, z: -45 }, velocity: { x: 0, y: 0, z: 0 } }, maximumStretch: 4, tearCount: 6 });
  const a = JSON.stringify(score(t));
  const b = JSON.stringify(score(makeTelemetry({ closestApproach: { distance: 45, time: 3, position: { x: 0, y: 0, z: -45 }, velocity: { x: 0, y: 0, z: 0 } }, maximumStretch: 4, tearCount: 6 })));
  assert.strictEqual(a, b);
});

test('uncapped scoring: no hard ceiling on total', () => {
  const r = score(makeTelemetry({
    closestApproach: { distance: 40.001, time: 3, position: { x: 0, y: 0, z: -40.001 }, velocity: { x: 0, y: 0, z: 0 } },
    maximumStretch: 1e6, tearCount: 1e6, timeNearHorizon: 10,
    initialSpan: 4.5, consumedPointCount: 0,
  }));
  assert.strictEqual(r.maxTotal, 0, 'uncapped scoring has no maxTotal');
  assert.ok(r.total > 0, 'valid throw produces a score');
  assert.ok(Number.isFinite(r.total), 'total is finite even with extreme values');
});

test('more tears does not reduce destruction; consumption-only gives swallow credit', () => {
  const few = score(makeTelemetry({ tearCount: 1 }));
  const more = score(makeTelemetry({ tearCount: 4 }));
  assert.ok(more.categories.destruction.score >= few.categories.destruction.score);
  const whole = score(makeTelemetry({ tearCount: 0, consumedPointCount: 8, terminationReason: 'ALL_MASS_CONSUMED', consumptionFraction: 1 }));
  assert.ok(whole.categories.destruction.score > 0, 'tearless swallow has some credit');
});

test('Philosophy C: consumed throw scores well, survived throw scores better', () => {
  // Same close approach, stretch, and tears — one consumed, one survived
  const consumed = score(makeTelemetry({
    closestApproach: { distance: 44, time: 3, position: { x: 0, y: 0, z: -44 }, velocity: { x: 0, y: 0, z: 0 } },
    maximumStretch: 4, tearCount: 5,
    consumedPointCount: 12, consumptionFraction: 1, absorptionDuration: 1.0,
    terminationReason: 'ALL_MASS_CONSUMED', trajectoryState: 'HORIZON_CROSSING',
    timeNearHorizon: 0.5,
  }));
  const survived = score(makeTelemetry({
    closestApproach: { distance: 44, time: 3, position: { x: 0, y: 0, z: -44 }, velocity: { x: 0, y: 0, z: 0 } },
    maximumStretch: 4, tearCount: 5,
    consumedPointCount: 0, consumptionFraction: 0, absorptionDuration: 0,
    terminationReason: 'DESPAWN', trajectoryState: 'ESCAPING',
    timeNearHorizon: 0.5,
  }));
  assert.ok(consumed.total > 1000, `consumed throw scores well: ${consumed.total}`);
  assert.ok(survived.total > consumed.total, `survived throw scores higher: ${survived.total} > ${consumed.total}`);
});
