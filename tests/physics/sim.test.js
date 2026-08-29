// physics/sim.test.js — integration: determinism, fixed dt, conservation
import assert from 'node:assert';
import { BlackHoleWorld, buildChain } from '../../js/physics.js';
import { test } from './support.js';

const MU = 3e6;
const HORIZON = 25;

test('integrator is deterministic: identical world + same dt -> identical state', () => {
  const run = () => {
    const w = new BlackHoleWorld({ mu: MU, horizonRadius: HORIZON });
    buildChain(w, { x: 0, y: 0, z: 120 }, { x: 0, y: 0, z: 130 }, 6, { stiffness: 800, damping: 8, breakStrain: 100 });
    for (let i = 0; i < 60; i++) w.step();
    return w.bodies.map((p) => `${p.pos.x},${p.pos.y},${p.pos.z},${p.vel.x},${p.vel.y},${p.vel.z}`).join('|');
  };
  assert.strictEqual(run(), run());
});

test('fixed timestep: results depend only on step count, not frame subdivision', () => {
  // The game loop steps the world in fixed PHYS_DT increments regardless of FPS,
  // so 60 frames x 1 step must equal 30 frames x 2 steps (same total simulation).
  const make = () => {
    const w = new BlackHoleWorld({ mu: MU, horizonRadius: HORIZON });
    buildChain(w, { x: 0, y: 0, z: 120 }, { x: 0, y: 0, z: 130 }, 6, { stiffness: 800, damping: 8, breakStrain: 100 });
    return w;
  };
  const a = make(), b = make();
  for (let f = 0; f < 60; f++) a.step();
  for (let f = 0; f < 30; f++) { b.step(); b.step(); }
  const snap = (w) => w.bodies.map((p) => `${p.pos.x},${p.pos.y},${p.pos.z},${p.vel.x},${p.vel.y},${p.vel.z}`).join('|');
  assert.strictEqual(snap(a), snap(b), 'grouping steps across frames must not change physics');
});

test('momentum: internal spring forces produce zero net momentum change', () => {
  const w = new BlackHoleWorld({ mu: 0, horizonRadius: HORIZON }); // no gravity
  const p = w.addPoint({ x: -4, y: 0, z: 100 }, 2, 0.4);
  const q = w.addPoint({ x: 4, y: 0, z: 100 }, 3, 0.6);
  w.addSpringLen(p, q, 8, 900, 1);
  w.bodies[0].vel.x = 3; w.bodies[0].vel.y = -2; w.bodies[0].vel.z = 5;
  w.bodies[1].vel.x = -2; w.bodies[1].vel.y = 3; w.bodies[1].vel.z = -1;
  const before = momentum(w);
  assert.ok(Math.abs(before.z) > 1, 'sanity: world actually carries initial momentum');
  w.step();
  const after = momentum(w);
  const drift = { x: after.x - before.x, y: after.y - before.y, z: after.z - before.z };
  assert.ok(Math.abs(drift.x) < 1e-6 && Math.abs(drift.y) < 1e-6 && Math.abs(drift.z) < 1e-6,
    `net p drift dx=${drift.x.toExponential(2)}, dy=${drift.y.toExponential(2)}, dz=${drift.z.toExponential(2)}`);
});

test('internal spring forces do not move center of mass (no external forces)', () => {
  const w = new BlackHoleWorld({ mu: 0, horizonRadius: HORIZON });
  const p = w.addPoint({ x: -4, y: 0, z: 100 }, 1, 0.5);
  const q = w.addPoint({ x: 4, y: 0, z: 100 }, 1, 0.5);
  w.addSpringLen(p, q, 4, 900, 1);
  const c0 = w.centerOfMass();
  for (let i = 0; i < 100; i++) w.step();
  const c1 = w.centerOfMass();
  assert.ok(Math.abs(c1.x - c0.x) < 1e-6 && Math.abs(c1.y - c0.y) < 1e-6 && Math.abs(c1.z - c0.z) < 1e-6,
    `COM drift: ${c1.x - c0.x}, ${c1.y - c0.y}, ${c1.z - c0.z}`);
});

test('equal masses placed symmetrically behave symmetrically', () => {
  const w = new BlackHoleWorld({ mu: MU, horizonRadius: HORIZON });
  const p = w.addPoint({ x: -10, y: 0, z: 100 }, 1, 0.5);
  const q = w.addPoint({ x: 10, y: 0, z: 100 }, 1, 0.5);
  const sp = w.addPoint({ x: -20, y: 0, z: 120 }, 1, 0.5);
  const sq = w.addPoint({ x: 20, y: 0, z: 120 }, 1, 0.5);
  w.addSpringLen(p, sp, 15, 900, 1);
  w.addSpringLen(q, sq, 15, 900, 1);
  for (let i = 0; i < 200; i++) w.step();
  const P = w.bodies[0].pos, Q = w.bodies[1].pos;
  assert.ok(Math.abs(P.x + Q.x) < 1e-6 && Math.abs(P.z - Q.z) < 1e-6 && Math.abs(P.y - Q.y) < 1e-6,
    `left/right divergence: ${P.x} vs ${Q.x}`);
});

test('determinism: repeated full simulation gives identical results', () => {
  // NOTE: buildStar/buildChain with jitter use Math.random() at CONSTRUCTION —
  // that randomness is part of the initial state, not the integration. A truly
  // deterministic replay needs a fully hand-built initial state.
  const run = () => {
    const w = new BlackHoleWorld({ mu: MU, horizonRadius: HORIZON });
    buildChain(w, { x: 0, y: 0, z: 120 }, { x: 0, y: 0, z: 130 }, 6, { stiffness: 800, damping: 8, breakStrain: 0.2 });
    const p = w.addPoint({ x: 30, y: -20, z: 95 }, 1, 0.5);
    const q = w.addPoint({ x: 33, y: -20, z: 95 }, 1, 0.5);
    w.addSpringLen(p, q, 100, 5, 10);
    for (let i = 0; i < 3000; i++) w.step();
    return w.bodies.map((pt) => pt.pos.x.toFixed(9) + ',' + pt.pos.y.toFixed(9) + ',' + pt.pos.z.toFixed(9)).join(';');
  };
  assert.strictEqual(run(), run());
});

test('timestep sensitivity: coarser dt stays finite and bounded (recorded above)', () => {
  const H = 1 / 240; // production fixed timestep
  const ref = endpointFall(1 / 240);
  const drift = {
    '1/120': endpointFall(1 / 120).z - ref.z,
    '1/60': endpointFall(1 / 60).z - ref.z,
  };
  console.log(`  [timestep sensitivity] 4 s fall, endpoint 0 position drift vs dt=1/240: dt=1/120 -> ${drift['1/120'].toFixed(4)}, dt=1/60 -> ${drift['1/60'].toFixed(4)}`);
  assert.ok(Number.isFinite(drift['1/120']) && Number.isFinite(drift['1/60']), 'drift must be finite');
  assert.ok(Math.abs(drift['1/120']) < 1 && Math.abs(drift['1/60']) < 5, 'coarser dt must stay bounded');
});

function momentum(w) {
  let x = 0, y = 0, z = 0;
  for (const b of w.bodies) {
    x += b.mass * b.vel.x;
    y += b.mass * b.vel.y;
    z += b.mass * b.vel.z;
  }
  return { x, y, z };
}

function endpointFall(dt) {
  const w = new BlackHoleWorld({ mu: MU, horizonRadius: HORIZON, dt });
  buildChain(w, { x: 0, y: 0, z: 120 }, { x: 0, y: 0, z: 130 }, 6, { stiffness: 800, damping: 8, breakStrain: 100 });
  const steps = dt === 1 / 240 ? 960 : dt === 1 / 120 ? 480 : 240;
  for (let i = 0; i < steps; i++) w.step(); // 4 simulated seconds
  return w.bodies[0].pos;
}