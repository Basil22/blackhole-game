// tests/game/responsive_controls.test.js — Phase 17 suite.
// Responsive gameplay controls: reversed zoom-slider semantics (LEFT = OUT /
// RIGHT = IN with an unchanged camera range) and a CANCEL action for aiming
// that restores the pre-throw state without launching, counting as a throw,
// or touching telemetry/score/mission/progression/object state.
//
// The webgame can't boot in node, so the DOM-dependent behavior is guarded at
// the source level (the same pattern as the Phase-15 feel + Phase-16 audio
// suites) while the pure logic — the zoom mapping helpers — is exercised for
// real. Audio CANCEL behavior is exercised on the pure feedback layer.
//
// Run: node tests/run_responsive_controls.js
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from '../physics/support.js';

import {
  distFromSlider, sliderFromDist, MIN_DIST, MAX_DIST,
} from '../../js/game/input.js';
import { Feedback } from '../../js/audio/feedback.js';
import { SOUNDS } from '../../js/audio/sounds.js';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '../..');
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');
const mainSrc = read('js/game/main.js');
const inputSrc = read('js/game/input.js');
const cssSrc = read('css/style.css');
const htmlSrc = read('index.html');
const uiSrc = read('js/game/ui.js');

// ---------------------------------------------------------- zoom mapping
test('zoom slider: 0 = farthest (1200) and 100 = closest (96) — LEFT=OUT, RIGHT=IN', () => {
  assert.strictEqual(distFromSlider(0), MAX_DIST);
  assert.strictEqual(distFromSlider(100), MIN_DIST);
  assert.strictEqual(MIN_DIST, 96);
  assert.strictEqual(MAX_DIST, 1200);   // camera range is UNCHANGED
});

test('zoom slider: monotonic intermediate distances (25 → 50 → 75)', () => {
  const d25 = distFromSlider(25);
  const d50 = distFromSlider(50);
  const d75 = distFromSlider(75);
  assert.ok(d25 > d50 && d50 > d75, 'dist must fall as the slider moves right');
  assert.strictEqual(d50, 648);         // exact midpoint of the unchanged range
});

test('zoom slider: slider↔distance round-trip is exact at all sample points', () => {
  for (const v of [0, 25, 50, 75, 100]) {
    assert.strictEqual(sliderFromDist(distFromSlider(v)), v);
  }
  assert.strictEqual(sliderFromDist(MAX_DIST), 0);
  assert.strictEqual(sliderFromDist(MIN_DIST), 100);
});

test('zoom slider: out-of-range slider values clamp to the camera endpoints', () => {
  assert.strictEqual(distFromSlider(-5), MAX_DIST);
  assert.strictEqual(distFromSlider(150), MIN_DIST);
});

test('zoom slider: pinch path untouched — raw distance clamp still guards the range', () => {
  assert.match(inputSrc, /this\.dist = Math\.max\(MIN_DIST, Math\.min\(MAX_DIST, this\.dist \/ f\)\);/);
  assert.match(inputSrc, /syncZoomSlider\(this\.dist\)/);
});

test('zoom slider: the pure helpers are what the slider input handler uses', () => {
  assert.match(inputSrc, /this\.dist = distFromSlider\(parseFloat\(zoomSlider\.value\)\);/);
  assert.match(inputSrc, /zoomSlider\.value = String\(sliderFromDist\(this\.dist\)\);/);
  assert.match(inputSrc, /sliderFromDist/);
});

// ---------------------------------------------------------- CANCEL semantics
test('cancel: a dedicated cancelAim() restores idle without launching', () => {
  const cancelBody = mainSrc.slice(
    mainSrc.indexOf('cancelAim() {'),
    mainSrc.indexOf('// ---------- aim arrow ----------'),
  );
  assert.match(cancelBody, /this\.state = 'idle'/);
  assert.match(cancelBody, /_disposeHeld\(\)/);
  assert.match(cancelBody, /_clearGuidance\(\)/);
  assert.match(cancelBody, /this\.aimArrow\.hide\(\)/);
  assert.doesNotMatch(cancelBody, /launch\(\)/);
  assert.doesNotMatch(cancelBody, /onAimEnd/);
  assert.match(cancelBody, /this\.audio\?\.cancel\(\)/);
});

test('cancel: NOT a throw — no telemetry / score / mission / progression writes', () => {
  const cancelBody = mainSrc.slice(
    mainSrc.indexOf('cancelAim() {'),
    mainSrc.indexOf('// ---------- aim arrow ----------'),
  );
  for (const banned of [
    'createThrowTelemetry', 'finalizeThrow', 'calculateThrowScore',
    'lastTelemetry', 'lastScore', 'throwCount', 'progression', 'mission',
    'TERMINATION', 'objects.push',
  ]) {
    assert.doesNotMatch(cancelBody, new RegExp(banned), `cancelAim must not touch ${banned}`);
  }
});

test('cancel: object selection and size survive (cancel never despawns the chosen object)', () => {
  const cancelBody = mainSrc.slice(
    mainSrc.indexOf('cancelAim() {'),
    mainSrc.indexOf('// ---------- aim arrow ----------'),
  );
  assert.doesNotMatch(cancelBody, /currentId|this\.size =|selectObject|disposeObject\(\)/);
});

test('cancel: input Escape key cancels aim, and only while aiming', () => {
  assert.match(inputSrc, /Escape/);
  assert.match(inputSrc, /cb\.isAiming\(\)/);
  assert.match(inputSrc, /onCancelAim/);
  assert.match(mainSrc, /onCancelAim: \(\) => this\.cancelAim\(\)/);
});

test('cancel button: semantic button in the HUD with an accessible label + close icon', () => {
  assert.match(htmlSrc, /id="cancel-btn"/);
  assert.match(htmlSrc, /aria-label="Cancel aiming"/);
  assert.match(htmlSrc, /button[^>]*type="button"/);
  assert.match(htmlSrc, /M6 6 L18 18 M18 6 L6 18/);   // monochrome close icon
  // button order: THROW first, cancel right after it inside #bottom-controls
  assert.ok(htmlSrc.indexOf('throw-btn') < htmlSrc.indexOf('cancel-btn'));
});

test('cancel button: UI wires the click to Game.cancelAim and swaps rows while aiming', () => {
  assert.match(uiSrc, /cancelBtn\.addEventListener\('click', \(\) => this\.game\.cancelAim\(\)\)/);
  assert.match(uiSrc, /bc\.classList\.add\('aiming'\)/);
  assert.match(uiSrc, /bc\.classList\.remove\('aiming'\)/);
});

test('cancel button: CSS hides it by default and shows it ONLY in the aiming row', () => {
  assert.match(cssSrc, /\.cancel-btn\s*\{[^}]*display:\s*none/);
  assert.match(cssSrc, /#bottom-controls\.aiming #cancel-btn\s*\{[^}]*display:\s*inline-flex/);
  assert.match(cssSrc, /#bottom-controls\.aiming #throw-btn/);
  assert.match(cssSrc, /#bottom-controls\.aiming #slowmo-btn/);
});

test('cancel button: secondary visual language — no red, no pill, thin border, 44px+ target', () => {
  assert.match(cssSrc, /\.cancel-btn\s*\{[^}]*border-color:\s*var\(--ui-border-strong\);/);
  // Phase 21: inherits .ctrl-btn min-height via the shared sizing token (44px)
  assert.match(cssSrc, /\.ctrl-btn\s*\{[^}]*min-height:\s*var\(--btn-min-h\)/);
  assert.match(cssSrc, /--btn-min-h:\s*44px/);
  assert.doesNotMatch(cssSrc, /#cancel-btn[^{]*\{[^}]*#f\w{2}|#cancel-btn[^{]*\{[^}]*red/i);
});

// ---------------------------------------------------------- audio CANCEL
test('cancel audio: catalog has the event, muted-aware, throttled like the rest', () => {
  assert.ok(SOUNDS.cancel, 'cancel event missing from the catalog');
  assert.strictEqual(SOUNDS.cancel.kind, 'tick');   // subtle, never launch-like
  const calls = { sound: [], haptic: [] };
  const fb = new Feedback({
    playSound: (n) => calls.sound.push(n),
    vibrate: (g) => calls.haptic.push(g),
  });
  fb.cancel();
  assert.deepStrictEqual(calls.sound, ['cancel']);
  assert.deepStrictEqual(calls.haptic, ['tap']);    // UI-only: light tap
});

test('cancel audio: is UI feedback — never a launch/capture/escape/horizon/mission signal', () => {
  const cancelBody = mainSrc.slice(
    mainSrc.indexOf('cancelAim() {'),
    mainSrc.indexOf('// ---------- aim arrow ----------'),
  );
  assert.doesNotMatch(cancelBody, /audio\?\.(launch|capture|escape|horizon|missionComplete|missionFailed|missionUnlock)/);
  assert.match(cancelBody, /audio\?\.cancel\(\)/);
  // the disposeObject() reset path stays fully silent (Phase-15 semantics)
  const disposeBody = mainSrc.slice(
    mainSrc.indexOf('disposeObject() {'),
    mainSrc.indexOf('toggleSlowmo() {'),
  );
  assert.doesNotMatch(disposeBody, /audio/);
});

// ---------------------------------------------------------- responsive UI
test('responsive: small-screen HUD tightens the SIZE→ZOOM cluster but keeps targets', () => {
  assert.match(cssSrc, /@media \(max-width: 480px\)/);
  const mq = cssSrc.slice(cssSrc.indexOf('@media (max-width: 480px)'), cssSrc.indexOf('prefers-reduced-motion'));
  assert.match(mq, /#hud\s*\{[^}]*gap:\s*4px/);
  assert.match(mq, /#size-slider,\s*#zoom-slider\s*\{[^}]*width:\s*min\(44vw,\s*176px\);[^}]*height:\s*44px/);
  assert.match(mq, /obj-btn[^}]*min-height:\s*48px/);
});

test('responsive: base HUD already honors the home-indicator safe area', () => {
  assert.match(cssSrc, /#hud\s*\{[^}]*env\(safe-area-inset-bottom\)/);
});

test('responsive: no JS viewport polling — layout is CSS media-queries only', () => {
  assert.doesNotMatch(uiSrc, /matchMedia|innerWidth|ResizeObserver|getBoundingClientRect/);
  assert.doesNotMatch(mainSrc, /matchMedia|innerWidth|ResizeObserver/);
});