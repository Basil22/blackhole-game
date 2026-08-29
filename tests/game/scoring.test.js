// tests/game/scoring.test.js — the scoring engine, in isolation. The engine is
// pure (given telemetry → score), so these tests drive it with crafted
// finalized-telemetry replicas; sim-coupled integration lives in
// scoring_integration.test.js.
import assert from 'node:assert';
import { test } from '../physics/support.js';
import { calculateThrowScore } from '../../js/game/scoring/index.js';
import { makeTelemetry } from './scoring_helpers.js';

const score = (telemetry) => calculateThrowScore(telemetry);

test('immediate horizon: precision 0, survival 0, tidal/destruction may still score', () => {
  const r = score(makeTelemetry({
    closestApproach: { distance: 30, time: 2, position: { x: 0, y: 0, z: -30 }, velocity: { x: 0, y: 0, z: 0 } },
    maximumStretch: 2.5, tearCount: 4, consumedPointCount: 12, remainingPointCount: 0,
    terminationReason: 'ALL_MASS_CONSUMED', trajectoryState: 'HORIZON_CROSSING',
  }));
  assert.strictEqual(r.categories.precision.score, 0);
  assert.strictEqual(r.categories.survival.score, 0);
  assert.ok(r.categories.tidal.score > 0, 'tidal rewards the spaghettification');
  assert.ok(r.categories.destruction.score > 0, 'destruction rewards the tearing');
});

test('perfect near miss: very high precision + positive survival + bonus', () => {
  const r = score(makeTelemetry({ closestApproach: { distance: 42, time: 3, position: { x: 0, y: 0, z: -42 }, velocity: { x: 0, y: 0, z: 0 } } }));
  assert.ok(r.categories.precision.normalized > 0.9, 'precision normalized high');
  assert.ok(r.categories.precision.score > 2700, 'precision near cap');
  assert.ok(r.categories.survival.score > 0, 'positive survival');
  assert.ok(r.bonus.nearHorizonSurvival.eligible, 'bonus eligible');
  assert.ok(r.bonus.nearHorizonSurvival.score > 0, 'bonus awarded');
  assert.strictEqual(r.categories.precision.score + r.categories.tidal.score +
    r.categories.destruction.score + r.categories.survival.score + r.categories.orbital.score +
    r.bonus.nearHorizonSurvival.score, r.total, 'breakdown sums to total');
});

test('distant escape: low score', () => {
  const r = score(makeTelemetry({
    closestApproach: { distance: 380, time: 1, position: { x: 0, y: 0, z: -380 }, velocity: { x: 0, y: 0, z: 800 } },
    maximumStretch: 1, tearCount: 0, consumedPointCount: 0, timeNearHorizon: 0,
    trajectoryState: 'ESCAPING',
  }));
  assert.ok(r.total < 300, `boring escape stays low, got ${r.total}`);
  assert.strictEqual(r.categories.tidal.score, 0);
  assert.strictEqual(r.categories.destruction.score, 0);
  assert.strictEqual(r.categories.orbital.score, 0);
  assert.ok(r.categories.precision.score < 100, 'far away precision is near zero');
});

test('increasing stretch increases tidal (monotone above 1x)', () => {
  const a = score(makeTelemetry({ maximumStretch: 2 }));
  const b = score(makeTelemetry({ maximumStretch: 5 }));
  const c = score(makeTelemetry({ maximumStretch: 8 }));
  assert.ok(a.categories.tidal.score > 0);
  assert.ok(b.categories.tidal.score > a.categories.tidal.score,
    `${b.categories.tidal.score} > ${a.categories.tidal.score}`);
  assert.ok(c.categories.tidal.score > b.categories.tidal.score,
    `${c.categories.tidal.score} > ${b.categories.tidal.score}`);
  assert.ok(c.categories.tidal.normalized > 0.9, 'extreme stretch → near-max tidal');
});

test('increasing tear count increases destruction', () => {
  const a = score(makeTelemetry({ tearCount: 2 }));
  const b = score(makeTelemetry({ tearCount: 5 }));
  const c = score(makeTelemetry({ tearCount: 10 }));
  assert.ok(b.categories.destruction.score >= a.categories.destruction.score);
  assert.ok(c.categories.destruction.score >= b.categories.destruction.score);
  assert.ok(a.categories.destruction.score > 0 || b.categories.destruction.score > 0);
});

test('orbital state yields positive orbital score, others zero', () => {
  const orb = score(makeTelemetry({ trajectoryState: 'ORBITAL' }));
  assert.ok(orb.categories.orbital.score > 0);
  assert.strictEqual(orb.categories.orbital.normalized, 1);
  const not = score(makeTelemetry({ trajectoryState: 'FLYBY' }));
  assert.strictEqual(not.categories.orbital.score, 0);
  // purely negative orbital energy must NOT score by itself
  const esc = score(makeTelemetry({ trajectoryState: 'ESCAPING' }));
  assert.strictEqual(esc.categories.orbital.score, 0);
});

test('combined high-quality throw: strong across most categories, high total', () => {
  const r = score(makeTelemetry({
    closestApproach: { distance: 44, time: 3, position: { x: 0, y: 0, z: -44 }, velocity: { x: 0, y: 0, z: 0 } },
    maximumStretch: 6, tearCount: 9, timeNearHorizon: 0.7, trajectoryState: 'ORBITAL',
  }));
  assert.ok(r.categories.precision.normalized > 0.9);
  assert.ok(r.categories.tidal.normalized > 0.85);
  assert.strictEqual(r.categories.destruction.normalized, 1);
  assert.ok(r.categories.survival.normalized > 0.85);
  assert.strictEqual(r.categories.orbital.normalized, 1);
  assert.ok(r.total > 9000, `combined high-quality total, got ${r.total}`);
});

test('degenerate single-point object: zero tidal even if stretch claim is faked', () => {
  const r1 = score(makeTelemetry({ initialSpan: 0, maximumStretch: 1, initialPointCount: 1, pointCount: 1 }));
  assert.strictEqual(r1.categories.tidal.score, 0);
  const r2 = score(makeTelemetry({ initialSpan: 0, maximumStretch: 5, initialPointCount: 1 }));
  assert.strictEqual(r2.categories.tidal.score, 0, 'zero-span object cannot get fake stretch');
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
    assert.ok(Number.isFinite(cat.normalized), `${cat.key} normalized finite`);
  }
  assert.ok(Number.isFinite(r.bonus.nearHorizonSurvival.score));
  assert.strictEqual(r.categories.tidal.score, 0);
});

test('deterministic output: identical telemetry, bit-identical score', () => {
  const t = makeTelemetry({ closestApproach: { distance: 45, time: 3, position: { x: 0, y: 0, z: -45 }, velocity: { x: 0, y: 0, z: 0 } }, maximumStretch: 4, tearCount: 6 });
  const a = JSON.stringify(score(t));
  const b = JSON.stringify(score(makeTelemetry({ closestApproach: { distance: 45, time: 3, position: { x: 0, y: 0, z: -45 }, velocity: { x: 0, y: 0, z: 0 } }, maximumStretch: 4, tearCount: 6 })));
  assert.strictEqual(a, b);
});

test('category caps: normalized 1 exactly hits each cap, never exceeds it', () => {
  const r = score(makeTelemetry({
    closestApproach: { distance: 40.001, time: 3, position: { x: 0, y: 0, z: -40.001 }, velocity: { x: 0, y: 0, z: 0 } },
    maximumStretch: 1e6, tearCount: 1e6, timeNearHorizon: 10, trajectoryState: 'ORBITAL',
    initialSpan: 4.5,
  }));
  const expectMax = { precision: 3000, tidal: 2500, destruction: 1500, survival: 2000, orbital: 1000 };
  for (const [key, cap] of Object.entries(expectMax)) {
    assert.ok(r.categories[key].score <= cap, `${key} ${r.categories[key].score} <= ${cap}`);
    assert.ok(r.categories[key].normalized > 0.99, `${key} near-max normalized`);
  }
  // exp-damped precision just outside the horizon rounds up to its own cap
  assert.strictEqual(r.categories.precision.score, 3000);
  assert.ok(r.bonus.nearHorizonSurvival.score <= 600);
  assert.ok(r.total <= r.maxTotal, `total ${r.total} <= maxTotal ${r.maxTotal}`);
  assert.strictEqual(r.maxTotal, 10600);
});

test('object independence: identical physics, different kind field → identical score', () => {
  const base = makeTelemetry({ closestApproach: { distance: 50, time: 3, position: { x: 0, y: 0, z: -50 }, velocity: { x: 0, y: 0, z: 0 } }, maximumStretch: 3, tearCount: 5 });
  const rock = score({ ...base, kind: 'rock' });
  const planetForScoring = score({ ...base, kind: 'planet', initialPointCount: 100, pointCount: 100, initialMass: 50 });
  assert.strictEqual(JSON.stringify(rock), JSON.stringify(planetForScoring),
    'scoring reads physics outcomes only — point count/mass/kind must not leak in');
});

test('more tears does not reduce destruction; consumption-only object still reaps a swallow credit', () => {
  const few = score(makeTelemetry({ tearCount: 1 }));
  const more = score(makeTelemetry({ tearCount: 4 }));
  assert.ok(more.categories.destruction.score >= few.categories.destruction.score);
  // swallowed whole, zero tears → small credit, no double count with tears case
  const whole = score(makeTelemetry({ tearCount: 0, consumedPointCount: 8, terminationReason: 'ALL_MASS_CONSUMED' }));
  assert.ok(whole.categories.destruction.score > 0, 'tearless swallow has some credit');
  assert.ok(whole.categories.destruction.normalized <= 0.25);
});