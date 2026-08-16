// physics.test.js — run with: node tests/physics.test.js
import assert from 'node:assert';
import { BlackHoleWorld, V3, buildChain, buildStar } from '../js/physics.js';

let passed = 0;
let failed = 0;
function test(name, fn) {
  try {
    fn();
    passed++;
    console.log(`  ok — ${name}`);
  } catch (e) {
    failed++;
    console.log(`  FAIL — ${name}\n    ${e.message}`);
  }
}

const MU = 3e6;
const HORIZON = 25;

// 1. Free-fall: a single point reaches the horizon and is consumed
test('single point free-falls to horizon and is consumed', () => {
  const w = new BlackHoleWorld({ mu: MU, horizonRadius: HORIZON });
  w.addPoint({ x: 0, y: 0, z: 150 }, 1, 0.5);
  let consumed = false;
  for (let i = 0; i < 3000 && !consumed; i++) {
    const ev = w.step();
    if (ev.some((e) => e.type === 'consume')) consumed = true;
  }
  assert.ok(consumed, 'point should be consumed at horizon');
  assert.ok(w.aliveCount() === 0, 'no alive points remain');
});

// 2. Spaghettification: a short weak chain (like a human) stretches dramatically
test('tidal force stretches a short weak chain (spaghettification)', () => {
  const w = new BlackHoleWorld({ mu: MU, horizonRadius: HORIZON });
  const idx = buildChain(w, { x: 0, y: 0, z: 100 }, { x: 0, y: 0, z: 101.9 }, 10, {
    stiffness: 400,
    damping: 6,
    breakStrain: 10,  // don't tear, we only measure stretch
    radius: 0.22,
  });
  const initialLen = V3.length(V3.sub(V3.make(), w.bodies[idx[0]].pos, w.bodies[idx[9]].pos));
  let maxLen = initialLen;
  for (let i = 0; i < 3000; i++) {
    w.step();
    const len = V3.length(V3.sub(V3.make(), w.bodies[idx[0]].pos, w.bodies[idx[9]].pos));
    maxLen = Math.max(maxLen, len);
  }
  assert.ok(maxLen > initialLen * 2, `expected stretch >2x, got ${maxLen / initialLen}x`);
});

// 3. Tearing: low-strength object snaps into pieces before reaching horizon
test('low-strength object tears apart under tidal stress', () => {
  const w = new BlackHoleWorld({ mu: MU, horizonRadius: HORIZON });
  buildChain(w, { x: 0, y: 0, z: 100 }, { x: 0, y: 0, z: 112 }, 6, {
    stiffness: 600,
    damping: 6,
    breakStrain: 0.1,
    radius: 0.5,
  });
  let tears = 0;
  for (let i = 0; i < 3000; i++) {
    const ev = w.step();
    for (const e of ev) if (e.type === 'tear') tears++;
    if (w.aliveCount() === 0) break;
  }
  assert.ok(tears >= 1, `expected >=1 tear, got ${tears}`);
});

// 4. Orbit stability: a point in a circular orbit stays roughly at radius
test('circular orbit is stable (velocity matches GM/r)', () => {
  const w = new BlackHoleWorld({ mu: MU, horizonRadius: HORIZON });
  const r = 80;
  w.addPoint({ x: r, y: 0, z: 0 }, 1, 0.5);
  // circular orbital speed: v = sqrt(mu/r), tangential (y)
  const v = Math.sqrt(MU / r);
  w.bodies[0].vel.y = v;
  const start = { x: w.bodies[0].pos.x, y: w.bodies[0].pos.y };
  let minR = Infinity, maxR = -Infinity;
  for (let i = 0; i < 6000; i++) {
    w.step();
    const rr = V3.length(w.bodies[0].pos);
    minR = Math.min(minR, rr);
    maxR = Math.max(maxR, rr);
  }
  const drift = (maxR - minR) / r;
  assert.ok(drift < 0.15, `orbit should stay near r=80, drifted ${drift * 100}%`);
});

// 5. Planet-like star shreds under tides (tears without full dissolve)
test('star (30 particles) produces tears under tidal stress', () => {
  const w = new BlackHoleWorld({ mu: MU, horizonRadius: HORIZON });
  buildStar(w, { x: 0, y: 0, z: 120 }, { points: 30, radius: 5, breakStrain: 0.05 });
  let tears = 0;
  for (let i = 0; i < 3000; i++) {
    const ev = w.step();
    for (const e of ev) if (e.type === 'tear') tears++;
    if (w.aliveCount() === 0) break;
  }
  assert.ok(tears >= 3, `expected >=3 tears, got ${tears}`);
});

// 6. Conservation sanity: without forces, velocity stays constant (near-zero gravity at huge distance negligible)
test('no drift without gravity (teleport away from hole)', () => {
  const w = new BlackHoleWorld({ mu: MU, horizonRadius: HORIZON });
  w.addPoint({ x: 0, y: 0, z: 1e9 }, 1, 0.5); // gravity ~0
  w.bodies[0].vel.x = 5;
  for (let i = 0; i < 240; i++) w.step(); // 1 simulated second
  assert.ok(Math.abs(w.bodies[0].vel.x - 5) < 0.01, `velocity should stay ~5, got ${w.bodies[0].vel.x}`);
});

// 7. Event horizon consumption radius check: point spawns just inside, dies immediately
test('point spawned inside horizon is consumed on first step', () => {
  const w = new BlackHoleWorld({ mu: MU, horizonRadius: HORIZON });
  w.addPoint({ x: 10, y: 0, z: 0 }, 1, 0.5);
  const ev = w.step();
  assert.ok(ev.some((e) => e.type === 'consume'), 'should consume immediately');
});

// 8. Mass conservation across one long fall (no NaNs)
test('no NaN values during long sim', () => {
  const w = new BlackHoleWorld({ mu: MU, horizonRadius: HORIZON });
  buildChain(w, { x: 0, y: 0, z: 120 }, { x: 0, y: 0, z: 130 }, 8, {
    stiffness: 800, damping: 8, breakStrain: 0.2,
  });
  for (let i = 0; i < 5000; i++) {
    w.step();
    for (const p of w.bodies) {
      assert.ok(Number.isFinite(p.pos.x) && Number.isFinite(p.pos.y) && Number.isFinite(p.pos.z),
        'position should be finite');
      assert.ok(Number.isFinite(p.vel.x) && Number.isFinite(p.vel.y) && Number.isFinite(p.vel.z),
        'velocity should be finite');
    }
  }
});

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
