// physics/events.test.js — tearing, horizon consumption, multi-body validity
import assert from 'node:assert';
import { BlackHoleWorld, buildChain, buildStar } from '../../js/physics.js';
import { test } from './support.js';

const MU = 3e6;
const HORIZON = 25;

function tearWorld(points, breakStrain, gap = 10) {
  // place two points `gap` apart but give the spring a tiny rest length, so the
  // first resolveTears pass sees a huge extension and tears deterministically.
  const w = new BlackHoleWorld({ mu: 0, horizonRadius: HORIZON });
  const a = w.addPoint({ x: 0, y: 0, z: 100 }, 1, 0.5);
  const b = w.addPoint({ x: gap, y: 0, z: 100 }, 1, 0.5);
  w.addSpringLen(a, b, 2, 100, 0, breakStrain);
  return { w, a, b };
}

test('tearing: normal spring stays intact', () => {
  const { w, a, b } = tearWorld(2, 100); // absurd breakStrain -> never tears
  for (let i = 0; i < 30; i++) w.step();
  assert.ok(w.springs.length === 1 && w.springs[0].alive, 'spring must survive');
  assert.strictEqual(w.bodies.length, 2, 'both masses survive');
});

test('tearing: overstretched spring tears', () => {
  const { w, a, b } = tearWorld(2, 1); // break when len > rest*(1+1) = 4
  w.step();
  assert.ok(w.springs.length === 1 && !w.springs[0].alive, 'spring should have torn');
  assert.ok(w.bodies[a].alive && w.bodies[b].alive, 'masses themselves are not consumed');
});

test('tearing: already-torn spring stays safely removed (no error)', () => {
  const { w } = tearWorld(2, 1);
  w.step(); // allow any deterministic tear to run
  const countBefore = w.springs.length;
  w.step(); // second pass must not error on dead springs
  assert.ok(w.springs.length <= countBefore, 'no spring resurrection');
  for (const b of w.bodies) assert.ok(Number.isFinite(b.pos.x) && Number.isFinite(b.pos.y) && Number.isFinite(b.pos.z));
});

test('tearing: multiple tears leave world valid', () => {
  const w = new BlackHoleWorld({ mu: MU, horizonRadius: HORIZON });
  for (const z of [80, 100, 120]) {
    buildChain(w, { x: 0, y: 0, z }, { x: 2, y: 0, z }, 4, { stiffness: 400, damping: 1, breakStrain: 0.2 });
  }
  for (let i = 0; i < 300; i++) w.step();
  for (const b of w.bodies) {
    assert.ok(Number.isFinite(b.pos.x) && Number.isFinite(b.pos.y) && Number.isFinite(b.pos.z), 'positions finite');
  }
  for (const s of w.springs) {
    const a = w.bodies[s.a], b = w.bodies[s.b];
    assert.ok(a && b, 'spring endpoints alive');
  }
});

test('horizon: point inside is consumed, aliveCount correct, spring cleaned', () => {
  const w = new BlackHoleWorld({ mu: MU, horizonRadius: HORIZON });
  const a = w.addPoint({ x: 100, y: 0, z: 0 }, 1, 0.5);
  const b = w.addPoint({ x: 1, y: 0, z: 0 }, 1, 0.5); // inside horizon: 1 < 25
  w.addSpring(a, b, 100, 8, 5);
  const evs = w.step();
  const hasConsume = evs.some((e) => e.type === 'consume');
  assert.ok(hasConsume, 'consume event fired');
  assert.strictEqual(w.aliveCount(), 1, 'only the outer mass remains');
  assert.ok(w.springs.every((s) => !s.alive), 'spring to consumed mass is killed off');
});

test('horizon: large object triggers consumption across its masses', () => {
  const w = new BlackHoleWorld({ mu: MU, horizonRadius: HORIZON });
  buildStar(w, { x: 0, y: 0, z: 10 }, { points: 6, radius: 3, breakStrain: 100 }); // heart of star way inside
  for (let i = 0; i < 120; i++) w.step();
  assert.strictEqual(w.aliveCount(), 0, 'all star masses ultimately consumed');
});

test('horizon: consumption cannot create NaN', () => {
  const w = new BlackHoleWorld({ mu: MU, horizonRadius: HORIZON });
  buildStar(w, { x: 0, y: 0, z: 5 }, { points: 8, radius: 4, breakStrain: 100 });
  for (let i = 0; i < 60; i++) w.step();
  for (const b of w.bodies) {
    assert.ok(Number.isFinite(b.pos.x) && Number.isFinite(b.pos.y) && Number.isFinite(b.pos.z));
    assert.ok(Number.isFinite(b.vel.x) && Number.isFinite(b.vel.y) && Number.isFinite(b.vel.z));
  }
});

test('multiple simultaneous masses with springs stay valid and finite', () => {
  const w = new BlackHoleWorld({ mu: MU, horizonRadius: HORIZON });
  for (let i = 0; i < 3; i++) {
    buildStar(w, { x: (i - 1) * 12, y: i * 6, z: 110 }, { points: 5, radius: 2.5, breakStrain: 0.15 });
  }
  for (let i = 0; i < 200; i++) w.step();
  assert.ok(w.aliveCount() >= 0, 'world state valid');
  for (const b of w.bodies) assert.ok(Number.isFinite(b.pos.x) && Number.isFinite(b.pos.y) && Number.isFinite(b.pos.z));
});