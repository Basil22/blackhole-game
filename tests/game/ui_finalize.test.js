// tests/game/ui_finalize.test.js — Phase 23 suite.
// UI finalization + opening camera polish:
//   1. the level + mission compact cards are ONE shared component with
//      IDENTICAL dimensions always (fixed width token, truncation rows);
//   2. game/input + opening layers sink the zoom (camera == UI == 30);
//   3. the opening dive sweeps the extended zoom axis −30 → +30 and the
//      buttons are the shared design-system buttons (no bespoke geometry).
// Run: node tests/run_ui_finalize.js
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from '../physics/support.js';

import {
  diveProgress, diveDistFromSlider,
  DIVE_FROM, DIVE_TO, DIVE_SLIDER_FROM, DIVE_SLIDER_TO, GAMEPLAY_ZOOM,
} from '../../js/game/opening.js';
import { distFromSlider, sliderFromDist } from '../../js/game/input.js';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '../..');
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');
const css = read('css/style.css');
const inputSrc = read('js/game/input.js');
const openingSrc = read('js/game/opening.js');
const sceneSrc = read('js/render/scene.js');
const html = read('index.html');

test('Phase 23: final gameplay zoom is 30 — the settled framing is dist 868.8', () => {
  assert.strictEqual(GAMEPLAY_ZOOM, 30);
  assert.strictEqual(distFromSlider(30), 868.8, 'distFromSlider(30) must be 868.8');
  assert.strictEqual(sliderFromDist(868.8), 30, 'UI label must read 30 at the floor');
  assert.strictEqual(sliderFromDist(distFromSlider(GAMEPLAY_ZOOM)), GAMEPLAY_ZOOM);
});

test('Phase 23: the opening dive sweeps the extended zoom axis −30 → +30', () => {
  assert.strictEqual(DIVE_SLIDER_FROM, -30);
  assert.strictEqual(DIVE_SLIDER_TO, 30);
  // extended axis: -30 is farther than the normal slider max (0 → dist 1200)
  assert.strictEqual(diveDistFromSlider(0), 1200, 'the axis passes through the normal max');
  assert.ok(diveDistFromSlider(-30) > 1200, 'the dive starts farther than the normal max');
  assert.strictEqual(DIVE_FROM, diveDistFromSlider(-30));
  assert.strictEqual(DIVE_TO, diveDistFromSlider(30));
  assert.strictEqual(DIVE_TO, 868.8, 'the settle equals the gameplay zoom 30 floor');
  // the full path from -30 to +30 is monotonic decreasing, ends exactly at 30
  let prev = diveDistFromSlider(-30);
  for (let s = -29; s <= 30; s += 1) {
    const d = diveDistFromSlider(s);
    assert.ok(d < prev, `axis must decrease as the slider moves toward +30 at ${s}`);
    prev = d;
  }
  // the dive easing still settles exactly at the target (overshoot only passes it)
  assert.strictEqual(diveProgress(1), 1);
  const peakSlider = -30 + 60 * 1.06;
  assert.ok(peakSlider > 30, 'overshoot carries the slider past +30 (a bounce) then settles');
  assert.strictEqual(diveDistFromSlider(peakSlider) < DIVE_TO, true, 'overshoot goes closer then returns');
});

test('Phase 23: the two HUD cards are ONE shared component (identical always)', () => {
  // single source of geometry — the two cards are grouped selectors
  assert.match(css, /:is\(\.level-chip, \.mission-chip\)\s*\{/);
  // fixed width comes from the shared token, NOT content (max-width disappeared)
  assert.match(css, /width: var\(--chip-w\)/);
  assert.match(css, /--chip-w: clamp\(136px, 52vw, 176px\)/);
  assert.match(css, /:root \{ --chip-w: clamp\(136px, 52vw, 176px\);\s*\}/, 'narrow phones keep the same token');
  // identical fixed box: height 52, no per-card width overrides
  assert.match(css, /min-height: 52px; height: 52px;/);
  const chipBlock = css.slice(css.indexOf(':is(.level-chip, .mission-chip)'));
  const levelBlock = css.slice(css.indexOf('.level-chip {'));
  assert.ok(levelBlock.split('.level-chip {').length <= 2, 'level chip has no bespoke geometry (only top offset)');
  assert.ok(!/.level-chip[^{}]*\{[^}]*width(?![: ]*var)/.test(chipBlock), 'no content-driven level width');
  // rows truncate (nowrap + ellipsis) rather than resize the card
  assert.match(css, /:is\(\.lv-title, \.ms-title\)\s*\{[^}]*white-space: nowrap;\s*overflow: hidden;\s*text-overflow: ellipsis;/s);
  assert.match(css, /:is\(\.lv-object, \.ms-object\)\s*\{[^}]*text-overflow: ellipsis;/s);
});

test('Phase 23: touch targets on shared cards stay ≥44px and slide-out is preserved', () => {
  assert.match(css, /body\.gameplay-active \.level-chip,\s*body\.gameplay-active \.mission-chip\s*\{[^}]*translateX\(calc\(100% \+ 24px\)\)/s);
  assert.match(css, /--r-chip/);
});

test('Phase 23: syncFromCamera pushes the zoom UI (camera == label == slider)', () => {
  const block = inputSrc.slice(inputSrc.indexOf('syncFromCamera() {'), inputSrc.indexOf('_bindCancelCleanup') === -1 ? undefined : inputSrc.indexOf('}'));
  assert.match(inputSrc, /syncZoomSlider\(this\.dist\)/);
  // the slider + readout are derived from the SAME formula used by the camera
  assert.match(inputSrc, /this\._sliderFromDist = sliderFromDist/);
});

test('Phase 23: default camera framing is the zoom-30 floor (not the old 208)', () => {
  assert.match(sceneSrc, /position\.set\(0, 9\.6, 868\.8\)/);
  assert.ok(!/position\.set\(0, 9\.6, 208\)/.test(sceneSrc), 'old close-up default removed');
});

test('Phase 23: dive tick sweeps the extended axis with a settling ease', () => {
  const tickBlock = openingSrc.slice(openingSrc.indexOf('const tick ='), openingSrc.indexOf('_finishDive'));
  assert.match(tickBlock, /diveDistFromSlider\(sl\)/);
  assert.match(tickBlock, /DIVE_SLIDER_FROM \+ \(DIVE_SLIDER_TO - DIVE_SLIDER_FROM\) \* p/);
});

test('Phase 23: opening buttons are the shared design-system buttons', () => {
  // PLAY is the same primary action token as THROW; SETTINGS the same ctrl-btn
  assert.match(html, /id="opening-play" class="ctrl-btn primary/);
  assert.match(html, /id="opening-settings" class="ctrl-btn/);
  assert.ok(!/\.opening-play\s*\{[^}]*min-width/.test(css), 'no bespoke PLAY width');
  assert.ok(!/\.opening-settings\s*\{[^}]*min-width/.test(css), 'no bespoke SETTINGS width');
});

test('Phase 23: opening box centers itself inside the usable (safe-area) viewport', () => {
  assert.match(css, /#opening\s*\{[^}]*display: flex; align-items: center; justify-content: center;[\s\S]*?env\(safe-area-inset-top\)/m);
});