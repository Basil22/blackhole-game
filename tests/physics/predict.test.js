// physics/predict.test.js — deterministic trajectory sampler.
import assert from 'node:assert';
import { predictTrajectory, classifyTrajectory, BlackHoleWorld, buildChain, buildStar, cloneWorld, TRAJECTORY } from '../../js/physics.js';
import { test } from './support.js';

const MU = 12.288e6;
const HR = 40;

function r(s) { return Math.sqrt(s.position.x ** 2 + s.position.y ** 2 + s.position.z ** 2); }
function state(vel, pos = { x: 0, y: 0, z: 300 }) { return { mu: MU, horizonRadius: HR, pos, vel }; }

test('straight radial throw moves toward the black hole', () => {
  const p = predictTrajectory(state({ x: 0, y: 0, z: -200 }), { duration: 6, sampleInterval: 0.2 });
  const radii = p.samples.map(r);
  assert.ok(radii[1] < radii[0], 'distance decreases from the first step');
  assert.ok(radii[radii.length - 1] < radii[Math.floor(radii.length / 2)], 'trend stays inward');
  const c = classifyTrajectory(state({ x: 0, y: 0, z: -200 }));
  assert.strictEqual(c.state, TRAJECTORY.CAPTURED);
});

test('tangential throw curves (direction of travel changes)', () => {
  const p = predictTrajectory(state({ x: 200, y: 0, z: 0 }), { duration: 8, sampleInterval: 0.25 });
  const v0 = p.samples[0].velocity;
  const v1 = p.samples[p.samples.length - 1].velocity;
  const dot = v0.x * v1.x + v0.y * v1.y + v0.z * v1.z;
  const cross = Math.hypot(v0.y * v1.z - v0.z * v1.y, v0.z * v1.x - v0.x * v1.z, v0.x * v1.y - v0.y * v1.x);
  assert.ok(cross > 10, `path must curve; |v0 x v1| = ${cross}`);
  assert.ok(r(p.samples[0]) < 1000 && r(p.samples[p.samples.length - 1]) < 1000, 'stays bound');
});

test('high-energy throw flies away', () => {
  const p = predictTrajectory(state({ x: 0, y: 0, z: 600 }), { duration: 6 });
  const radii = p.samples.map(r);
  assert.ok(radii[radii.length - 1] > radii[0] * 1.2, 'distance grows substantially');
  assert.strictEqual(classifyTrajectory(state({ x: 0, y: 0, z: 600 })).state, TRAJECTORY.ESCAPING);
});

test('low-energy throw remains gravitationally influenced', () => {
  const p = predictTrajectory(state({ x: 120, y: 0, z: 0 }), { duration: 60, sampleInterval: 0.5 });
  const radii = p.samples.map(r);
  const c = classifyTrajectory(state({ x: 120, y: 0, z: 0 }));
  assert.strictEqual(c.state, TRAJECTORY.ORBITAL, `low-energy tangential at r=300 must be bound`);
  assert.ok(radii.some((rr) => rr < radii[0] * 0.95), 'orbit dips toward the hole');
  assert.ok(radii.every((rr) => rr < 2000), 'stays within the influence, not escaped');
  assert.ok(c.periapsis > HR, 'orbit clears the horizon');
});

test('symmetric throw produces a mirror-symmetric trajectory', () => {
  const a = predictTrajectory(state({ x: 140, y: 80, z: 60 }), { duration: 6 });
  const b = predictTrajectory(state({ x: -140, y: 80, z: 60 }), { duration: 6 });
  assert.strictEqual(a.samples.length, b.samples.length);
  for (let i = 0; i < a.samples.length; i++) {
    const A = a.samples[i].position, B = b.samples[i].position;
    assert.ok(Math.abs(A.x + B.x) < 1e-6, `i=${i}: x mirror |${A.x} + ${B.x}|`);
    assert.ok(Math.abs(A.y - B.y) < 1e-6 && Math.abs(A.z - B.z) < 1e-6, `i=${i}: y/z equal`);
  }
});

test('prediction is bit-identical across repeated calls', () => {
  const s = state({ x: 200, y: 0, z: 0 });
  const a = predictTrajectory(s, { duration: 4 });
  const b = predictTrajectory(s, { duration: 4 });
  assert.strictEqual(JSON.stringify(a.samples), JSON.stringify(b.samples));
});

test('prediction does not mutate a live world (cloned)', () => {
  const w = new BlackHoleWorld({ mu: MU, horizonRadius: HR });
  buildChain(w, { x: 0, y: 0, z: 120 }, { x: 0, y: 0, z: 140 }, 5, { stiffness: 800, damping: 8, breakStrain: 0.3 });
  buildStar(w, { x: 30, y: -10, z: 180 }, { points: 8, radius: 3 });
  const before = JSON.stringify({ bodies: w.bodies, springs: w.springs, time: w.time });

  predictTrajectory({ world: w }, { duration: 4 });

  const after = JSON.stringify({ bodies: w.bodies, springs: w.springs, time: w.time });
  assert.strictEqual(after, before, 'live world unchanged by prediction');
});

test('prediction matched against direct step simulation bit-for-bit', () => {
  const s = state({ x: 210, y: 0, z: -40 });
  const p = predictTrajectory(s, { duration: 2, sampleInterval: 1 / 240, maximumSamples: 100000 });

  const w = new BlackHoleWorld({ mu: MU, horizonRadius: HR });
  const idx = w.addPoint(s.pos, 1, 0.5);
  w.bodies[idx].vel = { ...s.vel };
  const manual = [];
  for (let i = 0; i < 480; i++) {
    w.step();
    if ((i + 1) % 1 === 0) manual.push({ t: w.time, pos: { ...w.bodies[idx].pos } });
  }
  assert.strictEqual(manual.length, p.samples.length - 1);
  for (let i = 1; i < p.samples.length; i++) {
    const ps = p.samples[i], ms = manual[i - 1];
    assert.strictEqual(ps.position.x, ms.pos.x, `sample ${i} x`);
    assert.strictEqual(ps.position.z, ms.pos.z, `sample ${i} z`);
  }
});

test('maximumSamples bounds CPU even with a huge duration', () => {
  const p = predictTrajectory(state({ x: 200, y: 0, z: 0 }), { duration: 100000, sampleInterval: 0.25, maximumSamples: 5 });
  assert.ok(p.samples.length <= 6, `samples capped at ${p.samples.length}`);
  assert.strictEqual(p.truncated, true);
});

test('cloneWorld produces an independent yet identical world', () => {
  const w = new BlackHoleWorld({ mu: MU, horizonRadius: HR, drag: 0.02 });
  buildChain(w, { x: 0, y: 0, z: 120 }, { x: 0, y: 0, z: 140 }, 4);
  const wc = cloneWorld(w);
  assert.strictEqual(wc.mu, w.mu);
  assert.strictEqual(wc.bodies.length, w.bodies.length);
  assert.strictEqual(wc.springs.length, w.springs.length);
  wc.bodies[0].pos.z = 9999; // altering the clone must not touch the source
  assert.strictEqual(w.bodies[0].pos.z, 120); // chain start was at z=120
  assert.strictEqual(w.bodies[0].pos.x, 0);
});