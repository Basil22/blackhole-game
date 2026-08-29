// tests/game/guidance.test.js — the pure trajectory-guidance layer. No THREE,
// no DOM, no live world: every assertion runs against calculateGuidance output
// for a plain launch state, the same way the aim screen synthesizes one.
import assert from 'node:assert';
import { test } from '../physics/support.js';
import { BlackHoleWorld } from '../../js/physics.js';
import { calculateGuidance, launchChanged, GUIDANCE_DEFAULTS } from '../../js/game/guidance/index.js';

const MU = 12.288e6;
const H = 40;
const SPAWN = { x: 0, y: 19.2, z: 384 }; // R ≈ 384.5
const vCirc = Math.sqrt(MU / Math.hypot(...Object.values(SPAWN))); // ≈ 178.8

test('radial throw: prediction approaches the horizon into a capture', () => {
  const g = calculateGuidance({ mu: MU, horizonRadius: H, pos: SPAWN, vel: { x: 0, y: 0, z: -160 } });
  assert.ok(g.state === 'HORIZON_CROSSING' || g.state === 'CAPTURED', `state ${g.state}`);
  assert.ok(g.closestApproach.distance < 80, `closest ${g.closestApproach.distance}`);
  assert.ok(g.samples[1].position.z < SPAWN.z, 'first sample after t=0 moves toward the hole');
  const last = g.samples[g.samples.length - 1];
  assert.ok(Math.hypot(last.position.x, last.position.y, last.position.z) <
    Math.hypot(g.samples[0].position.x, g.samples[0].position.y, g.samples[0].position.z),
  'final sample is nearer the hole than the origin');
});

test('high-energy throw: prediction escapes', () => {
  const g = calculateGuidance({ mu: MU, horizonRadius: H, pos: SPAWN, vel: { x: 0, y: 0, z: 700 } });
  assert.strictEqual(g.state, 'ESCAPING');
  assert.ok(g.velocityRatio > 1, `velocityRatio ${g.velocityRatio}`);
  assert.ok(g.escapeVelocity > 0 && Number.isFinite(g.escapeVelocity));
  const last = g.samples[g.samples.length - 1];
  assert.ok(last.position.z > g.samples[0].position.z, 'extends outward');
});

test('tangential (circular) throw: path curves and reaches closest midway', () => {
  // exact circular orbit speed perpendicular to the radial direction
  const radial = { x: SPAWN.x / 384.5, y: SPAWN.y / 384.5, z: SPAWN.z / 384.5 };
  const tang = { x: -radial.z, y: 0, z: radial.x }; // = (1, 0, 0)-ish
  const g = calculateGuidance({ mu: MU, horizonRadius: H, pos: SPAWN, vel: { x: tang.x * vCirc, y: 0, z: tang.z * vCirc } });
  assert.ok(g.samples.length > 20, `samples ${g.samples.length}`);
  // closest approach must happen mid-flight, not at t=0 (it curves)
  assert.ok(g.closestApproach.time > 2, `closest at t=${g.closestApproach.time.toFixed(2)}`);
  // arc: azimuth changes along the path
  const azi = (p) => Math.atan2(p.z, p.x);
  const first = azi(g.samples[0].position);
  let maxTurn = 0;
  for (const s of g.samples) {
    let d = Math.abs(azi(s.position) - first);
    if (d > Math.PI) d = 2 * Math.PI - d;
    if (d > maxTurn) maxTurn = d;
  }
  assert.ok(maxTurn > 0.3, `path turns ${(maxTurn * 180 / Math.PI).toFixed(1)}°`);
});

test('bound (circular) throw: prediction classifies ORBITAL', () => {
  const radial = { x: SPAWN.x / 384.5, y: SPAWN.y / 384.5, z: SPAWN.z / 384.5 };
  const tang = { x: -radial.z, y: 0, z: radial.x };
  const g = calculateGuidance({ mu: MU, horizonRadius: H, pos: SPAWN, vel: { x: tang.x * vCirc, y: 0, z: tang.z * vCirc } });
  assert.strictEqual(g.state, 'ORBITAL');
  assert.ok(g.periapsis > H, `periapsis ${g.periapsis} above horizon`);
  assert.ok(Math.abs(g.closestApproach.distance - 384.5) < 15, `closest ~= orbit radius, got ${g.closestApproach.distance}`);
});

test('determinism: same launch state → bit-identical guidance', () => {
  const a = JSON.stringify(calculateGuidance({ mu: MU, horizonRadius: H, pos: SPAWN, vel: { x: 60, y: 0, z: -140 } }));
  const b = JSON.stringify(calculateGuidance({ mu: MU, horizonRadius: H, pos: SPAWN, vel: { x: 60, y: 0, z: -140 } }));
  assert.strictEqual(a, b);
});

test('no mutation: guidance never alters its inputs (plain vectors)', () => {
  const pos = { x: SPAWN.x, y: SPAWN.y, z: SPAWN.z };
  const vel = { x: 48, y: 4, z: -160 };
  const snapshot = JSON.stringify({ pos, vel });
  calculateGuidance({ mu: MU, horizonRadius: H, pos, vel });
  assert.strictEqual(JSON.stringify({ pos, vel }), snapshot, 'inputs untouched');
});

test('no mutation: guidance ignores + never touches a live world', () => {
  const world = new BlackHoleWorld({ mu: MU, horizonRadius: H, drag: 0.1 });
  world.addPoint(SPAWN, 5, 2);
  world.bodies[0].vel = { x: 0, y: 0, z: -140 };
  const before = JSON.stringify(world.bodies);
  const g = calculateGuidance({ mu: world.mu, horizonRadius: world.horizonRadius, pos: SPAWN, vel: world.bodies[0].vel });
  assert.ok(Array.isArray(g.samples));
  assert.strictEqual(JSON.stringify(world.bodies), before, 'live bodies untouched');
  assert.strictEqual(world.time, 0, 'world time untouched');
});

test('sample cap: huge duration cannot create an unbounded number of samples', () => {
  const g = calculateGuidance({ mu: MU, horizonRadius: H, pos: SPAWN, vel: { x: 60, y: 0, z: -140 } }, { duration: 7200 });
  assert.ok(g.samples.length <= GUIDANCE_DEFAULTS.maximumSamples,
    `${g.samples.length} <= ${GUIDANCE_DEFAULTS.maximumSamples}`);
  assert.strictEqual(g.samples.length, g.count);
  assert.strictEqual(g.truncated, true);
  assert.ok(g.count > 1);
});

test('launchChanged throttle: same velocity → false, changed → true', () => {
  const v = { x: 60, y: 0, z: -140 };
  assert.strictEqual(launchChanged(null, v), true, 'first call always recomputes');
  assert.strictEqual(launchChanged({ ...v }, { ...v }), false, 'unchanged → no recompute');
  assert.strictEqual(launchChanged({ x: 120, y: 0, z: -140 }, v), true, 'direction changed enough');
  assert.strictEqual(launchChanged({ x: 60, y: 0, z: -200 }, v), true, 'speed changed enough');
  assert.strictEqual(launchChanged({ x: 60, y: 0, z: -140.5 }, v), false, 'tiny change → no recompute');
});