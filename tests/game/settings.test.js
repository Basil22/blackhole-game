// tests/game/settings.test.js — Phase 20 suite.
// Opening experience + settings: pure settings model (defaults, normalize,
// immutable toggles, reduced-motion resolution), best-effort persistence, the
// Settings controller, the opening dive easing, and source-level guards for
// the DOM wiring (title screen, settings modal, input lock, haptics hooks).
// Run: node tests/run_settings.js
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from '../physics/support.js';

import {
  SETTINGS_VERSION, SETTINGS_KEYS,
  createDefaultSettings, normalizeSettings, setSetting, effectiveReduceMotion,
  SETTINGS_STORAGE_KEY, loadSettings, saveSettings, clearSettings, Settings,
} from '../../js/game/settings/index.js';
import { diveProgress } from '../../js/game/opening.js';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '../..');
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');
const main = read('js/main.js');
const html = read('index.html');
const css = read('css/style.css');
const inputSrc = read('js/game/input.js');
const hapticsSrc = read('js/audio/haptics.js');
const audioIdx = read('js/audio/index.js');
const openingSrc = read('js/game/opening.js');
const settingsuiSrc = read('js/game/settingsui.js');

const mem = () => {
  const m = new Map();
  return {
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => m.set(k, String(v)),
    removeItem: (k) => m.delete(k),
    _m: m,
  };
};

// ---------------------------------------------------------------- model ----
test('defaults: audio+haptics on, skipIntro+reduceMotion off', () => {
  const d = createDefaultSettings();
  assert.strictEqual(d.audio, true);
  assert.strictEqual(d.haptics, true);
  assert.strictEqual(d.skipIntro, false);
  assert.strictEqual(d.reduceMotion, false);
  assert.strictEqual(d.version, SETTINGS_VERSION);
  assert.ok(Object.isFrozen(d));
});

test('normalize falls back to defaults on garbage / wrong version / null', () => {
  const bad = [null, undefined, 42, 'x', {}, { version: 99 }, { version: SETTINGS_VERSION, audio: 'yes' }];
  for (const raw of bad) {
    const d = normalizeSettings(raw);
    assert.deepStrictEqual(d, createDefaultSettings());
  }
});

test('normalize preserves a valid stored state and coerces per-field', () => {
  const ok = normalizeSettings({ version: SETTINGS_VERSION, audio: false, haptics: true, skipIntro: true, reduceMotion: false });
  assert.strictEqual(ok.audio, false);
  assert.strictEqual(ok.skipIntro, true);
  const partial = normalizeSettings({ version: SETTINGS_VERSION, skipIntro: true });
  assert.strictEqual(partial.skipIntro, true);
  assert.strictEqual(partial.audio, true); // missing field → default
});

test('setSetting is immutable, known-keys-only, identity no-op on same value', () => {
  const d = createDefaultSettings();
  const a = setSetting(d, 'audio', false);
  assert.notStrictEqual(a, d);
  assert.strictEqual(a.audio, false);
  assert.strictEqual(d.audio, true);        // original untouched
  assert.strictEqual(setSetting(a, 'audio', false), a); // same value → same ref
  assert.strictEqual(setSetting(a, 'bogus', true), a);  // unknown key → same ref
  assert.strictEqual(setSetting(a, 'skipIntro', true).skipIntro, true);
  assert.ok(Object.isFrozen(a));
});

test('effectiveReduceMotion: system pref OR explicit toggle', () => {
  const off = createDefaultSettings();
  assert.strictEqual(effectiveReduceMotion(off, false), false);
  assert.strictEqual(effectiveReduceMotion(off, true), true);        // system wins
  const on = setSetting(off, 'reduceMotion', true);
  assert.strictEqual(effectiveReduceMotion(on, false), true);        // explicit wins
  assert.strictEqual(effectiveReduceMotion(on, true), true);         // both
  assert.strictEqual(effectiveReduceMotion(null, false), false);     // defensive
});

// ------------------------------------------------------------- storage ----
test('storage: save→load round-trips; corrupt/missing collapse to defaults', () => {
  const s = mem();
  assert.deepStrictEqual(loadSettings(s), createDefaultSettings()); // nothing stored
  const state = normalizeSettings({ version: SETTINGS_VERSION, skipIntro: true, haptics: false });
  assert.strictEqual(saveSettings(state, s), true);
  const back = loadSettings(s);
  assert.strictEqual(back.skipIntro, true);
  assert.strictEqual(back.haptics, false);
  s._m.set(SETTINGS_STORAGE_KEY, '{oops');
  assert.deepStrictEqual(loadSettings(s), createDefaultSettings()); // corrupt
});

test('storage: missing backend / throwing storage never escapes', () => {
  assert.deepStrictEqual(loadSettings(null), createDefaultSettings());
  assert.strictEqual(saveSettings(createDefaultSettings(), null), false);
  const thrower = { getItem: () => { throw new Error('nope'); }, setItem: () => { throw new Error('nope'); } };
  assert.deepStrictEqual(loadSettings(thrower), createDefaultSettings());
  assert.strictEqual(saveSettings(createDefaultSettings(), thrower), false);
  assert.strictEqual(clearSettings(thrower), false);
});

// ---------------------------------------------------------- controller ----
test('Settings: loads defaults, applies current state, and persists real changes', () => {
  const s = mem();
  const settings = new Settings({ storage: s, systemPref: () => false });
  const applied = [];
  settings.onApply = (state, key) => applied.push(key);
  assert.strictEqual(settings.get('audio'), true);
  assert.strictEqual(settings.set('audio', false), true);
  assert.deepStrictEqual(applied, ['audio']);
  assert.deepStrictEqual(applied.length, 1);
  assert.strictEqual(loadSettings(s).audio, false); // persisted
  assert.strictEqual(settings.set('audio', false), false); // no-op
});

test('Settings: reduceMotionEffective reads the injected system pref', () => {
  const settings = new Settings({ storage: mem(), systemPref: () => true });
  assert.strictEqual(settings.reduceMotionEffective, true);
  const s2 = new Settings({ storage: mem(), systemPref: () => false });
  s2.set('reduceMotion', true);
  assert.strictEqual(s2.reduceMotionEffective, true);
  assert.strictEqual(settings.get('skipIntro'), false);
});

test('Settings: reset restores defaults and re-applies', () => {
  const s = mem();
  const settings = new Settings({ storage: s });
  settings.set('audio', false);
  settings.set('skipIntro', true);
  let lastKey = null;
  settings.onApply = (_st, key) => { lastKey = key; };
  settings.reset();
  assert.strictEqual(settings.get('audio'), true);
  assert.strictEqual(settings.get('skipIntro'), false);
  assert.strictEqual(lastKey, null);
});

// ---------------------------------------------------------------- opening --
test('diveProgress: starts at 0, ends exactly at 1, never exceeds the cap', () => {
  assert.strictEqual(diveProgress(0), 0);
  assert.strictEqual(diveProgress(1), 1);
  assert.ok(diveProgress(0.5) > 0 && diveProgress(0.5) < 1);
  for (let i = 0; i <= 200; i++) {
    const v = diveProgress(i / 200);
    assert.ok(v >= 0 && v <= 1.06, `out of range at ${i / 200}: ${v}`);
  }
});

test('diveProgress: accelerating entry (not linear) and a real overshoot peak', () => {
  const q = 0.25, h = 0.5, tq = 0.75;
  // ease-in: the first quarter covers less than a linear quarter
  assert.ok(diveProgress(q) < q + 0.05, 'slow start expected');
  assert.ok(diveProgress(h) < 0.6, 'fast middle expected');
  const peak = Math.max(...Array.from({ length: 101 }, (_, i) => diveProgress(i / 100)));
  assert.ok(peak > 1 && peak <= 1.06, `overshoot beyond target: ${peak}`);
  // the approach is effectively settled before the very end (then exactly 1)
  assert.ok(diveProgress(0.95) > 0.9, 'settles near the end');
});

test('opening: reduced-motion / skip-intro paths bypass the dive entirely', () => {
  // the pure guard: dive only when the full intro plays
  const guards = [
    `!this.settings.get('skipIntro')`,
    `!this.settings.reduceMotionEffective`,
  ];
  for (const g of guards) assert.match(openingSrc, new RegExp(g.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  // exposure is gated behind intro-diving only
  assert.match(css, /intro-diving/);
});

// ---------------------------------------------------------- source guards --
test('source: opening + settings markup exists in index.html', () => {
  assert.match(html, /id="opening"/);
  assert.match(html, /id="opening-play"/);
  assert.match(html, /opening-sub">SPACE STUDIO/);
  assert.match(html, /opening-skip-hint/);
  assert.match(html, /id="settings-modal"/);
  assert.match(html, /id="setting-rows"/);
  assert.match(html, /id="settings-close"/);
  assert.match(html, /id="settings-open"/);
});

test('source: no skip-intro button on the opening screen (only the hint)', () => {
  assert.ok(!/opening-skip-btn/.test(html), 'a dedicated skip button must not exist');
  assert.ok(!/id="opening-skip-btn"/.test(html));
  assert.match(html, /Enable Skip Intro in Settings/);
  // the hint must not carry a button element
  const hintBlock = html.slice(html.indexOf('id="opening-skip-hint"'), html.indexOf('</p>', html.indexOf('id="opening-skip-hint"')) + 4);
  assert.ok(!/<button/.test(hintBlock), 'hint contains no button');
});

test('source: input lock + settle hook exist (keyboard gate, orbit handoff)', () => {
  assert.match(inputSrc, /setLocked/);
  assert.match(inputSrc, /syncFromCamera/);
  assert.match(inputSrc, /if \(this\._locked\) return;/);
});

test('source: haptics expose settings hooks (enabled + reduced-motion)', () => {
  assert.match(hapticsSrc, /setEnabled/);
  assert.match(hapticsSrc, /setReducedMotion/);
  assert.match(hapticsSrc, /_enabled/);
  assert.match(audioIdx, /setHapticsEnabled/);
  assert.match(audioIdx, /setHapticsReducedMotion/);
});

test('source: main.js wires the Phase-20 boot (settings, UI, opening)', () => {
  assert.match(main, /new Settings\(/);
  assert.match(main, /new SettingsUI\(/);
  assert.match(main, /new OpeningScreen\(/);
  assert.match(main, /opening\.begin\(\)/);
  assert.match(main, /settings-open/);
  assert.match(main, /bh_audio_enabled/); // legacy mirror retained
  assert.match(main, /applySettings/);
});

test('source: settings UI is declarative + DOM built once (no per-frame work)', () => {
  const ROW_DECL = /SETTING_ROWS\s*=\s*\[\s*\{[^;]*key: 'audio'[^;]*key: 'reduceMotion'/s;
  assert.match(settingsuiSrc, ROW_DECL);
  assert.match(settingsuiSrc, /role="switch"/);
  assert.match(settingsuiSrc, /aria-checked/);
  // innerHTML used exactly twice, both inside _build (clear + row template)
  assert.strictEqual((settingsuiSrc.match(/innerHTML\s*=/g) || []).length, 2, 'innerHTML only in _build');
  const buildBlock = settingsuiSrc.slice(settingsuiSrc.indexOf('_build() {'), settingsuiSrc.indexOf('_bind() {'));
  assert.strictEqual((buildBlock.match(/innerHTML\s*=/g) || []).length, 2, 'both innerHTML writes inside _build');
  const refreshBlock = settingsuiSrc.slice(settingsuiSrc.indexOf('refresh() {'), settingsuiSrc.indexOf('open() {'));
  assert.ok(!/innerHTML/.test(refreshBlock), 'refresh is text/class-only');
  assert.strictEqual((openingSrc.match(/innerHTML/g) || []).length, 0, 'opening never writes innerHTML');
});

test('source: dive animation never allocates or writes DOM per frame', () => {
  // the rAF tick only moves the camera — no style/DOM writes inside it
  const tickBlock = openingSrc.slice(openingSrc.indexOf('const tick ='), openingSrc.indexOf('_finishDive'));
  assert.match(tickBlock, /cam\.position\.set/);
  assert.ok(!/style|innerHTML|classList/.test(tickBlock), 'tick touches only the camera');
});

test('source: settings + opening respect monochrome/44px/reduced-motion rules', () => {
  assert.match(css, /\.settings-modal/);
  assert.match(css, /\.set-toggle\s*\{[^}]*min-height: 44px/s);
  // Phase 23 — opening buttons ARE the shared design-system buttons: PLAY is
  // the same `.ctrl-btn.primary` (48px action token) as THROW, SETTINGS the
  // same `.ctrl-btn` (44px) as CANCEL — no bespoke opening geometry.
  assert.match(css, /\.ctrl-btn\.primary\s*\{[^}]*min-height: var\(--btn-min-h-action\)/s);
  assert.match(css, /--btn-min-h-action: 48px/);
  assert.match(css, /\.ctrl-btn\s*\{[^}]*min-height: var\(--btn-min-h\)/s);
  assert.match(css, /--btn-min-h: 44px/);
  assert.ok(!/\.opening-play\s*\{/.test(css), 'no bespoke PLAY geometry in opening CSS');
  assert.ok(!/\.opening-settings\s*\{/.test(css), 'no bespoke SETTINGS geometry in opening CSS');
  assert.match(css, /#opening\s*\{[^}]*z-index: 60/s);
  assert.match(css, /\.settings-modal\s*\{[^}]*z-index: 70/s);
  assert.match(css, /prefers-reduced-motion: reduce/);
  assert.match(css, /body\.intro-diving #vignette/);
});

test('source: settings persist locally under the versioned key', () => {
  assert.match(main, /SETTINGS_STORAGE_KEY/);
  assert.strictEqual(SETTINGS_STORAGE_KEY, 'blackhole-game:settings:v1');
  assert.ok(SETTINGS_KEYS.length >= 4);
});