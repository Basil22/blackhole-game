// physics/classify.test.js — trajectory state classification.
import assert from 'node:assert';
import { classifyTrajectory, captureVerdict, isBound, TRAJECTORY } from '../../js/physics.js';
import { test } from './support.js';

const MU = 12.288e6;
const HR = 40;

test('ESCAPING: radial outward throw above escape velocity', () => {
  const c = classifyTrajectory({ mu: MU, pos: { x: 0, y: 0, z: 300 }, vel: { x: 0, y: 0, z: 600 }, horizonRadius: HR });
  assert.strictEqual(c.state, TRAJECTORY.ESCAPING);
  assert.strictEqual(captureVerdict(c.state), 'flyby');
});

test('CAPTURED: radial inward throw, bound', () => {
  const c = classifyTrajectory({ mu: MU, pos: { x: 0, y: 0, z: 300 }, vel: { x: 0, y: 0, z: -200 }, horizonRadius: HR });
  assert.strictEqual(c.state, TRAJECTORY.CAPTURED);
  assert.strictEqual(captureVerdict(c.state), 'captured');
});

test('ORBITAL: tangential throw below escape, periapsis outside horizon', () => {
  const c = classifyTrajectory({ mu: MU, pos: { x: 0, y: 0, z: 300 }, vel: { x: 200, y: 0, z: 0 }, horizonRadius: HR });
  assert.strictEqual(c.state, TRAJECTORY.ORBITAL);
  assert.ok(c.periapsis > HR, `periapsis ${c.periapsis} must clear the horizon`);
  assert.ok(isBound(c.state));
});

test('FLYBY: hyperbolic infall whose periapsis stays outside horizon', () => {
  const c = classifyTrajectory({ mu: MU, pos: { x: 0, y: 0, z: 300 }, vel: { x: 400, y: 0, z: -300 }, horizonRadius: HR });
  assert.strictEqual(c.state, TRAJECTORY.FLYBY);
  assert.ok(c.periapsis > HR, `flyby periapsis ${c.periapsis}`);
});

test('HORIZON_CROSSING: already inside the horizon', () => {
  const c = classifyTrajectory({ mu: MU, pos: { x: 0, y: 0, z: 25 }, vel: { x: 50, y: 0, z: 0 }, horizonRadius: HR });
  assert.strictEqual(c.state, TRAJECTORY.HORIZON_CROSSING);
});

test('HORIZON_CROSSING: unbound plunge aimed at the horizon', () => {
  const c = classifyTrajectory({ mu: MU, pos: { x: 0, y: 0, z: 60 }, vel: { x: 0, y: 0, z: -700 }, horizonRadius: HR });
  // |v|=700 > v_esc at r=60 (v_esc=sqrt(2*12.288e6/60)=640) → unbound, plunging inward → must cross
  assert.strictEqual(c.state, TRAJECTORY.HORIZON_CROSSING);
});

test('UNKNOWN: non-finite position', () => {
  const c = classifyTrajectory({ mu: MU, pos: { x: NaN, y: 0, z: 300 }, vel: { x: 0, y: 0, z: 100 }, horizonRadius: HR });
  assert.strictEqual(c.state, TRAJECTORY.UNKNOWN);
  assert.strictEqual(captureVerdict(c.state), 'unknown');
});

test('classification uses velocity, not distance alone', () => {
  const at = { x: 0, y: 0, z: 300 };
  const slow = classifyTrajectory({ mu: MU, pos: at, vel: { x: 0, y: 0, z: 30 }, horizonRadius: HR });
  const fast = classifyTrajectory({ mu: MU, pos: at, vel: { x: 0, y: 0, z: 900 }, horizonRadius: HR });
  assert.ok(slow.state !== fast.state, `same r, different v must classify differently: ${slow.state} vs ${fast.state}`);
  assert.notStrictEqual(slow.state, TRAJECTORY.UNKNOWN);
});

test('classifyTrajectory is deterministic', () => {
  const input = { mu: MU, pos: { x: 0, y: 0, z: 300 }, vel: { x: 200, y: 0, z: 0 }, horizonRadius: HR };
  assert.strictEqual(classifyTrajectory(input).state, classifyTrajectory(input).state);
});