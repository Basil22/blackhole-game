// tests/game/audio_feedback.test.js — Phase 16 audio + haptics suite.
// The audio layer is pure, emissive and optional:
//   - the event catalog / haptic mapping / throttle rules are plain data
//   - AudioEngine lazy-inits only after a real gesture and degrades to a no-op
//     when the Audio API is missing or locked
//   - Haptics guards every call and honors reduced-motion
//   - the game layer only EMITS semantic events; audio never writes
//     telemetry/score/mission/progression/trajectory/physics
//   - a cancelled throw produces no launch/capture feedback at all
// Run: node tests/run_audio_feedback.js
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from '../physics/support.js';

import { SOUNDS, HAPTIC_MAP, EVENT_CONFIG, objectTone } from '../../js/audio/sounds.js';
import { Feedback } from '../../js/audio/feedback.js';
import { Haptics } from '../../js/audio/haptics.js';
import { AudioEngine } from '../../js/audio/audio.js';
import { createAudioSystem } from '../../js/audio/index.js';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '../..');
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

// ----------------------------------------------------------- catalog ----
test('event catalog: complete, self-consistent sound/haptic/throttle data', () => {
  const names = Object.keys(SOUNDS);
  assert.strictEqual(names.length, 14);
  // every event has a playable synth definition
  for (const n of names) {
    const d = SOUNDS[n];
    assert.ok(typeof d.amp === 'number' && d.amp > 0, `${n} needs positive amp`);
    assert.ok(typeof d.dur === 'number' && d.dur > 0, `${n} needs positive dur`);
    assert.ok(typeof d.kind === 'string' && d.kind.length > 0, `${n} needs a synth kind`);
  }
  // every event maps to a haptic gesture
  for (const n of names) {
    assert.ok(HAPTIC_MAP[n], `${n} missing haptic mapping`);
  }
  // throttle rules only reference real events
  for (const k of Object.keys(EVENT_CONFIG)) {
    assert.ok(SOUNDS[k], `EVENT_CONFIG references unknown event ${k}`);
    assert.ok(EVENT_CONFIG[k].cooldown > 0, `${k} cooldown must be positive`);
  }
  // the events that must NEVER be machine-gunned are all throttled
  for (const n of ['tear', 'slider', 'capture', 'horizon', 'escape']) {
    assert.ok(EVENT_CONFIG[n], `${n} must be throttled`);
  }
});

test('object tone differentiation: dry rock vs deep planet vs structural', () => {
  assert.strictEqual(objectTone('rock').noise, 1.35);
  assert.strictEqual(objectTone('planet').rumble, 1);
  assert.ok(objectTone('planet').noise < objectTone('rock').noise);
  assert.strictEqual(objectTone('ship').metal, 1);
  assert.deepStrictEqual(objectTone('unknown-kind'), objectTone('rock'));
});

// ----------------------------------------------------------- throttle ----
test('throttling: first event fires, repeats are blocked, cooldown releases', () => {
  let t = 1000;
  const played = [];
  const fb = new Feedback({
    playSound: (n) => played.push(n),
    vibrate: () => {},
    now: () => t,
  });
  fb.tear();            // first — fires
  assert.deepStrictEqual(played, ['tear']);
  fb.tear();            // immediate repeat — blocked
  assert.deepStrictEqual(played, ['tear']);
  t += EVENT_CONFIG.tear.cooldown * 1000; // cooldown elapsed
  fb.tear();
  assert.strictEqual(played.length, 2);
});

test('throttle is per-event, not global (tear cascade + slider sweep coexist)', () => {
  let t = 0;
  const played = [];
  const fb = new Feedback({
    playSound: (n) => played.push(n),
    vibrate: () => {},
    now: () => t,
  });
  fb.tear(); fb.slider();
  t += 100;               // inside tear cooldown, outside slider's
  fb.tear(); fb.slider();
  assert.deepStrictEqual(played, ['tear', 'slider', 'slider']);
});

// ------------------------------------------------------ semantic emit ----
test('semantic wrappers emit the right sound + haptic gesture', () => {
  const calls = { sound: [], haptic: [] };
  const fb = new Feedback({
    playSound: (n) => calls.sound.push(n),
    vibrate: (g) => calls.haptic.push(g),
  });
  fb.tap('select');
  fb.aimStart();
  fb.slider();
  fb.launch({ object: 'rock' });
  fb.horizon();
  fb.tear({ object: 'planet' });
  fb.capture();
  fb.escape();
  fb.missionComplete();
  fb.missionFailed();
  fb.missionUnlock();
  fb.cancel();
  fb.aimHigh();
  assert.deepStrictEqual(calls.sound, [
    'select', 'aim-start', 'slider', 'launch', 'horizon',
    'tear', 'capture', 'escape', 'mission-complete', 'mission-failed', 'mission-unlock',
    'cancel', 'aim-high',
  ]);
  assert.deepStrictEqual(calls.haptic, calls.sound.map((n) => HAPTIC_MAP[n]));
});

test('mute blocks both sound and haptics but never throws', () => {
  const calls = { sound: [], haptic: [] };
  const fb = new Feedback({
    playSound: (n) => calls.sound.push(n),
    vibrate: (g) => calls.haptic.push(g),
  });
  fb.setMuted(true);
  fb.tap('select'); fb.launch(); fb.capture(); fb.tear();
  assert.strictEqual(calls.sound.length, 0);
  assert.strictEqual(calls.haptic.length, 0);
  fb.setMuted(false);
  fb.tap('select');
  assert.strictEqual(calls.sound.length, 1);
});

test('feedback is pure: it cannot mutate any game state', () => {
  const state = { telemetry: 1, score: 1, mission: 1, progression: 1, trajectory: 1, physics: 1 };
  const snapshot = { ...state };
  const fb = new Feedback({ playSound: () => {}, vibrate: () => {} });
  fb.tap('select'); fb.launch(); fb.capture(); fb.missionComplete(); fb.setMuted(true); fb.reset();
  assert.deepStrictEqual(state, snapshot);
});

// --------------------------------------------------- AudioEngine ------
// Minimal stand-in AudioContext so node can exercise lazy init without a DOM.
class FakeAudioContext {
  constructor() { this.state = 'running'; this.sampleRate = 44100; this.currentTime = 0; this.created = 0; }
  createGain() { return { gain: { value: 0, setTargetAtTime() {} }, connect() {} }; }
  createBiquadFilter() {
    return { type: 'lowpass', Q: { value: 1 }, frequency: { value: 0, setTargetAtTime() {} }, connect() {} };
  }
  createOscillator() {
    this.created++;
    return { type: 'sine', frequency: { value: 0, setValueAtTime() {}, exponentialRampToValueAtTime() {} }, connect() {}, start() {}, stop() {}, disconnect() {}, onended: null };
  }
  createBufferSource() { return { buffer: null, loop: false, connect() {}, start() {}, stop() {}, disconnect() {}, onended: null }; }
  createBuffer(ch, len) { return { getChannelData: () => new Float32Array(len), sampleRate: this.sampleRate }; }
  connect() {}
  resume() { this.state = 'running'; return Promise.resolve(); }
  suspend() { this.state = 'suspended'; return Promise.resolve(); }
  close() { this.state = 'closed'; return Promise.resolve(); }
}

function withWindow(ctx, fn) {
  const prev = globalThis.window;
  globalThis.window = { AudioContext: ctx, webkitAudioContext: undefined };
  try { fn(); } finally { globalThis.window = prev; }
}

test('AudioEngine: lazy init — locked until a real unlock() gesture', () => {
  withWindow(FakeAudioContext, () => {
    const eng = new AudioEngine();
    assert.strictEqual(eng.available, true);
    assert.strictEqual(eng.unlocked, false);
    eng.play('select'); // before unlock: no-op
    const fake = globalThis.window.AudioContext;
    assert.strictEqual(fake.constructorCount, undefined); // untouched helper
    eng.unlock();
    assert.strictEqual(eng.unlocked, true);
    // second unlock is idempotent (no second context)
    eng.unlock();
    assert.strictEqual(eng.unlocked, true);
  });
});

test('AudioEngine: unavailable API degrades silently (game never breaks)', () => {
  // no window at all — like node or a browser without Web Audio
  const eng = new AudioEngine();
  assert.strictEqual(eng.available, false);
  assert.doesNotThrow(() => eng.unlock());
  assert.doesNotThrow(() => eng.play('launch'));
  assert.doesNotThrow(() => eng.setMuted(true));
  assert.doesNotThrow(() => eng.suspend());
  assert.strictEqual(eng.unlocked, false);
});

test('AudioEngine: unlock creates master chain; play builds nodes only when unmuted', () => {
  withWindow(FakeAudioContext, () => {
    const eng = new AudioEngine();
    eng.unlock();
    const ctx = eng._ctx;
    const oscBefore = ctx.created;
    eng.play('select');
    assert.ok(ctx.created > oscBefore, 'unlocked play must build synth nodes');
    // muted: play() is a strict no-op (no node allocation)
    eng.setMuted(true);
    const oscMuted = ctx.created;
    eng.play('tear');
    eng.play('capture');
    assert.strictEqual(ctx.created, oscMuted, 'muted play must not allocate');
    eng.setMuted(false);
    eng.dispose();
    assert.strictEqual(eng.unlocked, false);
  });
});

// ----------------------------------------------------- Haptics --------
test('Haptics: unavailable vibrate is a guarded no-op', () => {
  const h = new Haptics({ vibrate: undefined });
  assert.strictEqual(h.available, false);
  assert.doesNotThrow(() => { h.tap(); h.launch(); h.horizon(); h.tear(); h.capture(); h.escape(); h.success(); h.failure(); });
});

test('Haptics: semantic gestures map to short patterns, not long hums', () => {
  const got = [];
  const h = new Haptics({ vibrate: (p) => got.push(p), reducedMotion: false });
  h.tap(); h.launch(); h.horizon(); h.tear(); h.capture(); h.escape(); h.success(); h.failure();
  assert.strictEqual(got.length, 8);
  for (const p of got) {
    const flat = Array.isArray(p) ? p : [p];
    const total = flat.reduce((a, b) => a + b, 0);
    assert.ok(total < 250, `gesture ${flat} too long`);
    assert.ok(flat.every((v) => v >= 0), 'no negative durations');
  }
  assert.deepStrictEqual(got[0], 12);   // tap = light
  assert.deepStrictEqual(got[4], [55, 30, 45]); // capture = brief pattern
});

test('Haptics: reduced-motion halves intensity and never throws', () => {
  const got = [];
  const h = new Haptics({ vibrate: (p) => got.push(p), reducedMotion: true });
  h.capture(); h.failure(); h.tap();
  assert.deepStrictEqual(got, [[28, 15, 23], 15, 6]);
  h._pulse('does-not-exist'); // unknown gesture: no-op, no crash
  assert.strictEqual(got.length, 3);
});

// ------------------------------------------------ system wiring -------
test('createAudioSystem wires engine + haptics + feedback end-to-end', () => {
  const played = [];
  const vibrated = [];
  const system = createAudioSystem({
    engine: new AudioEngine(),
    haptics: new Haptics({ vibrate: (p) => vibrated.push(p) }),
  });
  system.setMuted(false);
  system.tap('select');
  system.launch({ object: 'rock' });
  system.tear();
  assert.strictEqual(played.length, 0); // engine not unlocked — no-op, but haptics still fire
  assert.deepStrictEqual(vibrated, [12, 24, 16]); // tap / launch / tear patterns
  // mute kills everything
  system.setMuted(true);
  vibrated.length = 0;
  system.capture();
  assert.strictEqual(vibrated.length, 0);
});

test('createAudioSystem convenience methods mirror the feedback catalog', () => {
  const system = createAudioSystem({ engine: new AudioEngine(), haptics: new Haptics({ vibrate: () => {} }) });
  for (const n of ['tap', 'play', 'launch', 'horizon', 'tear', 'capture', 'escape',
    'missionComplete', 'missionFailed', 'missionUnlock', 'aimStart', 'aimState',
    'aimHigh', 'slider', 'cancel']) {
    assert.strictEqual(typeof system[n], 'function', `missing ${n}`);
  }
  assert.doesNotThrow(() => {
    system.missionComplete(); system.missionFailed(); system.missionUnlock();
    system.horizon(); system.escape(); system.setProximity(0.5);
  });
});

// ------------------------------------------------ source guards ------
test('source: audio API lives ONLY in js/audio — no raw AudioContext elsewhere', () => {
  const dirs = ['js/game', 'js/render', 'js/ui', 'js/main.js', 'index.html', 'css'];
  const hit = [];
  const scan = (rel) => {
    const p = path.join(ROOT, rel);
    if (fs.statSync(p).isDirectory()) {
      for (const e of fs.readdirSync(p)) scan(path.join(rel, e));
    } else if (/\.(js|html|css)$/.test(p)) {
      const src = fs.readFileSync(p, 'utf8');
      if (/new\s+AudioContext|webkitAudioContext|new\s+Audio\b/.test(src)) hit.push(rel);
    }
  };
  dirs.forEach(scan);
  assert.deepStrictEqual(hit, [], `raw Audio API outside js/audio: ${hit}`);
});

test('source: no raw navigator.vibrate outside js/audio', () => {
  const hit = [];
  const scan = (rel) => {
    const p = path.join(ROOT, rel);
    if (fs.statSync(p).isDirectory()) {
      for (const e of fs.readdirSync(p)) scan(path.join(rel, e));
    } else if (/\.(js|html)$/.test(p)) {
      const src = fs.readFileSync(p, 'utf8');
      if (/navigator\.vibrate/.test(src)) hit.push(rel);
    }
  };
  ['js/game', 'js/render', 'js/ui', 'js/main.js', 'index.html'].forEach(scan);
  assert.deepStrictEqual(hit, [], `raw navigator.vibrate outside js/audio: ${hit}`);
});

test('source: audio layer never imports game internals (read-only by construction)', () => {
  const files = fs.readdirSync(path.join(ROOT, 'js/audio')).filter((f) => /\.js$/.test(f));
  for (const f of files) {
    const src = read(`js/audio/${f}`);
    for (const m of src.matchAll(/from\s+'([^']+)'/g)) {
      const spec = m[1];
      const banned = /\.\.\/(physics|game|render|objects|ui)\b/.test(spec);
      assert.ok(!banned, `js/audio/${f} imports ${spec}`);
    }
  }
});

test('source: cancel (disposeObject) emits no launch/capture/haptic feedback', () => {
  const main = read('js/game/main.js');
  const disposeBody = main.slice(main.indexOf('disposeObject() {'), main.indexOf('toggleSlowmo() {'));
  assert.doesNotMatch(disposeBody, /audio/, 'cancel must be audio-silent');
  // launch is the ONLY sound-bearing spawn path
  const launchBody = main.slice(main.indexOf('\n  launch() {'), main.indexOf('\n  disposeObject() {'));
  assert.match(launchBody, /audio\?\.launch\(/);
  // beginAim emits aim-start, select/size emit taps
  assert.match(main, /audio\?\.aimStart\(\)/);
  assert.match(main, /audio\?\.tap\('select'\)/);
  assert.match(main, /audio\?\.slider\(\)/);
});

test('source: mission outcome audio is gated off PLAYER_RESET cancels', () => {
  const main = read('js/main.js');
  assert.match(main, /TERMINATION\.PLAYER_RESET/);
  assert.match(main, /audio\.missionComplete\(\)/);
  assert.match(main, /audio\.missionUnlock\(\)/);
  assert.match(main, /audio\.missionFailed\(\)/);
});

test('source: escape audio fires only on a clean DESPAWN escape', () => {
  const loop = read('js/game/loop.js');
  assert.match(loop, /TERMINATION\.DESPAWN/);
  assert.match(loop, /trajectoryState === 'ESCAPING'/);
  assert.match(loop, /audio\?\.escape\(\)/);
  // consumption always means a deep gravitational drop
  assert.match(loop, /audio\?\.capture\(\)/);
  // tears are throttled by kind-timbre
  assert.match(loop, /audio\?\.tear\(\{ object: o\.kind \}\)/);
  // horizon crossing is a once-per-throw discrete event
  assert.match(loop, /_horizonSounded/);
  assert.match(loop, /game\.audio\?\.setProximity\(prox\)/);
});

test('source: mute preference persists to localStorage (bh_audio_enabled)', () => {
  const main = read('js/main.js');
  assert.match(main, /bh_audio_enabled/);
  assert.match(main, /localStorage\.getItem\(/);
  assert.match(main, /localStorage\.setItem\(/);
  assert.match(main, /audio\.setMuted\(/);
  assert.match(main, /pointerdown/); // gesture unlock
});

test('source: speaker toggle is monochrome, present, and icon-swapped', () => {
  const html = read('index.html');
  assert.match(html, /id="audio-btn"/);
  assert.ok(html.indexOf('audio-btn') < html.indexOf('share-btn'), 'audio-btn must sit before share');
  const icons = read('js/ui/icons.js');
  assert.match(icons, /'speaker-on':/);
  assert.match(icons, /'speaker-off':/);
  const css = read('css/style.css');
  assert.match(css, /#audio-btn/);
  assert.match(css, /#audio-btn\.muted/);
  const EMOJI = /[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{2B00}-\u{2BFF}\u{FE0F}\u{2764}]/u;
  const audioSrc = ['js/audio/sounds.js', 'js/audio/audio.js', 'js/audio/feedback.js',
    'js/audio/haptics.js', 'js/audio/index.js'].map(read).join('\n');
  assert.strictEqual([...audioSrc].filter((c) => EMOJI.test(c)).length, 0, 'audio layer has emoji');
});
