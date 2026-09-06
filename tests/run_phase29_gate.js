// tests/run_phase29_gate.js — Phase-29 preflight: real-sim honesty gate.
// Asserts the reshaped envelope is REAL, every mission is reachable with a
// human-scale gesture, and guidance verdicts match the measured sim bands.
//
// node tests/run_phase29_gate.js
import assert from 'node:assert';
import { objectThrow } from './physics/telemetry_helpers.js';
import { calculateThrowScore } from '../js/game/scoring/index.js';
import { calculateGuidance } from '../js/game/guidance/index.js';
import { OBJECT_SIM_PROFILES, aimToVelocity, escapeDrag, dxForTangFrac, ESCAPE_TANGF } from '../js/game/aiming/index.js';
import { getMission } from '../js/game/missions/index.js';
import { evaluateMission } from '../js/game/missions/evaluate.js';
import { test, report } from './physics/support.js';

const MU = 12.288e6;
const HR = 40;
const SPAWN = { x: 0, y: 19.2, z: 384 };
const OPTS = { seconds: 35, size: 1, drag: 0.1 / 1.6 };
const g = (id, dx, dy) => aimToVelocity({ mu: MU, pos: SPAWN, dx, dy });
const state = (r) => r.result.trajectoryState;

// ---------------------------------------------------------------- envelope ----
test('real-sim bands match the reshaped envelope at every anchor', () => {
  const rock = (dx) => state(objectThrow('rock', g('rock', dx, 0), OPTS));
  assertState(rock(100), 'HORIZON_CROSSING', 'dx100 rock swallowed');
  assertState(rock(200), 'ORBITAL', 'dx200 rock orbits');
  assertState(rock(escapeDrag().dx), 'ESCAPING', 'dx250 rock escapes (80% of a 340 swipe)');
  const ship = (dx) => state(objectThrow('ship', g('ship', dx, 0), OPTS));
  assertState(ship(200), 'ORBITAL', 'dx200 ship orbits');
  assertState(ship(250), 'ESCAPING', 'dx250 ship escapes');
});

test('escape begins inside the swipe: 250 of 340 = ~74% drag, tangFrac 1.60', () => {
  assertState(objectThrow('rock', g('rock', 250, 0), OPTS).result.trajectoryState, 'ESCAPING', 'measured rock escape anchor');
  const ed = escapeDrag();
  assert.ok(ed.dx < 306, `escape no longer sits on the old full-width 306 razor (${ed.dx})`);
  assert.strictEqual(ed.dx, dxForTangFrac(ESCAPE_TANGF), 'escape anchor sits at the measured 1.60 drag');
  assert.ok(ESCAPE_TANGF >= 1.6 && ESCAPE_TANGF <= 2.0,
    'escape anchor at the measured threshold (1.60), nowhere near analytic √2');
});

test('the honest DIDCLOSE/survival floors rise with object softness', () => {
  assert.ok(OBJECT_SIM_PROFILES.rock.orbitFloor < OBJECT_SIM_PROFILES.human.orbitFloor, 'rock survives the deepest passes');
  assert.ok(OBJECT_SIM_PROFILES.rock.escapeAt >= 1.6 && OBJECT_SIM_PROFILES.planet.escapeAt >= 1.6, 'all objects escape past the measured rim');
});

// ------------------------------------------------------- mission honesty ----
test('every mission is reachable with a human-scale gesture (recommended object)', () => {
  const cases = [
    ['near-horizon-01', 'rock', 10, 0],
    ['escape-01', 'rock', 250, 0],
    ['orbit-01', 'rock', 200, 0],
    ['capture-01', 'rock', 10, 0],
    ['score-01', 'rock', 60, 0],
    ['score-02', 'rock', 60, 0],
  ];
  for (const [id, obj, dx, dy] of cases) {
    const m = getMission(id);
    const r = objectThrow(obj, g(obj, dx, dy), OPTS);
    const score = calculateThrowScore(r.result);
    const out = evaluateMission(m, { telemetry: r.result, score });
    assert.ok(out.completed, `${id} reachable: ${out.reason}`);
  }
});

test('Grazing the Void completes within a few throws (object builds are stochastic)', () => {
  // The rock's internal point layout is built with Math.random, so a razor-close
  // pass sometimes fully consumes the object and sometimes leaves points behind.
  // Honest bar: the mission completes in practice — retry the two known grazing
  // gestures a handful of times and require at least one partial-survival pass.
  const m = getMission('survive-near-horizon-01');
  let attempts = 0;
  let done = false;
  outer:
  for (const [obj, dx] of [['rock', 40], ['rock', 45], ['rock', 50]]) {
    for (let i = 0; i < 4 && !done; i++) {
      attempts++;
      const v = aimToVelocity({ mu: MU, pos: SPAWN, dx, dy: 130 });
      const r = objectThrow(obj, v, OPTS);
      const score = calculateThrowScore(r.result);
      done = evaluateMission(m, { telemetry: r.result, score }).completed;
    }
    if (done) break outer;
  }
  assert.ok(done, `grazing reachable in ${attempts} attempts`);
});

// ---------------------------------------------------- guidance honesty seam ----
test('guidance verdicts match measured real-sim outcomes at the anchors', () => {
  const prof = OBJECT_SIM_PROFILES.rock;
  const seen = {};
  for (const dx of [100, 200, 250]) {
    const real = state(objectThrow('rock', g('rock', dx, 0), OPTS));
    const v = aimToVelocity({ mu: MU, pos: SPAWN, dx, dy: 0 });
    const gu = calculateGuidance({ mu: MU, horizonRadius: HR, pos: SPAWN, vel: v, simProfile: prof }).state;
    assertState(gu, real, `guidance ${gu} matches real sim ${real} at dx${dx}`);
    seen[dx] = { real, gu };
  }
  assert.strictEqual(seen[100].gu, 'HORIZON_CROSSING', 'guidance honest about the swallow below the floor');
  assert.strictEqual(seen[200].gu, 'ORBITAL', 'guidance honest about the real orbital band');
  assert.strictEqual(seen[250].gu, 'ESCAPING', 'guidance honest about the real escape rim');
});

// ------------------------------------------------------------------ helpers ----
function assertState(actual, expected, label) {
  assert.ok(actual === expected, `${label} — got ${actual}, expected ${expected}`);
}