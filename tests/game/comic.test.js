// tests/game/comic.test.js — Phase 29 comic visual feedback (presentation-only).
// Verifies the pure core in node (pool, priorities, cooldowns, keyframes,
// deterministic words, no emoji, reduce-motion) and that the DOM/THREE adapter
// stays import-safe (no global/DOM access at module scope) without ever
// touching physics, scoring, missions, telemetry, objects, or audio.
// Run: node tests/run_comic.js
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { test, report } from '../physics/support.js';
import {
  ComicCore,
  COMIC_EVENTS,
  OBJECT_FLAVOR,
  MAX_SLOTS,
  REDUCED_FACTOR,
  isComicEvent,
  eventPriority,
  shakeOf,
  accentOf,
  colorOf,
  keyframe,
  PHASE_IN,
  PHASE_OUT,
} from '../../js/game/comic/comic.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..', '..');
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

const hasEmoji = (s) => {
  for (const ch of s) {
    const code = ch.codePointAt(0);
    if (code > 0x2100) return true; // blocks well beyond ASCII incl. all emoji
  }
  return false;
};

test('event catalog: every event has valid priority/duration/cooldown/words', () => {
  for (const [name, cfg] of Object.entries(COMIC_EVENTS)) {
    assert.ok(Number.isInteger(cfg.priority) && cfg.priority >= 1 && cfg.priority <= 100, name);
    assert.ok(Number.isInteger(cfg.duration) && cfg.duration >= 240 && cfg.duration <= 1000, name);
    assert.ok(Number.isFinite(cfg.cooldown) && cfg.cooldown >= 0, name);
    assert.ok(Array.isArray(cfg.words) && cfg.words.length > 0, name);
    for (const w of cfg.words) {
      assert.ok(/^[A-Z0-9 !?.,'-]+$/.test(w), `${name} word '${w}' must be ASCII uppercase`);
      assert.ok(!hasEmoji(w), `${name} word '${w}' must be emoji-free`);
    }
  }
});

test('every event is recognized; unknown names are not', () => {
  for (const name of Object.keys(COMIC_EVENTS)) assert.ok(isComicEvent(name), name);
  assert.ok(!isComicEvent('bogus'));
  assert.ok(!isComicEvent(''));
  assert.ok(!isComicEvent(null));
  assert.ok(!isComicEvent('mission'));
  assert.equal(eventPriority('bogus'), -1);
  assert.equal(eventPriority('launch'), 40);
});

test('object flavors are ASCII uppercase, emoji-free, and only reference real events', () => {
  for (const obj of Object.keys(OBJECT_FLAVOR)) {
    for (const [ev, words] of Object.entries(OBJECT_FLAVOR[obj])) {
      assert.ok(isComicEvent(ev), `${obj} flavor references unknown event '${ev}'`);
      for (const w of words) {
        assert.ok(/^[A-Z0-9 !?.,'-]+$/.test(w), `${obj}/${ev} word '${w}'`);
        assert.ok(!hasEmoji(w), `${obj}/${ev} word '${w}' emoji-free`);
      }
    }
  }
});

test('show on unknown event returns false and creates no slot', () => {
  const core = new ComicCore();
  assert.equal(core.show('bogus', {}), false);
  assert.equal(core.show('swoosh', {}), false);
  assert.equal(core.activeCount(), 0);
});

test('lifecycle: a slot naturally expires after its duration', () => {
  const core = new ComicCore();
  assert.ok(core.show('launch', { object: 'rock' }));
  assert.equal(core.activeCount(), 1);
  core.tick(519);
  assert.equal(core.activeCount(), 1);
  core.tick(2);
  assert.equal(core.activeCount(), 0);
});

test('slot count obeys the pool bound under a burst of events', () => {
  const core = new ComicCore();
  for (let i = 0; i < 30; i++) core.show('launch', { object: 'rock' });
  assert.ok(core.activeCount() <= MAX_SLOTS);
});

test('word rotation is deterministic and repeats identically on a fresh core', () => {
  const seq = [];
  const core = new ComicCore();
  for (let i = 0; i < 8; i++) {
    core.show('tear', { object: 'rock' });
    seq.push(core.view()[0].word);
  }
  const seq2 = [];
  const core2 = new ComicCore();
  for (let i = 0; i < 8; i++) {
    core2.show('tear', { object: 'rock' });
    seq2.push(core2.view()[0].word);
  }
  assert.deepEqual(seq, seq2);
});

test('per-object flavor words win over generic words', () => {
  const rockCore = new ComicCore();
  rockCore.pick = Object.create(null);
  rockCore.cooldowns = Object.create(null);
  assert.ok(rockCore.show('tear', { object: 'rock' }));
  const rock = rockCore.view()[0].word;
  const genericCore = new ComicCore();
  assert.ok(genericCore.show('tear', {}));
  const generic = genericCore.view()[0].word;
  assert.ok(OBJECT_FLAVOR.rock.tear.includes(rock), `'${rock}' from rock pool`);
  assert.ok(COMIC_EVENTS.tear.words.includes(generic), `'${generic}' from generic pool`);
  assert.notDeepEqual(OBJECT_FLAVOR.rock.tear, COMIC_EVENTS.tear.words, 'pools must differ');
});

test('unknown object id falls back to generic words', () => {
  const core = new ComicCore();
  core.pick = Object.create(null);
  assert.ok(core.show('stretch', { object: 'not-an-object' }));
  assert.ok(COMIC_EVENTS.stretch.words.includes(core.view()[0].word));
});

test('priority: mission-success replaces a live slot, bound kept', () => {
  const core = new ComicCore();
  for (let i = 0; i < MAX_SLOTS; i++) {
    core.cooldowns = Object.create(null); // iso-burst fill; ages stay 0
    assert.ok(core.show('capture', { object: 'rock' }));
  }
  assert.equal(core.activeCount(), MAX_SLOTS);
  assert.ok(core.show('mission-success', { object: 'rock' }));
  assert.equal(core.activeCount(), MAX_SLOTS);
  const prios = core.view().map((s) => s.priority).sort((a, b) => a - b);
  assert.deepEqual(prios, [80, 80, 80, 80, 100]);
});

test('priority: accepted replacement is always at least as important', () => {
  const core = new ComicCore();
  for (let i = 0; i < MAX_SLOTS; i++) {
    core.cooldowns = Object.create(null);
    assert.ok(core.show('capture', { object: 'rock' }));
  }
  assert.equal(core.show('mission-success', {}), true);  // 100 over an 80
  assert.equal(core.show('escape', {}), true);           // 80 ties a live 80 → ok
  assert.equal(core.show('stretch', {}), false);         // 50 < every live 80/100
  assert.equal(core.activeCount(), MAX_SLOTS);
});

test('cooldown blocks repeat emission within the window, then re-arms', () => {
  const core = new ComicCore();
  assert.ok(core.show('tear', { object: 'rock' }));
  assert.equal(core.show('tear', { object: 'rock' }), false);
  const cfg = COMIC_EVENTS.tear;
  core.tick(cfg.duration + cfg.cooldown + 1);
  assert.ok(core.show('tear', { object: 'rock' }));
});

test('reduced motion shortens durations by REDUCED_FACTOR and removes overshoot', () => {
  const core = new ComicCore({ reducedMotion: true });
  assert.ok(core.show('launch', {}));
  assert.equal(core.view()[0].duration, Math.round(COMIC_EVENTS.launch.duration * REDUCED_FACTOR));
  core.tick(core.view()[0].duration + 1);
  assert.equal(core.activeCount(), 0);

  core.clear();
  assert.equal(keyframe(0.4, { reducedMotion: true }).scale, 1);
  assert.ok(keyframe(0.15, { reducedMotion: true }).scale <= 1.001);
});

test('normal keyframe overshoots; reduced-motion keyframe never exceeds 1.0', () => {
  let peak = 0;
  let rmPeak = 0;
  for (let i = 0; i <= 200; i++) {
    const p = i / 200;
    peak = Math.max(peak, keyframe(p, {}).scale);
    rmPeak = Math.max(rmPeak, keyframe(p, { reducedMotion: true }).scale);
  }
  assert.ok(peak > 1.1, `normal peak ${peak.toFixed(3)} must overshoot`);
  assert.ok(rmPeak <= 1.001, `reduced peak ${rmPeak.toFixed(3)} must not overshoot`);
});

test('drift (comic knock-back) applies only during the OUT phase', () => {
  assert.equal(keyframe(0.1, {}).drift, 0);
  assert.equal(keyframe(0.35, {}).drift, 0);
  assert.ok(keyframe(0.95, {}).drift > 0);
  for (let i = 0; i <= 100; i++) {
    assert.equal(keyframe(i / 100, { reducedMotion: true }).drift, 0);
  }
});

test('opacity is monotone non-increasing through the OUT phase', () => {
  const a = keyframe(PHASE_OUT + 0.01, {}).opacity;
  const b = keyframe(PHASE_OUT + 0.5 * (1 - PHASE_OUT), {}).opacity;
  const c = keyframe(0.995, {}).opacity;
  assert.ok(a >= b && b >= c, `${a.toFixed(3)} ≥ ${b.toFixed(3)} ≥ ${c.toFixed(3)}`);
});

test('keyframe phases honor the IN/HOLD/OUT model boundaries', () => {
  assert.equal(keyframe(0, {}).opacity, 0);        // IN start: invisible
  assert.equal(keyframe(PHASE_IN, {}).opacity, 1); // IN end → fully visible
  assert.ok(keyframe((PHASE_IN + PHASE_OUT) / 2, {}).opacity >= 1 - 1e-9); // hold
  assert.equal(keyframe(1, {}).opacity, 0);        // OUT end: gone
});

test('shake/priority/accent metadata is present on every event', () => {
  for (const [name, cfg] of Object.entries(COMIC_EVENTS)) {
    assert.ok(typeof shakeOf(name) === 'number' && shakeOf(name) >= 0 && shakeOf(name) <= 1, name);
    assert.equal(accentOf(name), cfg.accent, name);
    assert.equal(eventPriority(name), cfg.priority, name);
  }
  assert.equal(shakeOf('capture'), 1);
  assert.equal(accentOf('capture'), true);
  assert.equal(shakeOf('bogus'), 0);
});

test('Phase 30: every event carries an allowed palette colour', () => {
  const allowed = new Set(['yellow', 'orange', 'blue', 'magenta', 'green']);
  for (const [name, cfg] of Object.entries(COMIC_EVENTS)) {
    assert.ok(allowed.has(cfg.color), `${name} color '${cfg.color}' not in palette`);
    assert.equal(colorOf(name), cfg.color, name);
    assert.equal(colorOf('bogus'), null);
  }
  assert.equal(colorOf('capture'), 'orange');
  assert.equal(colorOf('mission-success'), 'green');
});

test('slots carry the event colour onto the DOM adapter contract', () => {
  const core = new ComicCore();
  core.show('escape');
  const slot = core.view()[0];
  assert.equal(slot.color, 'blue');
  assert.equal(slot.accent, false);
});

test('show options are read-only: the caller object is never mutated', () => {
  const options = Object.freeze({
    object: 'planet',
    world: Object.freeze({ x: 1, y: 2, z: 3 }),
  });
  const core = new ComicCore();
  core.show('capture', options);
  assert.deepEqual(options.world, { x: 1, y: 2, z: 3 });
  assert.equal(options.object, 'planet');
});

test('show never looks at score/telemetry/mission-shaped plain objects', () => {
  const core = new ComicCore();
  const frozen = Object.freeze({
    telemetry: Object.freeze({ total: 11400 }),
    score: Object.freeze({ maxTotal: 11400 }),
    mission: Object.freeze({ id: 'orbit-01' }),
  });
  core.show('mission-success', frozen); // must not read or throw
  assert.equal(core.activeCount(), 1);
});

test('comic modules import only the comic barrel (no engine/audio/physics deps)', () => {
  const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '../../');
  for (const rel of ['js/game/comic/renderer.js', 'js/game/comic/comic.js']) {
    const src = fs.readFileSync(path.join(root, rel), 'utf8');
    // Allowed imports:
    // - './comic.js'
    // - './burstShapes.js'
    // Disallowed: physics/game-engine/audio/renderer
    const lines = src.split('\n');
    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed.startsWith('import ')) {
        const allowed = trimmed.includes('./comic.js') || trimmed.includes('./burstShapes.js');
        assert.ok(allowed, `${rel} must only import its own barrel or burstShapes, got ${trimmed}`);
      }
    }
  }
});

test('no emoji anywhere in comic source (identity rule)', async () => {
  for (const f of ['comic.js', 'renderer.js', 'index.js']) {
    const src = fs.readFileSync(path.join(comicDir, f), 'utf8');
    assert.ok(!hasEmoji(src), `${f} contains a stray non-ASCII/emoji char`);
  }
});

test('DOM/THREE adapter evaluates importably in node (no module-scope globals)', async () => {
  const mod = await import('../../js/game/comic/renderer.js');
  assert.ok(typeof mod.ComicRenderer === 'function');
  const barrel = await import('../../js/game/comic/index.js');
  assert.ok(typeof barrel.ComicCore === 'function');
  assert.ok(typeof barrel.ComicRenderer === 'function');
});

test('anchor kinds resolve: world/screen/mission/bh, with mission on a flag', () => {
  const core = new ComicCore();
  core.cooldowns = Object.create(null);
  assert.ok(core.show('capture', { world: { x: 1, y: 2, z: 3 } }));
  assert.deepEqual(core.view()[0].anchor, { kind: 'world', x: 1, y: 2, z: 3 });
  core.cooldowns = Object.create(null);
  assert.ok(core.show('escape', { screen: { x: 7, y: 9 } }));
  assert.deepEqual(core.view()[1].anchor, { kind: 'screen', x: 7, y: 9 });
  core.cooldowns = Object.create(null);
  assert.ok(core.show('mission-success', { mission: true }));
  assert.equal(core.view()[2].anchor.kind, 'mission');
  core.cooldowns = Object.create(null);
  assert.ok(core.show('launch', {}));
  assert.equal(core.view()[3].anchor.kind, 'bh');
});

test('gameplay untouched: comic layer never dereferences the live game', () => {
  // The core accepts only its own options; wiring in loop/main passes ONLY
  // presentation data (kind + plain world positions). No game reference is
  // stored anywhere in the core's catalog or options handling.
  assert.ok(!('game' in COMIC_EVENTS));
  assert.ok(!('score' in COMIC_EVENTS));
  assert.ok(!('telemetry' in COMIC_EVENTS));
  const core = new ComicCore();
  core.show('launch', { object: 'rock', world: { x: 0, y: 0, z: 0 } });
  assert.ok(!core.view()[0].game);
});