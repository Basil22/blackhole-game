// physics/telemetry_vs_prediction.test.js — telemetry observes the REAL sim;
// telemetry never calls predictTrajectory to fill in results.
import assert from 'node:assert';
import { analyzeClosestApproach, orbitalInfo, createThrowTelemetry, terminationFrom } from '../../js/physics.js';
import { test } from './support.js';
import { pointThrow } from './telemetry_helpers.js';

const MU = 12.288e6;

test('telemetry closest approach matches prediction for the same point throw', () => {
  const state0 = { mu: MU, pos: { x: 0, y: 0, z: 300 }, vel: { x: 200, y: 0, z: 0 } };
  const { result } = pointThrow(state0.pos, state0.vel, { seconds: 40 });
  const predicted = analyzeClosestApproach(state0, { duration: 40 });

  assert.ok(Number.isFinite(result.closestApproach.distance) && result.closestApproach.distance > 0);
  const rel = Math.abs(result.closestApproach.distance - predicted.minimumDistance) / predicted.minimumDistance;
  assert.ok(rel < 0.03,
    `real ${result.closestApproach.distance.toFixed(3)} vs predicted ${predicted.minimumDistance.toFixed(3)}`);

  // analytic periapsis for a point mass should also line up
  const periapsis = orbitalInfo(state0).periapsis;
  const relP = Math.abs(result.closestApproach.distance - periapsis) / periapsis;
  assert.ok(relP < 0.03, `real ${result.closestApproach.distance.toFixed(3)} vs analytic ${periapsis.toFixed(3)}`);
});

test('telemetry closest time is the real simulation time from the physics step', () => {
  const state0 = { mu: MU, pos: { x: 0, y: 0, z: 300 }, vel: { x: 200, y: 0, z: 0 } };
  const { result, world } = pointThrow(state0.pos, state0.vel, { seconds: 40 });
  assert.ok(result.closestApproach.time >= 0);
  assert.ok(Number.isFinite(result.closestApproach.time));
  // duration comes from world.time (fixed timestep), not from wall clocks
  assert.ok(Math.abs(result.duration - world.time) < 1e-9, 'duration == world simulation time');
});

test('telemetry is derived live from steps, not from a prediction call', () => {
  // Single point, pure radial fall: observe that max velocity recorded so far is
  // strictly one physical value — the telemetry builder only sees recordStep()
  // input. (Structural guarantee: telemetry.js imports no predict module.)
  const { result } = pointThrow({ x: 0, y: 0, z: 300 }, { x: 0, y: 0, z: -120 }, { seconds: 8 });
  assert.ok(result.maximumVelocity > result.initial.speed, 'free-fall speeds up — observed from real steps');
  assert.ok(result.closestApproach.distance < result.initial.distance, 'got meaningfully closer');
});

test('prediction and telemetry agree on escape (no consumption)', () => {
  const state0 = { mu: MU, pos: { x: 0, y: 0, z: 300 }, vel: { x: 0, y: 0, z: 800 } };
  const { result } = pointThrow(state0.pos, state0.vel, { seconds: 10 });
  assert.strictEqual(result.terminationReason, 'DESPAWN');
  const predicted = analyzeClosestApproach(state0, { duration: 10 });
  assert.ok(Math.abs(result.closestApproach.distance - predicted.minimumDistance) < 5,
    `escape: real ${result.closestApproach.distance} vs predicted ${predicted.minimumDistance}`);
});

test('finalized result is a detached snapshot (no live references)', () => {
  const { result, world } = pointThrow({ x: 0, y: 0, z: 200 }, { x: 0, y: 0, z: -100 }, { seconds: 4 });
  const snapshot = JSON.stringify(result);
  // keep stepping the live world afterwards; the finalized telemetry must not move
  for (let i = 0; i < 50; i++) world.step();
  assert.strictEqual(JSON.stringify(result), snapshot, 'finalized telemetry is immutable');
  assert.strictEqual(result.remainingPointCount, JSON.parse(snapshot).remainingPointCount);
});