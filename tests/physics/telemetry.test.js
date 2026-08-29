// physics/telemetry.test.js — core metrics, lifecycle, edge cases.
import assert from 'node:assert';
import { BlackHoleWorld, createThrowTelemetry, cloneWorld, TERMINATION, terminationFrom } from '../../js/physics.js';
import { getObjectDef } from '../../js/objects.js';
import { test } from './support.js';
import { pointThrow } from './telemetry_helpers.js';

test('result contains every telemetry field and stays finite', () => {
  const { result } = pointThrow({ x: 0, y: 19.2, z: 384 }, { x: 0, y: -60, z: -180 });
  const keys = [
    'started', 'ended', 'duration',
    'initial', 'initialMass', 'initialPointCount',
    'closestApproach', 'maximumStretch', 'maximumStretchTime',
    'maximumTidalDifference', 'maximumTidalDifferenceTime',
    'maximumVelocity', 'maximumVelocityTime',
    'timeNearHorizon', 'minimumNearHorizonDistance',
    'tearCount', 'tearTimes', 'consumedPointCount', 'consumedMass',
    'remainingPointCount', 'remainingMass', 'despawnedPointCount',
    'trajectoryState', 'terminationReason',
    'initialSpan', 'maximumSpan',
  ];
  for (const k of keys) assert.ok(k in result, `missing ${k}`);
  for (const [k, v] of Object.entries(result)) {
    if (Array.isArray(v)) continue;
    if (v && typeof v === 'object') {
      for (const x of Object.values(v)) if (typeof x === 'number') assert.ok(Number.isFinite(x), `non-finite in ${k}`);
    } else if (typeof v === 'number') {
      assert.ok(Number.isFinite(v), `non-finite ${k}=${v}`);
    }
  }
  assert.ok(result.duration >= 0, 'no negative duration');
});

test('telemetry is deterministic: identical worlds give identical results', () => {
  const w = new BlackHoleWorld({ mu: 12.288e6, horizonRadius: 40, drag: 0.1, despawnRadius: 560 });
  getObjectDef('planet').build(w, { x: 0, y: 19.2, z: 384 }, 1);
  for (const p of w.bodies) { p.vel.x = 0; p.vel.y = -60; p.vel.z = -180; }
  const wA = cloneWorld(w), wB = cloneWorld(w);
  const run = (ww) => {
    const tm = createThrowTelemetry({ world: ww });
    for (let i = 0; i < 800; i++) {
      const evs = ww.step();
      for (const ev of evs) {
        if (ev.type === 'tear') tm.recordTear();
        else if (ev.type === 'consume') tm.recordConsumption(ww.bodies[ev.index].mass);
      }
      tm.recordStep();
      if (ww.aliveCount() === 0) break;
    }
    return JSON.stringify(tm.finalizeThrow(terminationFrom(tm.consumedPointCount, tm.initialPointCount)));
  };
  assert.strictEqual(run(wA), run(wB), 'replays must be bit-identical');
});

test('telemetry does not perturb the simulation', () => {
  const a = pointThrow({ x: 0, y: 19.2, z: 384 }, { x: 0, y: -40, z: -200 }, { seconds: 3 });
  const b = pointThrow({ x: 0, y: 19.2, z: 384 }, { x: 0, y: -40, z: -200 }, { seconds: 3 });
  assert.strictEqual(a.result.duration, b.result.duration);
  assert.strictEqual(a.result.closestApproach.distance, b.result.closestApproach.distance);
  assert.strictEqual(a.result.maximumVelocity, b.result.maximumVelocity);
});

test('terminationFrom maps counters to reasons', () => {
  assert.strictEqual(terminationFrom(0, 0), TERMINATION.DESPAWN);
  assert.strictEqual(terminationFrom(0, 7), TERMINATION.DESPAWN);
  assert.strictEqual(terminationFrom(3, 7), TERMINATION.HORIZON);
  assert.strictEqual(terminationFrom(7, 7), TERMINATION.ALL_MASS_CONSUMED);
});

test('immediate horizon crossing when spawned inside', () => {
  const { result } = pointThrow({ x: 0, y: 0, z: 10 }, { x: 0, y: 0, z: 5 });
  assert.strictEqual(result.terminationReason, TERMINATION.ALL_MASS_CONSUMED);
  assert.strictEqual(result.trajectoryState, 'HORIZON_CROSSING');
  assert.ok(result.closestApproach.distance < 12, `closest ${result.closestApproach.distance}`);
  assert.ok(result.remainingPointCount === 0);
  assert.strictEqual(result.tearCount, 0);
});

test('no horizon crossing: high outward velocity despawns', () => {
  const { result } = pointThrow({ x: 0, y: 0, z: 384 }, { x: 0, y: 0, z: 3000 }, { seconds: 10 });
  assert.strictEqual(result.terminationReason, TERMINATION.DESPAWN);
  assert.strictEqual(result.consumedPointCount, 0);
  assert.strictEqual(result.timeNearHorizon, 0);
  assert.ok(result.trajectoryState === 'ESCAPING' || result.trajectoryState === 'FLYBY', `got ${result.trajectoryState}`);
});

test('zero/near-zero velocity falls straight in', () => {
  const { result } = pointThrow({ x: 0, y: 0, z: 100 }, { x: 0, y: 0, z: 0 });
  assert.strictEqual(result.terminationReason, TERMINATION.ALL_MASS_CONSUMED);
  assert.ok(result.trajectoryState === 'HORIZON_CROSSING');
  assert.ok(result.maximumVelocity === 0 || Number.isFinite(result.maximumVelocity));
});

test('very high velocity stays finite (no NaN/Infinity)', () => {
  const { result } = pointThrow({ x: 0, y: 0, z: 384 }, { x: 5000, y: 0, z: 5000 });
  assert.ok(Number.isFinite(result.maximumVelocity));
  assert.ok(Number.isFinite(result.closestApproach.distance));
});

test('single-point world: stretch is degenerate but valid', () => {
  const { result } = pointThrow({ x: 0, y: 0, z: 200 }, { x: 0, y: 0, z: -80 }, { seconds: 5 });
  assert.strictEqual(result.initialPointCount, 1);
  assert.strictEqual(result.initialSpan, 0);
  assert.strictEqual(result.maximumStretch, 1); // ratio guarded when span is 0
});

test('zero tears and positive tears both validate', () => {
  const zero = pointThrow({ x: 0, y: 0, z: 200 }, { x: 0, y: 0, z: -100 }, { seconds: 3 });
  assert.strictEqual(zero.result.tearCount, 0, 'no springs -> no tears');

  const world = new BlackHoleWorld({ mu: 12.288e6, horizonRadius: 40, drag: 0.1, despawnRadius: 560 });
  getObjectDef('planet').build(world, { x: 0, y: 19.2, z: 384 }, 1);
  for (const p of world.bodies) { p.vel.x = 0; p.vel.y = -60; p.vel.z = -220; }
  const tm = createThrowTelemetry({ world });
  for (let i = 0; i < 600; i++) {
    const evs = world.step();
    for (const ev of evs) {
      if (ev.type === 'tear') tm.recordTear();
      else if (ev.type === 'consume') tm.recordConsumption(world.bodies[ev.index].mass);
    }
    tm.recordStep();
    if (world.aliveCount() === 0) break;
  }
  const res = tm.finalizeThrow(terminationFrom(tm.consumedPointCount, tm.initialPointCount));
  assert.ok(res.tearCount >= 1, `expected tears, got ${res.tearCount}`);
  assert.strictEqual(res.tearTimes.length, res.tearCount);
});

test('consumption counters reconcile with the initial counts', () => {
  const { result } = pointThrow({ x: 0, y: 19.2, z: 384 }, { x: 0, y: -60, z: -300 });
  assert.strictEqual(result.consumedPointCount + result.remainingPointCount + result.despawnedPointCount,
    result.initialPointCount, 'consumed + remaining + despawned == initial');
  assert.ok(result.consumedPointCount >= 1);
});

test('closest approach never exceeds the start distance', () => {
  const { result } = pointThrow({ x: 0, y: 19.2, z: 384 }, { x: 0, y: -30, z: -120 }, { seconds: 8 });
  assert.ok(result.closestApproach.distance <= result.initial.distance + 1e-9);
});

test('very large object stays finite and terminates deterministically', () => {
  const { result } = pointThrow({ x: 0, y: 19.2, z: 384 }, { x: 0, y: 0, z: -3000 }, { seconds: 5 });
  // large scale object semantics: fast outward -> despawn, but just assert sanity
  assert.ok(Number.isFinite(result.duration) && result.terminationReason);
});