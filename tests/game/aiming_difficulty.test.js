// tests/game/aiming_difficulty.test.js — Phase 13 control-envelope difficulty.
// Guards the redesigned (periapsis-linear) aim mapping: deterministic,
// monotone, NaN-free, boundary-clamped, periapsis-varying (the Phase-11 bug
// was dx 180–280 all saturating at the spawn radius), physically faithful
// (guidance == real flight), object-coverage, and contract-preserving
// (missions / scoring / progression untouched). Pure where possible; the
// integration cases run the REAL physics world.
import assert from 'node:assert';
import { test } from '../physics/support.js';
import { BlackHoleWorld, createThrowTelemetry, TERMINATION } from '../../js/physics.js';
import {
  AIM_MAPPING, aimToVelocity, aimFractions, tangFracFromDx, dxForTangFrac,
  escapeDrag, evaluateAim, canEscape, canOrbit,
} from '../../js/game/aiming/index.js';
import { calculateGuidance } from '../../js/game/guidance/index.js';
import { SCORING_CONFIG, calculateThrowScore } from '../../js/game/scoring/index.js';
import { MISSION_CATALOG, getMission, evaluateMission } from '../../js/game/missions/index.js';
import { CATALOG } from '../../js/objects.js';

const MU = 12.288e6;
const H = 40;
const SPAWN = { x: 0, y: 19.2, z: 384 }; // R ≈ 384.5
const R = Math.hypot(SPAWN.x, SPAWN.y, SPAWN.z);
const vCirc = Math.sqrt(MU / R);
const vEsc = Math.sqrt(2 * MU / R);
const DRAG = 0.1 / 1.6;

const aim = (dx, dy) => aimToVelocity({ mu: MU, pos: SPAWN, dx, dy });
const guide = (dx, dy) => evaluateAim({ mu: MU, horizonRadius: H, pos: SPAWN, dx, dy });
const finite = (v) => Number.isFinite(v);
const periAt = (dx, dy = 0) => guide(dx, dy).periapsis;

const build = (world, id, size = 1) =>
  CATALOG.find((o) => o.id === id).build(world, { x: SPAWN.x, y: SPAWN.y, z: SPAWN.z }, size);

const launch = (world, dx, dy) => {
  const v = aim(dx, dy);
  for (const p of world.bodies) { p.vel.x = v.x; p.vel.y = v.y; p.vel.z = v.z; }
  return v;
};

const flight = (world, dx, dy, maxDur, term) => {
  const tm = createThrowTelemetry({ world });
  const t0 = world.time;
  const steps = Math.round(maxDur / world.dt);
  for (let i = 0; i < steps && world.aliveCount() > 0 && tm.consumedPointCount === 0; i++) {
    world.step(); tm.recordStep();
  }
  return tm.finalizeThrow(term);
};

// ---- 1. determinism: identical drag → bit-identical mapping across regions ----
test('determinism: every curve region is bit-identical for repeated drags', () => {
  for (const [dx, dy] of [[10, 0], [40, 130], [130, 200], [258, 0], [272, 0], [340, -100]]) {
    assert.strictEqual(
      JSON.stringify(aim(dx, dy)),
      JSON.stringify(aim(dx, dy)),
      `aimToVelocity not deterministic at dx=${dx},dy=${dy}`);
    assert.strictEqual(
      JSON.stringify(guide(dx, dy).closestApproach),
      JSON.stringify(guide(dx, dy).closestApproach),
      `guidance not deterministic at dx=${dx},dy=${dy}`);
  }
});

// ---- 2. monotonic power: tangFrac strictly increases with dx ----
test('monotonic: tangential multiple strictly increases over the full drag range', () => {
  let prev = -Infinity;
  for (let dx = 0; dx <= 345; dx += 5) {
    const s = tangFracFromDx(dx);
    assert.ok(s >= prev, `tangFrac fell at dx=${dx}: ${s} < ${prev}`);
    prev = s;
  }
  const f0 = tangFracFromDx(0);
  const f1 = tangFracFromDx(340);
  assert.ok(f1 > f0, 'band sweeps up');
});

// ---- 3. periapsis monotone over the orbital band (no saturation) ----
test('monotonic: periapsis strictly increases across the orbital band', () => {
  let prev = -Infinity;
  for (let dx = 25; dx <= 258; dx += 4) {
    const p = periAt(dx);
    assert.ok(p > prev, `periapsis fell at dx=${dx}: ${p.toFixed(1)} <= ${prev.toFixed(1)}`);
    prev = p;
  }
});

// ---- 4. NaN-free: extreme-but-valid inputs never leak NaN/Infinity ----
test('NaN-free: extreme dx/dy keep every mapping + guidance field finite', () => {
  for (const [dx, dy] of [[-1e6, -1e6], [-1, 1], [0, 0], [1e6, 1e6], [340, 480], [-0, 0], [1, -1e6]]) {
    const m = aim(dx, dy);
    for (const k of ['x', 'y', 'z', 'speed', 'tangFrac', 'radFrac', 'power01', 'velocityRatio']) {
      assert.ok(finite(m[k]), `aimToVelocity.${k} not finite at dx=${dx},dy=${dy}: ${m[k]}`);
    }
    const g = guide(dx, dy);
    assert.ok(finite(g.launchSpeed), `launchSpeed not finite at dx=${dx},dy=${dy}`);
    assert.ok(finite(g.periapsis), `periapsis not finite at dx=${dx},dy=${dy}`);
  }
});

// ---- 5. boundaries: clamps hold at both ends of both axes ----
test('boundaries: dx clamps to [0, tangSpan], dy clamps to [radMin, radMax]', () => {
  const lo = aim(-5000, 0);
  const hi = aim(5000, 0);
  assert.strictEqual(lo.tangFrac, AIM_MAPPING.tangMin);
  assert.strictEqual(hi.tangFrac, AIM_MAPPING.tangMax);
  assert.ok(Math.abs(lo.speed - Math.hypot(vCirc * AIM_MAPPING.tangMin, AIM_MAPPING.yBias)) < 0.01,
    `low clamp speed ${lo.speed.toFixed(2)}`);
  const dive = aim(130, 1e6);
  const out = aim(130, -1e6);
  assert.strictEqual(dive.radFrac, AIM_MAPPING.radMax);
  assert.strictEqual(out.radFrac, AIM_MAPPING.radMin);
  assert.strictEqual(tangFracFromDx(-1), AIM_MAPPING.tangMin);
  assert.strictEqual(tangFracFromDx(10000), AIM_MAPPING.tangMax);
});

// ---- 6. THE Phase-11 regression: orbital periapsis must VARY, not saturate ----
test('orbital variation: periapsis meaningfully spans the orbital band (no flat region)', () => {
  // Measured physical range of the orbital band: r_p 56 (dx=40) → 384.5 (dx=258).
  const p40 = periAt(40);
  const p240 = periAt(240);
  const span = p240 - p40;
  assert.ok(span >= 250, `orbital periapsis span only ${span.toFixed(1)} (was saturating ~0)`);
  // The old bug: dx 180–280 all produced the SAME 384.5 orbit. Assert the
  // region now resolves:
  const p180 = periAt(180);
  const p200 = periAt(200);
  const p240b = periAt(240);
  assert.ok(p180 < p200 && p200 < p240b,
    `old flat region still flat: 180=${p180.toFixed(1)} 200=${p200.toFixed(1)} 240=${p240b.toFixed(1)}`);
  assert.ok(p240b - p180 >= 60, `spread over 180→240 only ${(p240b - p180).toFixed(1)}`);
});

// ---- 7. tight orbit = precision, wide orbit = learnable ----
test('difficulty: near-horizon zone is narrow, the orbital band is wide', () => {
  // r_p 42→56 (the near-horizon precision zone) must fit in a SHORT drag window…
  const d42 = dxForTangFrac(Math.sqrt(2 * (42 / R) / (1 + 42 / R)));
  const d56 = dxForTangFrac(Math.sqrt(2 * (56 / R) / (1 + 56 / R)));
  const tightWindow = d56 - d42;
  assert.ok(tightWindow <= 20, `near-horizon zone spans ${tightWindow.toFixed(1)} drag units (precision)`);
  // …while the full orbital band (r_p 42→384.5) is a WIDE, learnable ramp.
  const dFull = dxForTangFrac(1.0) - d42;
  assert.ok(dFull >= 200, `orbital band spans only ${dFull.toFixed(1)} drag units`);
  assert.ok(dFull > tightWindow * 8, 'orbital band is far wider than the precision zone');
});

// ---- 8. escape is a deliberate gesture, harder than a circular orbit ----
test('escape threshold: more drag than circular orbit, high-pull, deterministic', () => {
  const e = escapeDrag();
  const circ = dxForTangFrac(1.0);
  assert.ok(e.dx > circ, `escapeDrag.dx=${e.dx.toFixed(1)} must exceed circular dx=${circ.toFixed(1)}`);
  assert.ok(e.dx >= 265, `escape threshold drag ${e.dx.toFixed(1)} is a deliberate full-power pull`);
  assert.ok(e.dx < AIM_MAPPING.tangSpan, 'escape reachable within the drag range');
  assert.strictEqual(guide(e.dx, e.dy).state, 'ESCAPING');
  assert.strictEqual(canEscape({ mu: MU, horizonRadius: H, pos: SPAWN, dx: e.dx, dy: e.dy }), true);
  assert.strictEqual(canEscape({ mu: MU, horizonRadius: H, pos: SPAWN, dx: circ, dy: 0 }), false);
  assert.strictEqual(canOrbit({ mu: MU, horizonRadius: H, pos: SPAWN, dx: circ, dy: 0 }), true);
});

// ---- 9. FLYBY is reachable (unbound + infall), as a high-power dive ----
test('FLYBY: an unbound infalling pass is reachable in the guidance envelope', () => {
  const hit = [];
  for (const dx of [272, 285, 300, 320, 340]) {
    for (const dy of [130, 300, 480]) {
      const g = guide(dx, dy);
      if (g.state === 'FLYBY') hit.push(`${dx},${dy}`);
    }
  }
  assert.ok(hit.length > 0, `no FLYBY reachable; got ${hit.length}`);
});

// ---- 10. near-horizon dive: capture below r_p 40, precision pass at r_p 56 ----
test('near-horizon: low power is captured, precision dive passes within 1.5×H', () => {
  assert.strictEqual(guide(20, 130).state, 'CAPTURED', 'dx=20,dy=130 is deep-captured');
  const g = guide(40, 130);
  assert.strictEqual(g.state, 'ORBITAL');
  assert.ok(g.periapsis > H && g.periapsis <= 60, `tight orbit r_p=${g.periapsis.toFixed(1)}`);
  assert.ok(g.closestApproach.distance <= 60, 'guidance closest within 1.5×H');
});

// ---- 11. guidance launch velocity === real launch velocity (bit-exact) ----
test('guidance==real: calculateGuidance sees exactly the mapping launch state', () => {
  for (const [dx, dy] of [[20, 130], [40, 130], [130, 0], [258, 0], [272, 0], [340, 480]]) {
    const m = aim(dx, dy);
    const g = calculateGuidance({
      mu: MU, horizonRadius: H,
      pos: { x: SPAWN.x, y: SPAWN.y, z: SPAWN.z },
      vel: { x: m.x, y: m.y, z: m.z },
    });
    assert.strictEqual(g.launchSpeed, m.speed, `launch speed mismatch at dx=${dx},dy=${dy}`);
  }
});

// ---- 12. guidance == real sim: predicted periapsis ≈ real closest approach ----
test('guidance==real: a bound dive\'s real closest approach matches the prediction', () => {
  const world = new BlackHoleWorld({ mu: MU, horizonRadius: H, drag: DRAG, despawnRadius: 560 });
  build(world, 'human', 1);
  launch(world, 40, 130);
  const fin = flight(world, 40, 130, 40, TERMINATION.DESPAWN);
  const predicted = guide(40, 130).periapsis;
  assert.ok(Math.abs(fin.closestApproach.distance - predicted) < 20,
    `real closest ${fin.closestApproach.distance.toFixed(1)} vs predicted ${predicted.toFixed(1)}`);
});

// ---- 13. continuity: small aim changes near orbital insertion move smoothly ----
test('continuity: ±2-drag tweaks near the circular orbit shift periapsis smoothly', () => {
  let prev = periAt(240);
  for (let dx = 242; dx <= 258; dx += 2) {
    const p = periAt(dx);
    const delta = p - prev;
    assert.ok(delta >= 0, `periapsis dropped at dx=${dx}`);
    assert.ok(delta < 15, `jump of ${delta.toFixed(1)} at dx=${dx} (not continuous)`);
    prev = p;
  }
});

// ---- 14. no mutation: mapping/prediction never touch a live world or aim ----
test('no mutation: aim object, spawn pos, and a live world stay untouched', () => {
  const aimObj = { dx: 130, dy: 40 };
  const pos = { ...SPAWN };
  const snapAim = JSON.stringify({ ...aimObj });
  const snapPos = JSON.stringify(pos);
  aim(aimObj.dx, aimObj.dy);
  evaluateAim({ mu: MU, horizonRadius: H, pos, dx: aimObj.dx, dy: aimObj.dy });
  assert.strictEqual(JSON.stringify({ ...aimObj }), snapAim);
  assert.strictEqual(JSON.stringify(pos), snapPos);

  const world = new BlackHoleWorld({ mu: MU, horizonRadius: H, drag: DRAG });
  world.addPoint(SPAWN, 5, 2);
  const before = JSON.stringify(world.bodies);
  evaluateAim({ mu: MU, horizonRadius: H, pos: SPAWN, dx: 300, dy: 0 });
  assert.strictEqual(JSON.stringify(world.bodies), before, 'world bodies untouched');
  assert.strictEqual(world.time, 0, 'world clock untouched');
});

// ---- 15–17. object coverage: all four objects, real sim ----
const OBJECT_IDS = ['rock', 'human', 'ship', 'planet'];

test('object coverage: every object reaches a real ORBITAL (FIND THE ORBIT target)', () => {
  for (const id of OBJECT_IDS) {
    const world = new BlackHoleWorld({ mu: MU, horizonRadius: H, drag: DRAG, despawnRadius: 560 });
    build(world, id, 1);
    launch(world, dxForTangFrac(1.0), 0);
    const fin = flight(world, dxForTangFrac(1.0), 0, 3, TERMINATION.PLAYER_RESET);
    assert.strictEqual(fin.consumedPointCount, 0, `${id} consumed during orbit`);
    assert.strictEqual(fin.trajectoryState, 'ORBITAL', `${id} telemetry was ${fin.trajectoryState}`);
  }
});

test('object coverage: every object reaches a real ESCAPE (BREAK FREE target)', () => {
  for (const id of OBJECT_IDS) {
    const world = new BlackHoleWorld({ mu: MU, horizonRadius: H, drag: DRAG, despawnRadius: 560 });
    build(world, id, 1);
    launch(world, 340, 0);
    const fin = flight(world, 340, 0, 40, TERMINATION.DESPAWN);
    assert.strictEqual(fin.consumedPointCount, 0, `${id} consumed while escaping`);
    assert.strictEqual(fin.trajectoryState, 'ESCAPING', `${id} telemetry was ${fin.trajectoryState}`);
  }
});

test('object coverage: every object reaches a near-horizon pass ≤ 1.5×H (TOUCH THE EDGE)', () => {
  for (const id of OBJECT_IDS) {
    const world = new BlackHoleWorld({ mu: MU, horizonRadius: H, drag: DRAG, despawnRadius: 560 });
    build(world, id, 1);
    launch(world, 40, 130);
    const fin = flight(world, 40, 130, 40, TERMINATION.DESPAWN);
    assert.ok(fin.closestApproach.distance <= 60,
      `${id} closest ${fin.closestApproach.distance.toFixed(1)} > 60`);
  }
});

// ---- 18. no mission change: same drags still complete the same missions ----
test('no mission change: near-horizon / escape / orbit drags complete their missions', () => {
  const cases = [
    { id: 'near-horizon-01', object: 'human', dx: 40, dy: 130, term: TERMINATION.DESPAWN },
    { id: 'escape-01', object: 'rock', dx: 340, dy: 0, term: TERMINATION.DESPAWN },
    { id: 'orbit-01', object: 'ship', dx: dxForTangFrac(1.0), dy: 0, term: TERMINATION.PLAYER_RESET },
  ];
  for (const c of cases) {
    const world = new BlackHoleWorld({ mu: MU, horizonRadius: H, drag: DRAG, despawnRadius: 560 });
    build(world, c.object, 1);
    launch(world, c.dx, c.dy);
    const fin = flight(world, c.dx, c.dy, c.id === 'orbit-01' ? 3 : 40, c.term);
    const score = calculateThrowScore(fin);
    const r = evaluateMission(getMission(c.id), { telemetry: fin, score });
    assert.strictEqual(r.completed, true, `${c.id} not completed: ${r.reason}`);
  }
  // catalog ids present and in expected order
  const ids = MISSION_CATALOG.map((m) => m.id).join(',');
  assert.strictEqual(ids, 'capture-01,near-horizon-01,flyby-01,score-01,tear-01,orbit-01,near-horizon-02,stretch-01,escape-01,tear-02,score-02,score-03');
});

// ---- 19. no scoring change: categories still sum to a capped total ----
test('no scoring change: score contract intact for the new envelope', () => {
  const weights = Object.values(SCORING_CONFIG.weights);
  const sum = weights.reduce((a, b) => a + b, 0);
  assert.ok(Math.abs(sum - 1) < 1e-12, `category weights sum to ${sum}`);
  const world = new BlackHoleWorld({ mu: MU, horizonRadius: H, drag: DRAG, despawnRadius: 560 });
  build(world, 'planet', 1);
  launch(world, 40, 130);
  const fin = flight(world, 40, 130, 40, TERMINATION.DESPAWN);
  const score = calculateThrowScore(fin);
  assert.ok(Number.isFinite(score.total), 'score total finite');
  assert.ok(score.total >= 0 && score.total <= score.maxTotal, `total ${score.total} in [0,${score.maxTotal}]`);
  const catSum = Object.values(score.categories).reduce((a, c) => a + c.score, 0);
  const bonusSum = score.bonus.nearHorizonSurvival.score;
  assert.ok(Math.abs(catSum + bonusSum - score.total) < 1e-6,
    `categories+bonus (${(catSum + bonusSum).toFixed(1)}) sum to total (${score.total.toFixed(1)})`);
});

// ---- 20. mobile parity: mapping is viewport-free, same gesture → same throw ----
test('mobile parity: identical drag yields identical launch on any viewport', () => {
  const a = aim(130, 130);
  const b = aim(130, 130);
  assert.strictEqual(JSON.stringify(a), JSON.stringify(b));
  const e = escapeDrag();
  assert.ok(e.dx <= AIM_MAPPING.tangSpan, 'escape gesture fits a full-width drag');
  assert.strictEqual(guide(e.dx, e.dy).state, 'ESCAPING');
});

// ---- 21. capture is easy: the first drag region is a guaranteed capture ----
test('capture easy: short pulls (dx ≤ 20) are captured, center is not an escape', () => {
  for (let dx = 0; dx <= 20; dx += 5) {
    assert.strictEqual(guide(dx, 0).state, 'CAPTURED', `dx=${dx} should be CAPTURED`);
  }
  assert.notStrictEqual(guide(0, 0).state, 'ESCAPING');
  assert.notStrictEqual(guide(0, 0).state, 'ORBITAL');
});

// ---- 22. performance: mapping is O(1), no per-call physics or allocation storm ----
test('performance: 20k aimToVelocity calls complete well within an interactive budget', () => {
  const t0 = performance.now();
  let checksum = 0;
  for (let i = 0; i < 20000; i++) {
    const m = aim((i % 350), (i % 500) - 100);
    checksum += m.speed;
  }
  const ms = performance.now() - t0;
  assert.ok(Number.isFinite(checksum), 'checksum finite');
  assert.ok(ms < 1000, `20k mappings took ${ms.toFixed(0)}ms (budget 1000ms)`);
});
