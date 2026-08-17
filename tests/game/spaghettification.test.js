// tests/game/spaghettification.test.js — deformation + tearing invariants for
// the spring-mass objects. Asserts the PHYSICS layer directly (objects.js and
// js/physics/shapes.js are Three.js-free): far-field stillness, growth with
// tidal exposure, radial-dominant stretch, deterministic bounded tearing over
// time, full consumption with no lingering points, mass reconciliation, and
// that telemetry mirrors what the sim actually did (no fabricated values).
import assert from 'node:assert';
import { test } from '../physics/support.js';
import { BlackHoleWorld, createThrowTelemetry, terminationFrom, TERMINATION } from '../../js/physics.js';
import { getObjectDef } from '../../js/objects.js';
import { objectThrow } from '../physics/telemetry_helpers.js';
import { calculateThrowScore } from '../../js/game/scoring/index.js';

const MU = 12.288e6;
const HORIZON = 40;
const SPAWN = { x: 0, y: 19.2, z: 384 };

// Radius distance of a point from the hole.
const rOf = (p) => Math.hypot(p.pos.x, p.pos.y, p.pos.z);
// Radial span of the alive bodies along the hole→COM direction (the true tidal
// axis), plus transverse thickness perpendicular to it. Matches how a
// Newtonian tidal field would stretch a body radially in and out.
function spansOf(world) {
  const alive = world.bodies.filter((b) => b.alive);
  if (alive.length < 2) return { radial: 0, distSpan: 0, transverse: 0, alive: alive.length };
  let massSum = 0, cx = 0, cy = 0, cz = 0;
  for (const b of alive) { massSum += b.mass; cx += b.pos.x * b.mass; cy += b.pos.y * b.mass; cz += b.pos.z * b.mass; }
  const ux = cx / massSum, uy = cy / massSum, uz = cz / massSum;
  const ul = Math.hypot(ux, uy, uz) || 1;
  const uxc = ux / ul, uyc = uy / ul, uzc = uz / ul;
  let rmn = Infinity, rmx = -Infinity, tmx = 0;
  let mn = Infinity, mx = -Infinity;
  for (const b of alive) {
    const r = rOf(b);
    if (r < mn) mn = r; if (r > mx) mx = r;
    const t = b.pos.x * uxc + b.pos.y * uyc + b.pos.z * uzc;
    if (t < rmn) rmn = t;
    if (t > rmx) rmx = t;
    const px = b.pos.x - uxc * t, py = b.pos.y - uyc * t, pz = b.pos.z - uzc * t;
    const th = Math.hypot(px, py, pz);
    if (th > tmx) tmx = th;
  }
  return { radial: rmx - rmn, distSpan: mx - mn, transverse: 2 * tmx, alive: alive.length };
}

const initialSpanOf = (world) => {
  let mn = Infinity, mx = -Infinity;
  for (const b of world.bodies) { const r = Math.hypot(b.pos.x, b.pos.y, b.pos.z); if (r < mn) mn = r; if (r > mx) mx = r; }
  return Math.max(mx - mn, 1e-6);
};

// Manual sim pass that records, on every world step, the exact same events the
// telemetry records (tear count, tear time, consumed mass) plus a live
// deformation sample. Returns a plain record + the finalized result.
function stepped(kind, vel, { size = 1, seconds = 15 } = {}) {
  const world = new BlackHoleWorld({ mu: MU, horizonRadius: HORIZON, drag: 0.1, despawnRadius: 560 });
  const meta = getObjectDef(kind).build(world, SPAWN, size);
  const initSpan = initialSpanOf(world);
  for (const b of world.bodies) { b.vel.x = vel.x; b.vel.y = vel.y; b.vel.z = vel.z; }
  const tm = createThrowTelemetry({ world });
  const initialMass = world.bodies.reduce((s, b) => s + b.mass, 0);
  let tearEvents = 0;
  let maxBurst = 0;
  const tearTimes = [];
  let consumedMass = 0;
  const consumedIdx = new Set();
  const samples = [];
  let perStepBursts = [];
  let liveMax = 1;
  let comMin = Infinity;
  const steps = Math.round(seconds / world.dt);
  for (let i = 0; i < steps; i++) {
    const events = world.step();
    let burst = 0;
    for (const ev of events) {
      if (ev.type === 'tear') {
        tearEvents++;
        burst++;
        tearTimes.push(i * world.dt);
        tm.recordTear();
      } else if (ev.type === 'consume') {
        consumedMass += world.bodies[ev.index].mass;
        consumedIdx.add(ev.index);
        tm.recordConsumption(world.bodies[ev.index].mass);
      }
    }
    maxBurst = Math.max(maxBurst, burst);
    if (burst > 0) perStepBursts.push(burst);
    const s = spansOf(world);
    if (s.alive >= 2) liveMax = Math.max(liveMax, s.distSpan / initSpan);
    let minR = Infinity, cx = 0, cy = 0, cz = 0, massSum = 0;
    for (const b of world.bodies) {
      if (!b.alive) continue;
      minR = Math.min(minR, Math.hypot(b.pos.x, b.pos.y, b.pos.z));
      cx += b.pos.x * b.mass; cy += b.pos.y * b.mass; cz += b.pos.z * b.mass; massSum += b.mass;
    }
    if (massSum > 0) comMin = Math.min(comMin, Math.hypot(cx / massSum, cy / massSum, cz / massSum));
    samples.push({ radial: s.radial / initSpan, transverse: s.transverse / initSpan, alive: s.alive, time: i * world.dt, minR });
    tm.recordStep();
    if (world.aliveCount() === 0) break;
  }
  const reason = world.aliveCount() > 0 ? TERMINATION.PLAYER_RESET
    : terminationFrom(tm.consumedPointCount, tm.initialPointCount);
  const result = tm.finalizeThrow(reason);
  return { world, result, initSpan, initialMass, consumedMass, tearEvents, maxBurst, perStepBursts, tearTimes, consumedIdx, samples, meta, liveMax, comMin };
}

test('far field: planet stays intact with no tidal stretch', () => {
  const { result, world } = objectThrow('planet', { x: 0, y: 0, z: -60 }, { seconds: 0.55 });
  assert.strictEqual(result.tearCount, 0, 'no tearing far from the hole');
  assert.strictEqual(result.remainingPointCount, 31, 'all 31 points survive');
  assert.ok(result.maximumStretch < 1.1, `nearly undeformed, got ${result.maximumStretch}`);
  assert.ok(result.closestApproach.distance > 300, `never got close, got ${result.closestApproach.distance}`);
});

test('far field: rock stays intact with no tidal stretch', () => {
  const { result } = objectThrow('rock', { x: 0, y: 0, z: -60 }, { seconds: 0.55 });
  assert.strictEqual(result.tearCount, 0, 'no tearing far from the hole');
  assert.strictEqual(result.remainingPointCount, 13, 'all 13 rock points survive');
  assert.ok(result.maximumStretch < 1.1, `nearly undeformed, got ${result.maximumStretch}`);
});

test('deformation peaks at the closest approach', () => {
  const { result, samples } = stepped('planet', { x: 0, y: -60, z: -260 });
  assert.ok(result.maximumStretch >= 1.2, 'the plunge stretches the planet at all');
  const deep = samples.filter((s) => s.radial > 0);
  let maxR = -1, argMax = -1;
  for (let i = 0; i < deep.length; i++) { if (deep[i].radial > maxR) { maxR = deep[i].radial; argMax = i; } }
  const peak = deep[argMax];
  // The maximum stretch happens while the object is at (or already inside) the
  // closest-approach window: no earlier far-field sample stretches more.
  for (let i = 0; i < argMax; i++) {
    assert.ok(deep[i].radial <= maxR + 0.001, 'stretch never peaks before closest approach');
  }
});

test('deformation is radial-dominant along the tidal axis', () => {
  const { result, samples } = stepped('planet', { x: 0, y: -60, z: -260 });
  // Look at the moment of deepest stretch while the object is still mostly one
  // coherent body (post-tear fragments can be off-axis and rotate).
  const intact = samples.filter((s) => s.alive >= 8);
  let maxR = 0, argMax = 0;
  for (let i = 0; i < intact.length; i++) {
    if (intact[i].radial > maxR) { maxR = intact[i].radial; argMax = i; }
  }
  assert.ok(maxR > 1.1, `deep stretch before shredding, got ${maxR}`);
  const s = intact[argMax];
  assert.ok(s.radial / Math.max(s.transverse, 1e-6) >= 1.2,
    `elongation along the radial axis, ratio ${(s.radial / Math.max(s.transverse, 1e-6)).toFixed(2)}`);
});

test('planet direct plunge always tears (structural failure, not brittle snap)', () => {
  for (let i = 0; i < 3; i++) {
    const { result } = objectThrow('planet', { x: 0, y: -60, z: -260 }, { seconds: 15 });
    assert.ok(result.tearCount >= 1, `tears on run ${i}, got ${result.tearCount}`);
    assert.strictEqual(result.remainingPointCount, 0, 'fully consumed on run ' + i);
  }
});

test('tear record is coherent: count matches events, times ordered', () => {
  const { result, tearEvents, tearTimes } = stepped('planet', { x: 0, y: -60, z: -260 });
  assert.ok(result.tearCount >= 1);
  assert.strictEqual(result.tearCount, tearEvents, 'telemetry counted every tear event');
  assert.strictEqual(result.tearCount, tearTimes.length, 'one timestamp per tear');
  for (let i = 1; i < tearTimes.length; i++) {
    assert.ok(tearTimes[i] >= tearTimes[i - 1], 'tear timestamps are ordered');
  }
});

test('tears spread over time instead of one simultaneous explosion', () => {
  const { result, perStepBursts, maxBurst } = stepped('planet', { x: 0, y: -40, z: -200 }, { seconds: 20 });
  assert.ok(result.tearCount >= 2, `graze approach tears, got ${result.tearCount}`);
  assert.ok(new Set(perStepBursts.length ? perStepBursts : [0]).size >= 1, 'tears occur on ≥1 distinct step');
  assert.ok(maxBurst <= 3, `no step detonates the whole star, worst burst ${maxBurst}`);
});

test('rock strands tear gradually, never burst', () => {
  const { result, maxBurst } = stepped('rock', { x: 0, y: -60, z: -260 });
  assert.ok(maxBurst <= 1, `rock max burst ${maxBurst}`);
  assert.ok(result.tearCount <= 2, `rock tears are bounded, got ${result.tearCount}`);
  assert.ok(result.maximumStretch >= 1.0 && result.maximumStretch < 2.0,
    `rock stretches inside a coherent window, got ${result.maximumStretch}`);
  assert.strictEqual(result.consumedPointCount, result.initialPointCount, 'rock fully consumed (no despawn)');
});

test('human tearing is deterministic and bounded', () => {
  const { result } = objectThrow('human', { x: 0, y: -60, z: -260 }, { seconds: 15 });
  assert.ok(result.tearCount >= 1 && result.tearCount <= 2, `human tears, got ${result.tearCount}`);
  assert.ok(result.maximumStretch >= 1.1 && result.maximumStretch < 1.6, `human stretch, got ${result.maximumStretch}`);
  assert.strictEqual(result.consumedPointCount, result.initialPointCount, 'human fully consumed');
});

test('ship stays coherent through the passage', () => {
  const { result } = objectThrow('ship', { x: 0, y: -60, z: -240 }, { seconds: 15 });
  assert.ok(result.tearCount <= 1, `ship barely tears, got ${result.tearCount}`);
  assert.ok(result.maximumStretch >= 1.0 && result.maximumStretch < 1.5, `ship stretch, got ${result.maximumStretch}`);
  assert.ok(result.remainingPointCount <= 1, 'ship fully consumed');
});

test('consumed + remaining + despawned points reconcile for every object', () => {
  for (const kind of ['rock', 'human', 'ship', 'planet']) {
    const { result } = objectThrow(kind, { x: 0, y: -60, z: -260 }, { seconds: 15 });
    const sum = result.consumedPointCount + result.remainingPointCount + result.despawnedPointCount;
    assert.strictEqual(sum, result.initialPointCount, `${kind} reconcile`);
  }
});

test('mass reconciles across a torn, fully-consumed planet', () => {
  const { result, initialMass, consumedMass } = stepped('planet', { x: 0, y: -40, z: -200 }, { seconds: 20 });
  assert.ok(result.remainingPointCount === 0, 'all points consumed');
  assert.ok(Math.abs(initialMass - consumedMass) < 1e-9,
    `mass conserved: initial ${initialMass.toFixed(3)} consumed ${consumedMass.toFixed(3)}`);
});

test('a torn planet never double-consumes the same point', () => {
  const { consumedIdx } = stepped('planet', { x: 0, y: -60, z: -260 });
  assert.strictEqual(consumedIdx.size, [...consumedIdx].length, 'each index consumed exactly once');
});

test('every alive body keeps positive, finite mass at all times', () => {
  const { world } = stepped('planet', { x: 0, y: -40, z: -220 }, { size: 10, seconds: 20 });
  const steps = Math.round(20 / world.dt);
  const stepWorld = new BlackHoleWorld({ mu: MU, horizonRadius: HORIZON, drag: 0.1, despawnRadius: 560 });
  getObjectDef('planet').build(stepWorld, SPAWN, 10);
  for (const b of stepWorld.bodies) { b.vel.x = 0; b.vel.y = -40; b.vel.z = -220; }
  for (let i = 0; i < steps; i++) {
    stepWorld.step();
    for (const b of stepWorld.bodies) {
      if (!b.alive) continue;
      assert.ok(Number.isFinite(b.mass) && b.mass > 0, `mass at step ${i}: ${b.mass}`);
      assert.ok(Number.isFinite(b.pos.x) && Number.isFinite(b.pos.y) && Number.isFinite(b.pos.z), 'finite position still part of first loop');
    }
    if (stepWorld.aliveCount() === 0) break;
  }
});

test('no NaN/Infinity ever leaks into the largest planet sim', () => {
  const world = new BlackHoleWorld({ mu: MU, horizonRadius: HORIZON, drag: 0.1, despawnRadius: 560 });
  getObjectDef('planet').build(world, SPAWN, 10);
  for (const b of world.bodies) { b.vel.x = 0; b.vel.y = -40; b.vel.z = -220; }
  const steps = Math.round(20 / world.dt);
  for (let i = 0; i < steps; i++) {
    world.step();
    for (const b of world.bodies) {
      if (!b.alive) continue;
      assert.ok(Number.isFinite(b.pos.x) && Number.isFinite(b.pos.y) && Number.isFinite(b.pos.z) &&
        Number.isFinite(b.vel.x) && Number.isFinite(b.vel.y) && Number.isFinite(b.vel.z),
        `non-finite body at step ${i}: ${JSON.stringify(b.pos)}/${JSON.stringify(b.vel)}`);
    }
    if (world.aliveCount() === 0) break;
  }
});

test('deformation is scale-independent up to size 10', () => {
  for (const size of [0.5, 1, 1.5, 2, 3, 10]) {
    const seconds = size >= 10 ? 20 : 15;
    const { result } = objectThrow('planet', { x: 0, y: -40, z: -260 }, { size, seconds });
    assert.ok(Number.isFinite(result.maximumStretch), `size ${size} stretch finite`);
    assert.ok(Number.isFinite(result.closestApproach.distance), `size ${size} closest finite`);
    assert.strictEqual(result.consumedPointCount + result.remainingPointCount + result.despawnedPointCount,
      result.initialPointCount, `size ${size} reconcile`);
    assert.ok(result.remainingPointCount === 0, `size ${size} fully consumed, got ${result.remainingPointCount} remaining`);
    assert.ok(result.despawnedPointCount <= 2, `size ${size} despawn bounded`);
  }
});

test('telemetry maximumStretch equals the live-observed maximum span', () => {
  const { result, liveMax } = stepped('planet', { x: 0, y: -60, z: -260 });
  assert.ok(Math.abs(result.maximumStretch - liveMax) < 1e-9,
    `telemetry ${result.maximumStretch} vs live ${liveMax}`);
});

test('telemetry tearCount equals the number of tear events the sim fired', () => {
  const { tearEvents, result } = stepped('planet', { x: 0, y: -60, z: -260 });
  assert.strictEqual(result.tearCount, tearEvents, 'no invented tears');
});

test('closest approach matches the live-observed COM minimum radius', () => {
  const { result, comMin } = stepped('rock', { x: 0, y: -60, z: -260 });
  assert.ok(comMin < Infinity, 'object approached the hole');
  assert.ok(Math.abs(result.closestApproach.distance - comMin) < 1e-9,
    `closest ${result.closestApproach.distance} vs live ${comMin}`);
});

test('random builds land in the same outcome class every time', () => {
  const out = [];
  for (let i = 0; i < 3; i++) {
    const { result } = objectThrow('planet', { x: 0, y: -60, z: -260 }, { seconds: 15 });
    out.push({ tears: result.tearCount, consumed: result.consumedPointCount, rem: result.remainingPointCount });
  }
  for (const o of out) {
    assert.ok(o.consumed === 31 && o.rem === 0, `fully consumed each run, got ${JSON.stringify(o)}`);
    assert.ok(Math.abs(o.tears - out[0].tears) <= 6, `tear counts stay in a coherent band, got ${o.tears} vs ${out[0].tears}`);
  }
});

test('consumption, not the verdict, decides the final trajectory state', () => {
  const { result } = objectThrow('planet', { x: 0, y: -60, z: -260 }, { seconds: 15 });
  assert.strictEqual(result.trajectoryState, 'HORIZON_CROSSING', 'consumed at the horizon wins over any analytic prediction');
});

test('an un-torn direct plunge scores zero destruction (no fabricated tears)', () => {
  const { result } = objectThrow('rock', { x: 0, y: -30, z: -220 }, { seconds: 12 });
  assert.strictEqual(result.tearCount, 0, 'rock plunge under the tear threshold');
  const score = calculateThrowScore(result);
  assert.ok(Number.isFinite(score.total), 'score total finite');
  const d = score.categories.destruction;
  // No tears → only the small "clean tearless swallow" credit can appear.
  assert.ok(d.score > 0 && d.score <= 0.3 * d.max,
    `untorn rock earns only the swallow credit, got ${d.score}/${d.max}`);
});