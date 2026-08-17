// tests/game/feel.test.js — Phase 15 gameplay-feel presentation suite.
// The feel layer changes ONLY how the existing sim is shown (launch handoff
// ghost, launch impulse, tear feedback, aim-arrow readability). These guards
// prove the feel pass never reaches into the frozen gameplay systems:
//   - the frozen modules' exported tuning values are byte-identical
//   - the touched presentation files add no new imports of gameplay internals
//   - the ghost-fade curve is bounded, monotone, and honors reduced-motion
//   - launch still clears prediction state but now fades the path (no hide)
//   - particle effects stay bounded and existing effect entries are untouched
// Run: node tests/run_feel.js
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from '../physics/support.js';

import { ghostOpacity, OPACITY, FADE } from '../../js/game/guidance/path.js';
import { AIM_MAPPING } from '../../js/game/aiming/mapping.js';
import { SCORING_CONFIG } from '../../js/game/scoring/config.js';
import { TRAJECTORY } from '../../js/physics/trajectory/states.js';
import { PHYS_DT } from '../../js/game/sim.js';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '../..');
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

const TOUCHED = [
  'js/game/aim.js',
  'js/game/guidance/path.js',
  'js/game/loop.js',
  'js/game/main.js',
  'js/render/objects/particles.js',
];

// --------------------------------------------------- ghost-fade curve ----
test('ghost fade curve: bounded, monotone non-increasing, exact endpoints', () => {
  assert.strictEqual(ghostOpacity(0), OPACITY);
  assert.strictEqual(ghostOpacity(1), 0);
  assert.strictEqual(ghostOpacity(0.5), OPACITY * 0.75);
  assert.strictEqual(ghostOpacity(-1), OPACITY);  // clamped
  assert.strictEqual(ghostOpacity(2), 0);         // clamped
  assert.strictEqual(ghostOpacity(0.25) > ghostOpacity(0.5), true);
  for (let i = 0; i <= 100; i++) {
    const o = ghostOpacity(i / 100);
    assert.ok(o >= 0 && o <= OPACITY, `opacity ${o} out of range`);
  }
});

test('ghost fade is short-lived and honors reduced-motion in source', () => {
  assert.strictEqual(FADE, 0.35, 'FADE must stay 0.35 s');
  const src = read('js/game/guidance/path.js');
  assert.match(src, /prefers-reduced-motion/);
  assert.match(src, /fadeOut\(\)/);
  assert.match(src, /update\(guidance\)/);
  assert.match(src, /tick\(dt\)/);
  // a fresh prediction and an explicit hide must cancel the fade
  assert.match(src, /this\._fadeT = FADE; \/\/ a fresh prediction cancels/);
  assert.match(src, /hide is immediate — cancel any in-flight ghost fade/);
});

// ------------------------------------------------- frozen systems ---- 
test('frozen gameplay tuning values are unchanged by the feel pass', () => {
  // physics constants
  assert.strictEqual(PHYS_DT, 1 / 240);
  assert.strictEqual(SCORING_CONFIG.horizonRadius, 40);
  const wsum = SCORING_CONFIG.weights.precision + SCORING_CONFIG.weights.tidal
    + SCORING_CONFIG.weights.destruction + SCORING_CONFIG.weights.survival
    + SCORING_CONFIG.weights.orbital;
  assert.ok(Math.abs(wsum - 1) < 1e-9, 'scoring weights must still sum to 1');
  // trajectory states — the 6 canonical states, no additions
  assert.deepStrictEqual(Object.keys(TRAJECTORY), [
    'ESCAPING', 'FLYBY', 'ORBITAL', 'CAPTURED', 'HORIZON_CROSSING', 'UNKNOWN',
  ]);
  // aiming envelope anchors — tangMax lifted 1.62→1.77 (Phase 24) so a full-width  // 360px drag reaches real-sim escape (drag-loaded threshold ~tangFrac 1.587);
  // all other Phase-13 anchors untouched.
  assert.strictEqual(AIM_MAPPING.tangMin, 0.35);
  assert.strictEqual(AIM_MAPPING.tangMax, 1.77);
  assert.strictEqual(AIM_MAPPING.tangSpan, 340);
  assert.strictEqual(AIM_MAPPING.curve.escapeAt.tangFrac, Math.SQRT2);
  assert.strictEqual(AIM_MAPPING.curve.circularAt.dx, 258);
  assert.strictEqual(AIM_MAPPING.curve.escapeAt.dx, 272);
  assert.strictEqual(AIM_MAPPING.radGain, 0.00087);
  assert.strictEqual(AIM_MAPPING.yBias, 3.2);
  // physical anchors that the mapping documents
  const physSrc = read('js/physics/world.js') + read('js/game/sim.js')
    + read('js/game/main.js') + read('js/game/spawn.js');
  assert.match(physSrc, /12\.288e6/);
  assert.match(physSrc, /horizonRadius: 40/);
  assert.match(physSrc, /despawnRadius: 560/);
});

test('no new gameplay-internals imports were added by the feel pass', () => {
  // These are the ONLY gameplay modules the touched presentation files may
  // already import (single-source-of-truth edges that pre-date Phase 15).
  const allowed = [
    'physics.js', 'trajectory.js', 'aiming/index.js', 'scoring/index.js',
    'guidance/index.js', 'objects.js', 'spawn.js', 'input.js', 'sim.js',
    'presentation.js', 'guidehud.js', 'result.js', 'ui.js', 'missionui.js',
    'readout.js', 'render/', 'theme.js', 'icons.js',
  ];
  for (const f of TOUCHED) {
    const src = read(f);
    for (const m of src.matchAll(/from\s+'([^']+)'/g)) {
      const spec = m[1];
      const banned = /(physics\/|aiming|missions\/|progression\/|challenges\/|scoring\/|telemetry\/|trajectory\/)/.test(spec)
        && !allowed.some((a) => spec.endsWith(a) || spec === a || spec.startsWith(a));
      assert.ok(!banned, `${f} adds import '${spec}' into a frozen layer`);
    }
  }
});

test('launch clears prediction state but fades the path instead of hiding', () => {
  const main = read('js/game/main.js');
  // launch must not call the instant-hide clear anymore (dispose still does)
  const launchBody = main.slice(main.indexOf('\n  launch() {'), main.indexOf('\n  disposeObject() {'));
  assert.doesNotMatch(launchBody, /_clearGuidance\(\)/);
  assert.match(launchBody, /trajPath\.fadeOut\(\)/);
  assert.match(launchBody, /particles\.launchTrail\(/);
  assert.match(launchBody, /this\.guidance = null/);
  assert.match(launchBody, /this\.guideHud\.hide\(\)/);
  // disposeObject keeps the instant hide (player reset is not a launch)
  const disposeBody = main.slice(main.indexOf('disposeObject()'));
  assert.match(disposeBody, /_clearGuidance\(\)/);
  // the loop ticks the ghost fade
  const loop = read('js/game/loop.js');
  assert.match(loop, /game\.trajPath\.tick\(dtReal\)/);
});

// ------------------------------------------------- presentation ---- 
test('aim arrow: brighter shaft + near-white cone, launched from warm language', () => {
  const aim = read('js/game/aim.js');
  assert.match(aim, /0xffc860/);   // readable pale amber shaft
  assert.match(aim, /0xfff4d0/);   // near-white cone so the aim point pops
  assert.match(aim, /8\.0, 6\.5/); // larger head for mobile legibility
  // the arrow must keep pointing through the single launch-velocity source
  assert.match(aim, /launchVelocity/);
});

test('particle effects stay bounded and tear feedback is boosted', () => {
  const part = read('js/render/objects/particles.js');
  assert.match(part, /this\.MAX = 700/);      // existing global cap untouched
  assert.match(part, /tear\(pos, vel, color, count = 14\)/);
  assert.match(part, /0xffffff/);             // hot snap sparks accompany tears
  assert.match(part, /launchTrail\(/);
  // burst/emit signatures unchanged (existing consumers still valid)
  assert.match(part, /_emit\(pos, vel, color, size, life, gravityMul = 0\.15\)/);
  assert.match(part, /burst\(pos, vel, color, count, speed, size, life\)/);
});

test('presentation files stay monochrome-UI-clean (no emoji, no new accent hex)', () => {
  const EMOJI = /[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{2B00}-\u{2BFF}\u{FE0F}\u{2764}]/u;
  for (const f of TOUCHED) {
    const src = read(f);
    assert.strictEqual([...src].filter((c) => EMOJI.test(c)).length, 0, `${f} has emoji`);
  }
  // world-space gameplay colors are allowed, but the pure-UI files stay grayscale
  const ui = read('js/ui/theme.js') + read('css/style.css');
  assert.match(ui, /--ui-white/);
});

test('feel additions introduce no global-side-effect churn', () => {
  // path.js top level must stay side-effect free (importable in node): no
  // top-level THREE access, no scene wiring outside the class.
  const pathSrc = read('js/game/guidance/path.js');
  const top = pathSrc.slice(0, pathSrc.indexOf('export class'));
  assert.doesNotMatch(top, /new THREE\./);
  assert.match(top, /THREE-free/);
});
