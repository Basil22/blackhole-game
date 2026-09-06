// tests/game/ui_identity.test.js — Phase 30 cartoon UI identity guards.
// Verifies the presentation layer stays on-brand WITHOUT touching gameplay:
//   - no emoji anywhere in the UI source
//   - centralized branding exists (theme module + wordmark in markup/title)
//   - cartoon palette + rounded radius tokens exist; no legacy flat-gray style
//   - buttons remain semantic <button> elements
//   - mission state text (CURRENT / COMPLETED / LOCKED) is always present
//   - difficulty stays textual/accessible (dots + aria-label)
//   - object picker renders SVG icons (no emoji), one per catalog object
//   - icon system is monochrome stroke SVG
//   - reduced-motion rules remain in the stylesheet
//   - radius system is rounded (10–18 px, never pill ≥ 999 px)
//   - the UI layer never mutates gameplay data (no physics/game imports)
//   - the --comic-accent / old #ffd07d pre-Phase-30 accent is gone
// Run: node tests/run_ui_identity.js
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from '../physics/support.js';
import { BRAND, COLORS, RADIUS, TYPO, applyBranding } from '../../js/ui/theme.js';
import { icon, iconForObject, iconNames } from '../../js/ui/icons.js';
import { CATALOG } from '../../js/objects.js';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '../..');
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

// Strict emoji detection — pictographs + variation selectors + classic emoji
// ranges. Geometric text glyphs used by the difficulty dots (● ○) are excluded
// on purpose (the design brief explicitly sanctions ●●●○○).
const EMOJI = /[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{2B00}-\u{2BFF}\u{FE0F}\u{2764}]/u;

const UI_SOURCES = [
  'index.html',
  'js/main.js',
  'js/game/ui.js',
  'js/game/missionui.js',
  'js/game/campaignui.js',
  'js/game/campaign/levels.js',
  'js/game/campaign/state.js',
  'js/game/campaign/storage.js',
  'js/game/campaign/campaign.js',
  'js/game/result.js',
  'js/game/guidehud.js',
  'js/game/presentation.js',
  'js/game/readout.js',
  'js/game/opening.js',
  'js/game/settingsui.js',
  'js/game/settings/model.js',
  'js/game/settings/storage.js',
  'js/game/settings/index.js',
  'js/ui/theme.js',
  'js/ui/icons.js',
  'css/style.css',
  'manifest.webmanifest',
];

// Phase 30: pre-Phase-30 dark-surface / flat-gray palette hexes must be gone
// (the indigo surfaces + cartoon palette replaced them).
const LEGACY_COLORS = [
  '#ffb060', '#ff7a30', '#ffd8a8', '#ffd166', '#ff6b5e', '#7ce0a0',
  '#8a9bff', '#cdd6ff', '#3a8fdd', '#ff4d4d', '#ffb060', '#ffd166',
  '#e8ecf5', '#c6cede', '#9aa4c0', '#8f98b5', '#6b7590', '#8a93b8',
  '#2a3450', '#131a2e', '#0d1120', '#05060a', '#2e6e4f', '#3a8fdd',
  '#ff7a30', '#1a0e04', '#1a120a',
];

// ---------------------------------------------------------------- emoji ----
test('UI sources contain no emoji characters', () => {
  for (const f of UI_SOURCES) {
    const src = read(f);
    const found = [...src].filter((c) => EMOJI.test(c));
    assert.ok(found.length === 0, `${f} contains ${JSON.stringify(found)}`);
  }
});

test('object catalog emoji fields are never rendered by the UI layer', () => {
  const uiSrc = read('js/game/ui.js');
  // ui.js renders picker icons from js/ui/icons.js, never from CATALOG icons
  assert.ok(uiSrc.includes('iconForObject'), 'picker must route icons through the icon system');
  assert.ok(!uiSrc.includes('def.icon'), 'picker must not interpolate raw catalog icons');
});

// ----------------------------------------------------------------- brand ----
test('branding is centralized in the theme module', () => {
  assert.strictEqual(BRAND.name, 'BLACK HOLE');
  assert.strictEqual(BRAND.shortName, 'BLACK HOLE');
  assert.ok(typeof BRAND.tagline === 'string' && BRAND.tagline.length > 0);
});

test('applyBranding sets the document title and wordmark safely', () => {
  let title = null;
  let text = null;
  globalThis.document = {
    title: 'x',
    querySelector: () => ({ set textContent(v) { text = v; } }),
  };
  applyBranding({ title: 'BLACK HOLE — TEST', wordmark: 'BLACK HOLE' });
  title = globalThis.document.title;
  assert.strictEqual(title, 'BLACK HOLE — TEST');
  assert.strictEqual(text, 'BLACK HOLE');
  delete globalThis.document;
});

test('index.html carries the brand wordmark + brand title (no legacy naming)', () => {
  const html = read('index.html');
  assert.ok(html.includes('Black Hole'), 'wordmark text');
  assert.ok(html.includes('data-brand'), 'wordmark is JS-driven');
  const main = read('js/main.js');
  assert.ok(main.includes('applyBranding'), 'document title set via applyBranding');
  assert.ok(main.includes('BLACK HOLE'), 'title uses the BRAND.name constant');
  assert.ok(!/Event Horizon|EVENT HORIZON/.test(html + main), 'legacy naming gone');
});

// ------------------------------------------------------- color system ------
test('Phase 30 cartoon palette exists in the theme module', () => {
  // The palette has exactly the 7 semantic colours (no strict grayscale).
  const hexRe = /^#[0-9a-f]{6}$/i;
  const paletteKeys = ['orange', 'yellow', 'blue', 'magenta', 'green', 'ink', 'white'];
  for (const k of paletteKeys) {
    assert.ok(k in COLORS, `missing palette colour ${k}`);
    assert.ok(hexRe.test(COLORS[k]), `${k} must be a hex colour`);
  }
});

test('no legacy colorful pre-Phase-30 UI hex remains in the stylesheet', () => {
  const css = read('css/style.css');
  for (const hex of LEGACY_COLORS) {
    assert.ok(!css.toLowerCase().includes(hex), `legacy color ${hex} still present`);
  }
});

test('the old Phase-29 single-amber accent is gone from the stylesheet', () => {
  const css = read('css/style.css').toLowerCase();
  assert.ok(!css.includes('#ffd07d'), 'old #ffd07d accent still present');
  assert.ok(!css.includes('--comic-accent'), 'old --comic-accent var still present');
});

// -------------------------------------------------------- typography --------
test('typography stack is the Phase-30 cartoon Luckiest Guy chain', () => {
  assert.ok(TYPO.stack.includes('Luckiest Guy'), 'Luckiest Guy is the primary UI font');
  assert.ok(TYPO.stack.includes('Impact'), 'Impact fallback for cartoony weight');
  const css = read('css/style.css');
  assert.ok(css.includes('--font-ui'), 'font token in CSS');
  assert.ok(css.includes('Luckiest Guy'), 'CSS references the cartoon font');
});

test('stylesheets use the centralized font token for UI text', () => {
  const css = read('css/style.css');
  assert.ok(css.includes('font-family: var(--font-ui)'));
});

// --------------------------------------------------------- buttons ----------
test('all interactive controls remain semantic <button> elements', () => {
  const html = read('index.html');
  const buttons = (html.match(/<button/g) || []).length;
  assert.ok(buttons >= 8, `only ${buttons} <button> elements in markup`);
  const ui = read('js/game/ui.js');
  assert.ok(ui.includes("createElement('button')"), 'picker builds <button> nodes');
  const result = read('js/game/result.js');
  assert.ok(result.includes("createElement('button')"), 'result panel builds a <button>');
});

test('buttons are rounded cartoon-style (0 px default, never pill)', () => {
  const css = read('css/style.css');
  assert.ok(css.includes('--r-btn: var(--radius-sm)'), 'button radius token = --radius-sm');
  assert.ok(!/border-radius:\s*999/.test(css), 'no pill radius');
});

test('radius tokens are cartoon-rounded (0 px, never pill)', () => {
  for (const [k, v] of Object.entries(RADIUS)) {
    const px = parseInt(v, 10);
    assert.ok(px === 0, `${k} radius ${v} must be 0px`);
  }
  const css = read('css/style.css');
  for (const line of css.split('\n')) {
    if (/border-radius\s*:\s*999/.test(line)) {
      assert.fail(`pill radius in ${line.trim()}`);
    }
  }
});

test('touch targets are not smaller than 44px', () => {
  const css = read('css/style.css');
  assert.ok(css.includes('--btn-icon: 44px'), 'icon button token');
  assert.ok(css.includes('--btn-min-h: 44px'), 'control button token');
  assert.ok(css.includes('--btn-min-h-action: 48px'), 'primary action token');
  assert.ok(css.includes('.icon-btn {\n  width: var(--btn-icon); height: var(--btn-icon);'));
  assert.ok(css.includes('min-height: var(--btn-min-h)'));
  assert.ok(css.includes('min-height: 46px'));
  assert.ok(css.includes('height: 44px;') || css.includes('min-height: 44px'),
    'slider rows keep 44px touch height');
});

test('primary button is filled Cadmium Orange + Canary on hover', () => {
  const css = read('css/style.css');
  assert.ok(css.includes('.ctrl-btn.primary'), 'primary class exists');
  assert.ok(css.includes('#FF6B1A'), 'primary = Cadmium Orange fill');
  // Hover accents with Canary Yellow, keeping the filled-cartoon look.
  assert.ok(/(\.ctrl-btn\.primary:hover[\s\S]{0,120}background:\s*var\(--c-yellow\))/.test(css),
    'primary hover swaps to Canary');
  // The regular button inversion (white-on-black hover) may still exist for
  // neutral .ctrl-btn/.icon-btn, but the primary CTA must stay filled.
  assert.ok(!css.includes('.ctrl-btn.primary:hover {\n  background: var(--ui-white)'),
    'primary hover must not invert to white');
});

test('disabled buttons are clearly identifiable', () => {
  const css = read('css/style.css');
  assert.ok(css.includes('.icon-btn:disabled') || css.includes('.ctrl-btn:disabled'));
  assert.ok(/disabled[\s\S]{0,80}color: var\(--ui-gray-3\)/.test(css), 'muted disabled text');
});

// ------------------------------------------------- mission state text ------
test('mission state text CURRENT / COMPLETED / LOCKED is written by the UI', () => {
  const src = read('js/game/missionui.js');
  for (const s of ['LOCKED', 'COMPLETED', 'CURRENT']) {
    assert.ok(src.includes(`'${s}'`), `state text ${s} missing`);
  }
});

test('mission states are never conveyed by color alone', () => {
  const css = read('css/style.css');
  const src = read('js/game/missionui.js');
  assert.ok(src.includes('state.textContent'), 'state label written to DOM');
  assert.ok(css.includes('.ms-option.current .ms-state'));
  assert.ok(css.includes('.ms-option.completed .ms-state'));
  assert.ok(css.includes('.ms-option.locked'));
});

test('difficulty remains textual and accessible', () => {
  const cat = read('js/game/challenges/catalog.js');
  assert.ok(cat.includes('aria'), 'difficulty exposes accessible label');
  assert.ok(cat.includes('Difficulty'), 'difficulty has spoken text');
  const ui = read('js/game/missionui.js');
  assert.ok(ui.includes('aria-label'), 'detail dots carry aria-label');
});

// ---------------------------------------------------------- icons -----------
test('icon system is monochrome stroke SVG, no emoji', () => {
  assert.ok(iconNames().length >= 12, `only ${iconNames().length} icons`);
  for (const name of iconNames()) {
    const s = icon(name);
    assert.ok(s.startsWith('<svg'), `${name} is an svg`);
    assert.ok(s.includes('stroke="currentColor"'), `${name} monochrome stroke`);
    assert.ok(s.includes('aria-hidden="true"'), `${name} decorative`);
    assert.ok(!EMOJI.test(s), `${name} has no emoji`);
  }
});

test('every catalog object has a picker icon', () => {
  for (const def of CATALOG) {
    const svg = icon(iconForObject(def.id));
    assert.ok(svg.includes('<path'), `${def.id} icon renders`);
    assert.ok(!EMOJI.test(svg), `${def.id} icon is not emoji`);
  }
});

test('markup icons are decorative svg with accessible controls', () => {
  const html = read('index.html');
  const svgs = (html.match(/<svg/g) || []).length;
  assert.ok(svgs >= 4, `only ${svgs} inline svgs`);
  assert.ok(html.includes('aria-hidden="true"'), 'decorative icons hidden');
  assert.ok(!html.includes('aria-label="Share capture"'), 'Phase 21: no share button');
  assert.ok(html.includes('aria-label="Capture frame"'));
  assert.ok(html.includes('aria-label="Toggle slow motion"'));
  assert.ok(html.includes('aria-label="Menu"'));
});

// ---------------------------------------------------- accessibility --------
test('dialogs keep role=dialog and aria semantics', () => {
  const html = read('index.html');
  assert.ok(html.includes('role="dialog"'));
  assert.ok(html.includes('aria-modal="true"'));
  assert.ok(html.includes('aria-haspopup="dialog"'));
  assert.ok(html.includes('aria-live="polite"'));
});

test('focus-visible outline is defined globally', () => {
  const css = read('css/style.css');
  assert.ok(css.includes(':focus-visible'), 'focus state present');
});

test('reduced-motion rules remain in the stylesheet', () => {
  const css = read('css/style.css');
  assert.ok(css.includes('@media (prefers-reduced-motion: reduce)'));
  assert.ok(/animation:\s*none/.test(css));
});

// -------------------------------------------------- motion contract --------
test('UI motion is subtle (opacity/translate/small scale, no bounce)', () => {
  const css = read('css/style.css');
  // The word "bounce" may appear in design comments — only actual bouncy
  // easing/timing declarations are banned.
  for (const bad of ['cubic-bezier(.34,1.56', '; cubic-bezier(1.6', 'timing-function: (bounce|elastic|back)',
    'cubic-bezier(.*1\.2.*1\.7', 'ease-in-out-back', 'ease-out-back', 'elastic\\)', 'cubic-bezier(1,( 1)?0']) {
    assert.ok(!css.includes(bad), `bouncy easing present: ${bad}`);
  }
  assert.ok(css.includes('rs-fade-up'), 'existing result reveal preserved');
});

// ---------------------------------------------------- radius system --------
test('radius tokens are cartoon-rounded (0 px, never pill)', () => {
  for (const [k, v] of Object.entries(RADIUS)) {
    const px = parseInt(v, 10);
    assert.ok(px === 0, `${k} radius ${v} must be 0px`);
  }
  const css = read('css/style.css');
  for (const line of css.split('\n')) {
    if (/border-radius\s*:\s*999/.test(line)) {
      assert.fail(`pill radius in ${line.trim()}`);
    }
  }
});

// ------------------------------------------- gameplay-data immutability ---
test('presentation modules never import physics/game-engine code', () => {
  for (const rel of ['js/ui/theme.js', 'js/ui/icons.js', 'js/game/presentation.js']) {
    const src = read(rel);
    assert.ok(!src.includes("from '../physics"), `${rel} imports physics`);
    assert.ok(!src.includes("from '../objects.js"), `${rel} imports object catalog`);
    assert.ok(!src.includes("from '../game/"), `${rel} imports game engine`);
  }
});

test('icon/theme modules are pure (no DOM at import time)', () => {
  const theme = read('js/ui/theme.js');
  assert.ok(theme.includes("typeof document === 'undefined'"),
    'DOM access is guarded behind an environment check');
  assert.strictEqual(applyBranding(), undefined, 'applyBranding no-ops without a DOM');
});

test('UI redesign left gameplay data untouched', () => {
  const objs = read('js/objects.js');
  for (const id of ['rock', 'human', 'ship', 'planet']) {
    assert.ok(objs.includes(`id: '${id}'`));
  }
  const mapping = read('js/game/aiming/mapping.js');
  assert.ok(mapping.includes('aimToVelocity'));
  const ui = read('js/game/ui.js');
  assert.ok(!/world\.(add|step|bodies)/.test(ui));
});
