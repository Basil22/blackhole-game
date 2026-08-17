// physics/closest.test.js — closest-approach analysis vs orbital quantities.
import assert from 'node:assert';
import { analyzeClosestApproach, orbitalInfo, TRAJECTORY } from '../../js/physics.js';
import { test } from './support.js';

const MU = 12.288e6;
const HR = 40;

test('result contains all required envelope fields', () => {
  const c = analyzeClosestApproach({ mu: MU, pos: { x: 0, y: 0, z: 300 }, vel: { x: 200, y: 0, z: 0 }, horizonRadius: HR });
  for (const key of ['minimumDistance', 'timeAtMinimum', 'positionAtMinimum', 'velocityAtMinimum']) {
    assert.ok(key in c, `missing ${key}`);
  }
  assert.ok(Array.isArray(Object.keys(c.positionAtMinimum)) && 'x' in c.positionAtMinimum);
});

test('closest approach matches analytic periapsis for a point mass', () => {
  const state0 = { mu: MU, pos: { x: 0, y: 0, z: 300 }, vel: { x: 200, y: 0, z: 0 } };
  const c = analyzeClosestApproach({ ...state0, horizonRadius: HR }, { duration: 40, sampleInterval: 0.25 });
  const o = orbitalInfo(state0);
  const relative = Math.abs(c.minimumDistance - o.periapsis) / o.periapsis;
  assert.ok(relative < 0.01, `predicted ${c.minimumDistance.toFixed(3)} vs analytic ${o.periapsis.toFixed(3)}`);
});

test('time of closest approach is within the simulated horizon', () => {
  const c = analyzeClosestApproach({ mu: MU, pos: { x: 0, y: 0, z: 300 }, vel: { x: 200, y: 0, z: 0 }, horizonRadius: HR }, { duration: 40 });
  assert.ok(c.timeAtMinimum >= 0, 'time not negative');
  assert.ok(Number.isFinite(c.timeAtMinimum));
});

test('minimum distance never exceeds the start distance', () => {
  const c = analyzeClosestApproach({ mu: MU, pos: { x: 0, y: 0, z: 300 }, vel: { x: 200, y: 0, z: 0 }, horizonRadius: HR });
  assert.ok(c.minimumDistance <= 300 + 1e-9);
});

test('escaping object: closest point is right at the start', () => {
  const c = analyzeClosestApproach({ mu: MU, pos: { x: 0, y: 0, z: 300 }, vel: { x: 0, y: 0, z: 600 }, horizonRadius: HR }, { duration: 30 });
  assert.strictEqual(c.state, TRAJECTORY.ESCAPING);
  assert.ok(Math.abs(c.minimumDistance - 300) < 1e-6, 'already at closest approach');
  assert.ok(c.timeAtMinimum < 1e-9, 'closest approach at t=0');
});

test('radial captured throw: minimum distance approaches the horizon', () => {
  const c = analyzeClosestApproach({ mu: MU, pos: { x: 0, y: 0, z: 300 }, vel: { x: 0, y: 0, z: -200 }, horizonRadius: HR }, { duration: 8, sampleInterval: 0.05 });
  assert.strictEqual(c.state, TRAJECTORY.CAPTURED);
  assert.ok(c.minimumDistance < 60, `should get close to the horizon before consumption, got ${c.minimumDistance.toFixed(2)}`);
  assert.ok(c.minimumDistance >= 38, `cannot end up below the horizon radius, got ${c.minimumDistance.toFixed(2)}`);
});