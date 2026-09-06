// tests/game/aiming_ux.test.js — Phase 18 aiming-learnability presentation.
// The phase adds ONLY presentation derived from existing data:
//   - path emphasis families (capture / orbital wrap / flyby apex / escape tail)
//     mapped from the EXISTING 6-state classification — no new states
//   - a closest-approach marker shown only for non-diving passes
//   - a grazing opacity pulse (gated by prefers-reduced-motion + ghost fade)
//   - a power-driven aim-arrow shaft (amber → near-white on a strong pull)
//   - a latched 'aim-high' audio cue fed by the EXISTING mapping's power01
// It proves semantics are unchanged:
//   - the frozen mapping + classification still produce identical outcomes
//   - the phase's own thresholds live ONLY in pure THREE-free helpers
//   - no per-frame allocation, one-line trajectory path, one marker mesh
//   - loop.js is untouched; the new cue can never fire per-frame or on launch/
//     cancel paths
// Run: node tests/run_aiming_ux.js
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from '../physics/support.js';

import {
  stateMode, grazingBand, closestMarkerVisible, escapeTailLength,
  ghostOpacity, OPACITY,
} from '../../js/game/guidance/path.js';
import {
  AIM_MAPPING, aimFractions, aimToVelocity, dxForTangFrac, escapeDrag,
  evaluateAim, ESCAPE_TANGF, OBJECT_SIM_PROFILES,
} from '../../js/game/aiming/index.js';
import { calculateGuidance } from '../../js/game/guidance/index.js';
import { TRAJECTORY } from '../../js/physics/trajectory/states.js';
import { SOUNDS, HAPTIC_MAP, EVENT_CONFIG } from '../../js/audio/sounds.js';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '../..');
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

const MU = 12.288e6;
const H = 40;
const SPAWN = { x: 0, y: 19.2, z: 384 };
const R = Math.hypot(SPAWN.x, SPAWN.y, SPAWN.z);

const guide = (dx, dy) => evaluateAim({ mu: MU, horizonRadius: H, pos: SPAWN, dx, dy });

// ------------------------------------------------------- pure helpers ----
test('presentation families map every existing state, adding no new ones', () => {
  const keys = new Set(Object.keys(TRAJECTORY));
  assert.strictEqual(keys.size, 6, 'canonical states must stay 6');
  for (const s of Object.keys(TRAJECTORY)) {
    const m = stateMode(s);
    assert.ok(['capture', 'orbital', 'escape', 'flyby'].includes(m), `${s} → ${m}`);
  }
  assert.strictEqual(stateMode('CAPTURED'), 'capture');
  assert.strictEqual(stateMode('HORIZON_CROSSING'), 'capture');
  assert.strictEqual(stateMode('ORBITAL'), 'orbital');
  assert.strictEqual(stateMode('ESCAPING'), 'escape');
  assert.strictEqual(stateMode('FLYBY'), 'flyby');
  assert.strictEqual(stateMode('UNKNOWN'), 'flyby');  // unknown keeps the clean curve
});

test('grazing pulse band: strictly within 1.04–1.7×horizon, robust to junk', () => {
  assert.strictEqual(grazingBand(H * 1.04, H), true);    // inclusive lower
  assert.strictEqual(grazingBand(H * 1.7, H), true);     // inclusive upper
  assert.strictEqual(grazingBand(H * 1.03, H), false);   // too deep (already red)
  assert.strictEqual(grazingBand(H * 1.71, H), false);   // too far (clean curve)
  assert.strictEqual(grazingBand(0, H), false);
  assert.strictEqual(grazingBand(H, 0), false);
  assert.strictEqual(grazingBand(NaN, H), false);
  assert.strictEqual(grazingBand(Infinity, H), false);
});

test('closest-approach marker: only for passes that stay outside the horizon', () => {
  assert.strictEqual(closestMarkerVisible(H, H), false);       // on the rim
  assert.strictEqual(closestMarkerVisible(H * 1.05, H), false); // at the threshold
  assert.strictEqual(closestMarkerVisible(H * 1.06, H), true);  // just outside
  assert.strictEqual(closestMarkerVisible(H * 5, H), true);
  assert.strictEqual(closestMarkerVisible(0, H), false);
  assert.strictEqual(closestMarkerVisible(NaN, H), false);
});

test('escape tail is short and bounded — a cue, never a wall', () => {
  assert.strictEqual(escapeTailLength(0), 0);
  assert.strictEqual(escapeTailLength(3), 3);
  assert.strictEqual(escapeTailLength(6), 6);
  assert.strictEqual(escapeTailLength(999), 6);
  assert.strictEqual(escapeTailLength(-2), 0);
});

test('phase thresholds live ONLY in the pure THREE-free helpers', () => {
  const top = read('js/game/guidance/path.js').slice(0,
    read('js/game/guidance/path.js').indexOf('export class TrajectoryPath'));
  // the phase's closeness thresholds (1.04, 1.7, 1.05) live ONLY in the pure
  // THREE-free helpers, never in the render class
  assert.match(top, /grazingBand/);
  assert.match(top, /1\.04/);
  assert.match(top, /1\.7/);
  assert.match(top, /1\.05/);
  // the render class reads ONLY the existing classification + closest approach:
  // it must not re-run physics or invent new states.
  const pathSrc = read('js/game/guidance/path.js');
  const classBody = pathSrc.slice(pathSrc.indexOf('export class TrajectoryPath'));
  assert.doesNotMatch(classBody, /classifyTrajectory|analyzeClosestApproach|predictTrajectory/);
  assert.doesNotMatch(classBody, /EGRESS|CAPTURED\b/);  // no new state names
});

// --------------------------------------------------- semantics intact ----
test('classification is unchanged: the same drags still mean the same thing', () => {
  assert.strictEqual(guide(20, 130).state, 'CAPTURED');
  const g = guide(40, 130);
  assert.strictEqual(g.state, 'ORBITAL');
  assert.ok(g.periapsis > H && g.periapsis <= 60, `tight orbit r_p=${g.periapsis.toFixed(1)}`);
  assert.strictEqual(guide(escapeDrag().dx, escapeDrag().dy).state, 'ESCAPING');
  assert.ok(guide(0, 0).state !== 'ESCAPING' && guide(0, 0).state !== 'ORBITAL');
});

test('guidance still sees exactly the mapping launch velocity (bit-exact)', () => {
  for (const [dx, dy] of [[20, 130], [40, 130], [130, 0], [258, 0], [272, 0], [340, 480]]) {
    const m = aimToVelocity({ mu: MU, pos: SPAWN, dx, dy });
    const c = calculateGuidance({
      mu: MU, horizonRadius: H,
      pos: { x: SPAWN.x, y: SPAWN.y, z: SPAWN.z },
      vel: { x: m.x, y: m.y, z: m.z },
    });
    assert.strictEqual(c.launchSpeed, m.speed, `launch speed mismatch at dx=${dx},dy=${dy}`);
  }
});

test('aim-high cue is bound: fires while the pull is powerful but NOT yet free', () => {
  // Phase 24: threshold 0.70. Phase 29 (envelope max 2.0): the same 0.70 reads
  // tangFrac ≈ 1.55 — still a bound pass, ahead of the REAL-sim escape rim
  // (ESCAPE_TANGF = 1.60), even though it sits above the analytic √2.
  const threshold = 0.70;
  const tangAtThreshold = AIM_MAPPING.tangMin + threshold * (AIM_MAPPING.tangMax - AIM_MAPPING.tangMin);
  const escapeFrac = ESCAPE_TANGF;
  const circFrac = 1.0;
  // the cue sits well past a circular orbit but clearly before real escape
  assert.ok(tangAtThreshold > circFrac + 0.3, `tangFrac ${tangAtThreshold.toFixed(3)} too close to circular`);
  assert.ok(tangAtThreshold < escapeFrac - 0.03, `tangFrac ${tangAtThreshold.toFixed(3)} should precede escape`);
  // power01 is a pure monotone reading of dx — find the crossing, verify it is
  // still a BOUND pass vs the REAL sim (the cue precedes the "free" gesture).
  let cross = -1;
  for (let dx = 0; dx <= AIM_MAPPING.tangSpan; dx++) {
    if (aimFractions({ dx, dy: 0 }).power01 >= threshold) { cross = dx; break; }
  }
  assert.ok(cross > 0 && cross < escapeDrag().dx,
    `crossing dx=${cross} must be a deliberate pull before escape (${escapeDrag().dx})`);
  const st = evaluateAim({ mu: MU, horizonRadius: H, pos: SPAWN, dx: cross, dy: 0 },
    OBJECT_SIM_PROFILES.rock).state;
  assert.ok(st === 'ORBITAL' || st === 'CAPTURED',
    `crossing drag classified ${st}, expected bound (cue must precede escape)`);
});

test('power01 is monotone in dx and normalized 0…1 (the cue reads a real signal)', () => {
  let prev = -Infinity;
  for (let dx = 0; dx <= AIM_MAPPING.tangSpan; dx += 5) {
    const p = aimFractions({ dx, dy: 0 }).power01;
    assert.ok(p >= prev, `power01 fell at dx=${dx}`);
    assert.ok(p >= 0 && p <= 1, `power01 ${p} out of [0,1]`);
    prev = p;
  }
  assert.strictEqual(aimFractions({ dx: 0, dy: 0 }).power01, 0);
  assert.ok(Math.abs(aimFractions({ dx: 340, dy: 0 }).power01 - 1) < 1e-9);
});

// ------------------------------------------------------ source guards ----
test('trajectory path keeps a single line + single marker, all buffers preallocated', () => {
  const src = read('js/game/guidance/path.js');
  const classBody = src.slice(src.indexOf('export class TrajectoryPath'));
  assert.strictEqual((classBody.match(/new THREE\.Line\(/g) || []).length, 1,
    'exactly ONE line — no mesh-per-sample');
  assert.strictEqual((classBody.match(/new THREE\.Mesh\(/g) || []).length, 1,
    'exactly ONE marker mesh');
  assert.strictEqual((classBody.match(/new Float32Array\(maxPoints \* 3\)/g) || []).length, 2,
    'positions + colors are preallocated Float32Arrays');
  // no per-frame allocation in the render tick
  const tickBody = src.slice(src.indexOf('tick(dt) {'), src.indexOf('dispose() {'));
  assert.doesNotMatch(tickBody, /\bnew\s+/);
});

test('grazing pulse is gated by reduced-motion and by the ghost fade', () => {
  const src = read('js/game/guidance/path.js');
  assert.match(src, /_pulseMode === 'graze' && !this\._reduceMotion/);
  assert.match(src, /_fadeT >= FADE/);            // fade owns opacity while running
  // a graze keeps the fade-reset behavior intact (fresh prediction cancels fade)
  assert.match(src, /a fresh prediction cancels any outgoing ghost fade/);
});

test('closest-approach marker is driven by the pure predicate', () => {
  const src = read('js/game/guidance/path.js');
  assert.match(src, /closestMarkerVisible\(cd, radius\)/);
  assert.match(src, /marker\.visible = (true|false);/);
});

test('aim arrow: colors stay warm-literals, power shift is preallocated (no per-call alloc)', () => {
  const aim = read('js/game/aim.js');
  assert.match(aim, /0xffc860/);
  assert.match(aim, /0xfff4d0/);
  assert.match(aim, /8\.0, 6\.5/);
  assert.strictEqual((aim.match(/new THREE\.Color\(/g) || []).length, 2,
    'exactly two preallocated colors (amber + pale), none inside update()');
  // the shift reads the same power reading the arrow length already uses
  assert.match(aim, /blend = \(power - 0\.72\) \/ 0\.28/);
});

test('aim-high cue: latched, throttled, fires only from _updateGuidance', () => {
  const main = read('js/game/main.js');
  const body = main.slice(main.indexOf('\n  _updateGuidance()'), main.indexOf('\n  _clearGuidance()'));
  assert.match(body, /aimFractions\(/);
  assert.match(body, /power01 >= 0\.70/);
  assert.match(body, /_highPowerLatched/);
  assert.match(body, /audio\?\.aimHigh\(\)/);
  // the latch re-arms on a pull-back and on beginAim / cancel
  assert.match(main, /if \(high && !this\._highPowerLatched\)/);
  assert.match(main, /else if \(!high\)/);
  const begin = main.slice(main.indexOf('\n  beginAim()'), main.indexOf('\n  _spawnHeld()'));
  assert.match(begin, /_highPowerLatched = false/);
  const cancel = main.slice(main.indexOf('\n  cancelAim()'), main.indexOf('\n  // ---------- aim arrow ----------'));
  assert.match(cancel, /_highPowerLatched = false/);
  // launch must NOT add the cue (it is an aim-only signal)
  const launch = main.slice(main.indexOf('\n  launch()'), main.indexOf('\n  disposeObject() {'));
  assert.doesNotMatch(launch, /aimHigh|_highPowerLatched|aimFractions/);
});

test('the cue never fires per-frame: loop.js is untouched and frame code has no audio', () => {
  const loop = read('js/game/loop.js');
  assert.doesNotMatch(loop, /aim-high|aimHigh|_highPowerLatched|aimFractions/);
  assert.match(loop, /game\.trajPath\.tick\(dtReal\)/);
});

test('audio: aim-high is a real catalog event, distinct from cancel and throttled', () => {
  assert.strictEqual(SOUNDS['aim-high'].kind, 'low');
  assert.notStrictEqual(JSON.stringify(SOUNDS['aim-high']), JSON.stringify(SOUNDS.cancel));
  assert.strictEqual(HAPTIC_MAP['aim-high'], 'tap');
  assert.ok(EVENT_CONFIG['aim-high'].cooldown > 0, 'aim-high must be throttled');
  const fb = read('js/audio/feedback.js');
  assert.match(fb, /aimHigh\(\)/);
  assert.match(fb, /this\.allowed\('aim-high'\)/);
  const idx = read('js/audio/index.js');
  assert.match(idx, /aimHigh: \(\) => feedback\.aimHigh\(\)/);
  const main = read('js/game/main.js');
  assert.match(main, /\baimHigh\b/);
});

test('guidance replays carry the fields the presentation reads (samples + closest)', () => {
  for (const [dx, dy] of [[40, 130], [258, 0], [escapeDrag().dx, 0]]) {
    const m = aimToVelocity({ mu: MU, pos: SPAWN, dx, dy });
    const g = calculateGuidance({
      mu: MU, horizonRadius: H,
      pos: { x: SPAWN.x, y: SPAWN.y, z: SPAWN.z },
      vel: { x: m.x, y: m.y, z: m.z },
    });
    assert.ok(g.samples.length > 1, `dx=${dx} has no samples`);
    assert.ok(g.samples.every((s) => Number.isFinite(s.velocity.x)
      && Number.isFinite(s.velocity.y) && Number.isFinite(s.velocity.z)),
      'every sample carries a finite velocity (escape continuation input)');
    assert.ok(Number.isFinite(g.closestApproach.distance), 'closest distance finite');
    assert.strictEqual(typeof g.closestApproach.position.x, 'number', 'closest position present');
  }
});

test('feels and presentation helpers compose cleanly (ghost curve still bounded)', () => {
  assert.strictEqual(ghostOpacity(0), OPACITY);
  assert.strictEqual(ghostOpacity(1), 0);
  for (let i = 0; i <= 100; i++) {
    const o = ghostOpacity(i / 100);
    assert.ok(o >= 0 && o <= OPACITY, `opacity ${o} out of range`);
  }
});

test('no new gameplay-internals imports were added by the Phase 18 pass', () => {
  const allowed = [
    'physics.js', 'trajectory.js', 'aiming/index.js', 'scoring/index.js',
    'guidance/index.js', 'objects.js', 'spawn.js', 'input.js', 'sim.js',
    'presentation.js', 'guidehud.js', 'result.js', 'ui.js', 'missionui.js',
    'readout.js', 'render/', 'theme.js', 'icons.js',
  ];
  for (const f of ['js/game/aim.js', 'js/game/guidance/path.js', 'js/game/main.js']) {
    const src = read(f);
    for (const m of src.matchAll(/from\s+'([^']+)'/g)) {
      const spec = m[1];
      const banned = /(physics\/|aiming|missions\/|progression\/|challenges\/|scoring\/|telemetry\/|trajectory\/)/.test(spec)
        && !allowed.some((a) => spec.endsWith(a) || spec === a || spec.startsWith(a));
      assert.ok(!banned, `${f} adds import '${spec}' into a frozen layer`);
    }
  }
});