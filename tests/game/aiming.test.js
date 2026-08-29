// tests/game/aiming.test.js — Phase 11 rebalanced input→launch mapping.
// Everything here is PURE (three.js-free, node-runnable): it drives
// js/game/aiming (mapping.js / evaluate.js) + the established guidance &
// trajectory layers, plus a full aim→guidance→release→sim→telemetry→score→
// mission-eval integration with the REAL physics world. Browser-only concerns
// (camera-drag isolation, pointercancel/blur cleanup, mobile layout) are
// verified headlessly by verify14/verify8_8000 — not re-runnable in node.
import assert from 'node:assert';
import { test } from '../physics/support.js';
import { BlackHoleWorld, createThrowTelemetry, TERMINATION } from '../../js/physics.js';
import { calculateGuidance } from '../../js/game/guidance/index.js';
import {
  AIM_MAPPING, aimToVelocity, aimFractions, dxForTangFrac, escapeDrag,
  evaluateAim, canEscape, canOrbit,
} from '../../js/game/aiming/index.js';
import { evaluateMission, getMission } from '../../js/game/missions/index.js';
import { calculateThrowScore } from '../../js/game/scoring/index.js';
import { CATALOG } from '../../js/objects.js';

const MU = 12.288e6;
const H = 40;
const SPAWN = { x: 0, y: 19.2, z: 384 }; // R ≈ 384.5
const vCirc = Math.sqrt(MU / Math.hypot(SPAWN.x, SPAWN.y, SPAWN.z));
const ESCAPE = Math.SQRT2 * vCirc;        // ≈ 252.8 → 1.414 vCirc
const stateAt = (dx, dy) => evaluateAim({ mu: MU, horizonRadius: H, pos: SPAWN, dx, dy }).state;

// ---- 1. determinism: same drag → bit-identical launch + prediction ----
test('determinism: same drag → bit-identical velocity and fractions', () => {
  const a = JSON.stringify(aimToVelocity({ mu: MU, pos: SPAWN, dx: 170, dy: 40 }));
  const b = JSON.stringify(aimToVelocity({ mu: MU, pos: SPAWN, dx: 170, dy: 40 }));
  assert.strictEqual(a, b);
  assert.strictEqual(JSON.stringify(aimFractions({ dx: 170, dy: 40 })),
    JSON.stringify(aimFractions({ dx: 170, dy: 40 })));
});

test('determinism: same aim state → bit-identical guidance', () => {
  const a = JSON.stringify(evaluateAim({ mu: MU, horizonRadius: H, pos: SPAWN, dx: 285, dy: 0 }));
  const b = JSON.stringify(evaluateAim({ mu: MU, horizonRadius: H, pos: SPAWN, dx: 285, dy: 0 }));
  assert.strictEqual(a, b);
});

// ---- 2. monotonic power ramp ----
test('monotonic: speed increases strictly with drag power (dx)', () => {
  let prev = -1;
  for (const dx of [-100, 0, 40, 100, 170, 240, 285, 340, 500]) {
    const v = aimToVelocity({ mu: MU, pos: SPAWN, dx: dx, dy: 0 });
    assert.ok(v.speed >= prev, `speed decreased at dx=${dx}: ${v.speed.toFixed(2)} < ${prev.toFixed(2)}`);
    prev = v.speed;
  }
});

// ---- 3. bounded extremes ----
test('bounded: low power stays deep-captured, max power is capped', () => {
  const low = stateAt(0, 0);
  assert.strictEqual(low, 'CAPTURED', `center drag state ${low}`);
  const lo = aimToVelocity({ mu: MU, pos: SPAWN, dx: 0, dy: 0 });
  assert.ok(lo.tangFrac >= AIM_MAPPING.tangMin - 1e-12);
  const hi = aimToVelocity({ mu: MU, pos: SPAWN, dx: 10000, dy: 0 });
  assert.ok(hi.tangFrac <= AIM_MAPPING.tangMax + 1e-12, `tangFrac ${hi.tangFrac}`);
  assert.ok(Math.abs(hi.tangFrac - AIM_MAPPING.tangMax) < 1e-9, 'saturates at max');
});

// ---- 4. direction mapping: drag → launch direction consistent ----
test('direction: dy>0 adds radial-inward (dive), dy<0 swings outward', () => {
  const dive = aimToVelocity({ mu: MU, pos: SPAWN, dx: 40, dy: 300 });
  const flat = aimToVelocity({ mu: MU, pos: SPAWN, dx: 40, dy: 0 });
  // toward the hole means the velocity has a bigger component along -radial
  const radUnit = {
    x: SPAWN.x / 384.5, y: SPAWN.y / 384.5, z: SPAWN.z / 384.5,
  };
  const dotRad = (v) => v.x * radUnit.x + v.y * radUnit.y + v.z * radUnit.z;
  assert.ok(dotRad(dive) < dotRad(flat), 'dive adds inward radial component');
});

// ---- 5. escape reachable + deterministic (11E) ----
test('escape: low power never escapes, threshold region predictable', () => {
  assert.notStrictEqual(stateAt(0, 0), 'ESCAPING', 'center drag is not escape');
  assert.notStrictEqual(stateAt(40, 130), 'ESCAPING', 'verify13 drag is not escape');
  assert.strictEqual(stateAt(285, 0), 'ESCAPING', 'escape-threshold drag escapes');
});

test('escape: high power + valid direction is ESCAPING and deterministic', () => {
  const g1 = evaluateAim({ mu: MU, horizonRadius: H, pos: SPAWN, dx: 340, dy: 0 });
  const g2 = evaluateAim({ mu: MU, horizonRadius: H, pos: SPAWN, dx: 340, dy: 0 });
  assert.strictEqual(g1.state, 'ESCAPING');
  assert.strictEqual(g2.state, 'ESCAPING');
  assert.ok(g1.launchSpeed > ESCAPE, `launch ${g1.launchSpeed.toFixed(1)} > escape ${ESCAPE.toFixed(1)}`);
  assert.ok(g1.velocityRatio > 1, `velocityRatio ${g1.velocityRatio.toFixed(3)}`);
});

test('escape: the drag for the escape threshold is a deliberate, high pull', () => {
  const e = escapeDrag();
  const g = evaluateAim({ mu: MU, horizonRadius: H, pos: SPAWN, dx: e.dx, dy: e.dy });
  assert.strictEqual(g.state, 'ESCAPING');
  assert.ok(e.dx > 200, `escapeDrag.dx=${e.dx.toFixed(1)} is a big pull`);
});

test('escape is really reachable in the full sim (not just the classifier)', () => {
  const world = new BlackHoleWorld({ mu: MU, horizonRadius: H, drag: 0.1 / 1.6, despawnRadius: 560 });
  CATALOG.find((o) => o.id === 'rock').build(world, { x: SPAWN.x, y: SPAWN.y, z: SPAWN.z }, 1);
  const v = aimToVelocity({ mu: MU, pos: SPAWN, dx: 340, dy: 0 });
  for (const p of world.bodies) { p.vel.x = v.x; p.vel.y = v.y; p.vel.z = v.z; }
  const tm = createThrowTelemetry({ world });
  let steps = 0;
  const t0 = world.time;
  while (world.time - t0 < 40 && world.aliveCount() > 0 && tm.consumedPointCount === 0) {
    world.step(); tm.recordStep(); steps++;
  }
  const fin = tm.finalizeThrow(tm.consumedPointCount > 0 ? TERMINATION.ALL_MASS_CONSUMED : TERMINATION.DESPAWN);
  assert.strictEqual(fin.trajectoryState, 'ESCAPING', `telemetry state was ${fin.trajectoryState}`);
  assert.strictEqual(fin.consumedPointCount, 0, 'never captured');
});

// ---- 6. orbit reachable (11F) ----
test('orbit: a precise tangential pull is ORBITAL in guidance', () => {
  const dx = dxForTangFrac(1.0);
  const g = evaluateAim({ mu: MU, horizonRadius: H, pos: SPAWN, dx: dx, dy: 0 });
  assert.strictEqual(g.state, 'ORBITAL', `state ${g.state}`);
  assert.ok(g.periapsis > H, `periapsis ${g.periapsis.toFixed(1)} above horizon`);
  assert.ok(Math.abs(g.closestApproach.distance - 384.5) < 60, `closest ~ orbit radius, got ${g.closestApproach.distance.toFixed(1)}`);
  assert.ok(Math.abs(dx) > 100 && Math.abs(dx) < 300, `orbit pull dx=${dx.toFixed(1)} is a deliberate mid-power drag`);
});

test('orbit: a bound orbit is reachable with the real sim (unconsumed reset)', () => {
  const world = new BlackHoleWorld({ mu: MU, horizonRadius: H, drag: 0.1 / 1.6, despawnRadius: 560 });
  CATALOG.find((o) => o.id === 'ship').build(world, { x: SPAWN.x, y: SPAWN.y, z: SPAWN.z }, 1);
  const v = aimToVelocity({ mu: MU, pos: SPAWN, dx: dxForTangFrac(1.0), dy: 0 });
  for (const p of world.bodies) { p.vel.x = v.x; p.vel.y = v.y; p.vel.z = v.z; }
  const tm = createThrowTelemetry({ world });
  const t0 = world.time;
  while (world.time - t0 < 3 && world.aliveCount() > 0 && tm.consumedPointCount === 0) {
    world.step(); tm.recordStep();
  }
  assert.strictEqual(tm.consumedPointCount, 0, 'not consumed in orbit');
  const fin = tm.finalizeThrow(TERMINATION.PLAYER_RESET);
  assert.strictEqual(fin.trajectoryState, 'ORBITAL', `telemetry state was ${fin.trajectoryState}`);
  assert.ok(fin.closestApproach.distance > H, `closest ${fin.closestApproach.distance.toFixed(1)} > horizon`);
});

// ---- 7. guidance === real launch state (11D) ----
test('guidance semantics: predicted vel === real launch vel for the same drag', () => {
  for (const [dx, dy] of [[40, 130], [170, 0], [340, 0], [285, 0], [-100, 200]]) {
    const m = aimToVelocity({ mu: MU, pos: SPAWN, dx, dy });
    const g = calculateGuidance({
      mu: MU, horizonRadius: H,
      pos: { x: SPAWN.x, y: SPAWN.y, z: SPAWN.z },
      vel: { x: m.x, y: m.y, z: m.z },
    });
    assert.ok(Math.abs(g.launchSpeed - m.speed) < 1e-6, `launch speed ${dx},${dy}`);
  }
});

// ---- 8. no input mutation ----
test('no mutation: mapping never alters the aim object or spawn pos', () => {
  const aim = { dx: 170, dy: 40 };
  const pos = { ...SPAWN };
  const snap = JSON.stringify({ aim, pos });
  aimToVelocity({ mu: MU, pos, dx: aim.dx, dy: aim.dy });
  evaluateAim({ mu: MU, horizonRadius: H, pos, dx: aim.dx, dy: aim.dy });
  assert.strictEqual(JSON.stringify({ aim, pos }), snap);
});

// ---- 9. no world mutation from prediction ----
test('no mutation: guidance/evaluate never touch a live world', () => {
  const world = new BlackHoleWorld({ mu: MU, horizonRadius: H, drag: 0.1 });
  world.addPoint(SPAWN, 5, 2);
  const before = JSON.stringify(world.bodies);
  evaluateAim({ mu: MU, horizonRadius: H, pos: SPAWN, dx: 285, dy: 0 });
  assert.strictEqual(JSON.stringify(world.bodies), before, 'world untouched');
  assert.strictEqual(world.time, 0);
});

// ---- 10. desktop/mobile equivalence (pure model is viewport-free) ----
test('mobile parity: the mapping is viewport-independent — same drag, same launch', () => {
  // On both devices the input layer accumulates the same (dx,dy) units; the pure
  // mapping cannot know or care about pixel sizes, so both produce identical
  // velocities and a full-width gesture reaches escape (see escapeDrag).
  const a = aimToVelocity({ mu: MU, pos: SPAWN, dx: 340, dy: 0 });
  const b = aimToVelocity({ mu: MU, pos: SPAWN, dx: 340, dy: 0 });
  assert.strictEqual(JSON.stringify(a), JSON.stringify(b));
  const e = escapeDrag();
  assert.strictEqual(evaluateAim({ mu: MU, horizonRadius: H, pos: SPAWN, dx: e.dx, dy: e.dy }).state, 'ESCAPING');
});

// ---- 11. power helpers ----
test('dxForTangFrac is a faithful inverse of the tangential ramp', () => {
  for (const f of [0.35, 0.5, 0.8, 1.0, 1.4142, 1.62]) {
    const dx = dxForTangFrac(f);
    const m = aimToVelocity({ mu: MU, pos: SPAWN, dx, dy: 0 });
    assert.ok(Math.abs(m.tangFrac - f) < 1e-6, `tangFrac ${m.tangFrac.toFixed(4)} ≈ ${f}`);
  }
});

// ---- 13. full integration: aim → guidance → release → sim → telemetry →
//          score → mission evaluation, within documented tolerance ----
test('integration: a near-horizon drag completes Touch the Edge via the real sim', () => {
  const world = new BlackHoleWorld({ mu: MU, horizonRadius: H, drag: 0.1 / 1.6, despawnRadius: 560 });
  CATALOG.find((o) => o.id === 'human').build(world, { x: SPAWN.x, y: SPAWN.y, z: SPAWN.z }, 1);
  const v = aimToVelocity({ mu: MU, pos: SPAWN, dx: 40, dy: 130 });
  for (const p of world.bodies) { p.vel.x = v.x; p.vel.y = v.y; p.vel.z = v.z; }
  const tm = createThrowTelemetry({ world });
  const t0 = world.time;
  while (world.time - t0 < 40 && world.aliveCount() > 0) {
    world.step(); tm.recordStep();
  }
  const fin = tm.finalizeThrow(tm.consumedPointCount > 0
    ? (tm.consumedPointCount >= tm.initialPointCount ? TERMINATION.ALL_MASS_CONSUMED : TERMINATION.HORIZON)
    : TERMINATION.DESPAWN);
  const score = calculateThrowScore(fin);
  const mission = getMission('near-horizon-01');
  const r = evaluateMission(mission, { telemetry: fin, score });
  assert.ok(fin.closestApproach.distance <= 60, `closest ${fin.closestApproach.distance.toFixed(1)} ≤ 1.5×40`);
  assert.strictEqual(r.completed, true, `near-horizon mission: ${r.reason}`);
});

test('integration: the escape drag completes Break Free via the real sim', () => {
  const world = new BlackHoleWorld({ mu: MU, horizonRadius: H, drag: 0.1 / 1.6, despawnRadius: 560 });
  CATALOG.find((o) => o.id === 'rock').build(world, { x: SPAWN.x, y: SPAWN.y, z: SPAWN.z }, 1);
  const v = aimToVelocity({ mu: MU, pos: SPAWN, dx: 340, dy: 0 });
  for (const p of world.bodies) { p.vel.x = v.x; p.vel.y = v.y; p.vel.z = v.z; }
  const tm = createThrowTelemetry({ world });
  const t0 = world.time;
  while (world.time - t0 < 40 && world.aliveCount() > 0 && tm.consumedPointCount === 0) {
    world.step(); tm.recordStep();
  }
  const fin = tm.finalizeThrow(tm.consumedPointCount > 0 ? TERMINATION.ALL_MASS_CONSUMED : TERMINATION.DESPAWN);
  const score = calculateThrowScore(fin);
  const mission = getMission('escape-01');
  const r = evaluateMission(mission, { telemetry: fin, score });
  assert.strictEqual(r.completed, true, `escape mission: ${r.reason} (state ${fin.trajectoryState})`);
});

test('integration: completing a simulated orbit via PLAYER_RESET completes Find the Orbit', () => {
  const world = new BlackHoleWorld({ mu: MU, horizonRadius: H, drag: 0.1 / 1.6, despawnRadius: 560 });
  CATALOG.find((o) => o.id === 'ship').build(world, { x: SPAWN.x, y: SPAWN.y, z: SPAWN.z }, 1);
  const v = aimToVelocity({ mu: MU, pos: SPAWN, dx: dxForTangFrac(1.0), dy: 0 });
  for (const p of world.bodies) { p.vel.x = v.x; p.vel.y = v.y; p.vel.z = v.z; }
  const tm = createThrowTelemetry({ world });
  const t0 = world.time;
  while (world.time - t0 < 3 && world.aliveCount() > 0 && tm.consumedPointCount === 0) {
    world.step(); tm.recordStep();
  }
  const fin = tm.finalizeThrow(TERMINATION.PLAYER_RESET);
  const score = calculateThrowScore(fin);
  const mission = getMission('orbit-01');
  const r = evaluateMission(mission, { telemetry: fin, score });
  assert.strictEqual(fin.trajectoryState, 'ORBITAL', `telemetry state ${fin.trajectoryState}`);
  assert.strictEqual(r.completed, true, `orbit mission: ${r.reason} (state ${fin.trajectoryState})`);
});

// ----------------------------------------------------------- Phase 24 balance ---
test('Phase 24: Break Free is reachable on a 360px viewport (drag ~dx 324 → ESCAPING)', () => {
  // tangMax 1.62 left a full-width 360px drag (~dx 324) ~0.015 tangFrac short of
  // the real-sim escape threshold (~1.587), making BREAK FREE impossible on 360×800.
  // tangMax 1.65 lifts the envelope so dx 324 clears real-sim escape for all objects.
  for (const id of ['rock', 'human', 'ship', 'planet']) {
    const world = new BlackHoleWorld({ mu: MU, horizonRadius: H, drag: 0.1 / 1.6, despawnRadius: 560 });
    CATALOG.find((o) => o.id === id).build(world, { x: SPAWN.x, y: SPAWN.y, z: SPAWN.z }, 1);
    const v = aimToVelocity({ mu: MU, pos: SPAWN, dx: 324, dy: 0 });
    for (const p of world.bodies) { p.vel.x = v.x; p.vel.y = v.y; p.vel.z = v.z; }
    const tm = createThrowTelemetry({ world });
    const t0 = world.time;
    while (world.time - t0 < 40 && world.aliveCount() > 0 && tm.consumedPointCount === 0) {
      world.step(); tm.recordStep();
    }
    const fin = tm.finalizeThrow(tm.consumedPointCount > 0 ? TERMINATION.ALL_MASS_CONSUMED : TERMINATION.DESPAWN);
    assert.strictEqual(fin.trajectoryState, 'ESCAPING', `dx=324 ${id} should now escape, got ${fin.trajectoryState}`);
    assert.strictEqual(fin.consumedPointCount, 0, `${id} consumed while escaping`);
    const mission = getMission('escape-01');
    assert.strictEqual(evaluateMission(mission, { telemetry: fin, score: calculateThrowScore(fin) }).completed, true, 'Break Free completes');
  }
});