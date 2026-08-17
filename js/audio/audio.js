// audio/audio.js — the Web Audio engine for BLACK HOLE.
//
// A deliberately minimal, quiet synth. Everything is generated procedurally
// (short oscillators + a shared white-noise buffer) — no samples, no external
// library, no per-frame work. The engine:
//   - initializes LAZILY on the first user gesture (mobile autoplay rules)
//   - is a strict no-op when the Audio API is missing or a gesture never came
//   - keeps one very quiet, loopable ambient drone whose tension gain follows
//     the object's proximity to the horizon (setProximity) — not an event loop
//   - suspends/resumes cleanly when the page is hidden
//
// If audio is unavailable or locked, every method degrades silently — the game
// never depends on audio.

import { SOUNDS, objectTone } from './sounds.js';

const AMBIENT_BASE = 0.016;       // very quiet — the void breathing
const AMBIENT_TENSION = 0.09;     // absolute ceiling at proximity 1

export class AudioEngine {
  constructor() {
    this._ctx = null;
    this._master = null;
    this._noiseBuf = null;
    this._ambient = null;
    this._unlocked = false;
    this._muted = false;
    this._volume = 1;
    this._proximity = 0;
    this._pendingResume = false;
  }

  // Audio API present in this environment?
  get available() {
    if (typeof window === 'undefined') return false;
    return !!(window.AudioContext || window.webkitAudioContext);
  }

  get unlocked() { return this._unlocked; }

  // Call from a user gesture. Creates the context on first use and resumes it
  // every later time (browsers can suspend it again between gestures).
  unlock() {
    if (!this.available) return;
    try {
      if (!this._ctx) {
        const AC = window.AudioContext || window.webkitAudioContext;
        this._ctx = new AC();
        this._master = this._ctx.createGain();
        this._master.gain.value = this._muted ? 0 : this._volume;
        this._master.connect(this._ctx.destination);
        this._noiseBuf = this._makeNoise();
        this._startAmbient();
        this._unlocked = true;
      }
      if (this._ctx.state === 'suspended') this._resume();
    } catch (err) {
      this._ctx = null; // give up quietly — audio is enhancement only
    }
  }

  _resume() {
    if (!this._ctx || this._ctx.state !== 'suspended') return;
    const p = this._ctx.resume();
    if (p && typeof p.then === 'function') p.then(null, () => {});
  }

  suspend() {
    if (this._ctx && this._ctx.state === 'running') {
      const p = this._ctx.suspend();
      if (p && typeof p.then === 'function') p.then(null, () => {});
    }
  }

  resume() {
    if (this._unlocked) this._resume();
  }

  setMuted(m) {
    this._muted = !!m;
    if (this._master && this._ctx) {
      this._master.gain.setTargetAtTime(m ? 0 : this._volume, this._ctx.currentTime, 0.02);
    }
  }

  isMuted() { return this._muted; }

  setVolume(v) {
    this._volume = Math.max(0, Math.min(1, v));
    if (this._master && this._ctx && !this._muted) {
      this._master.gain.setTargetAtTime(this._volume, this._ctx.currentTime, 0.02);
    }
  }

  // Semantic event. No-op unless unlocked + unmuted + available.
  play(name, opts = {}) {
    if (this._muted) return;
    if (!this._unlocked || !this._ctx || !this._master) return;
    const def = SOUNDS[name];
    if (!def) return;
    if (this._ctx.state === 'suspended') this._resume();
    try {
      this._build(def, opts);
    } catch (err) { /* never let audio crash the game */ }
  }

  // Ambient tension follows proximity 0→1 (nothing near → matter on the rim).
  // Smooth gain/filter target updates only when proximity meaningfully moved —
  // no per-frame allocations, no event spam.
  setProximity(k) {
    if (!this._ambient || !this._ctx) return;
    const kk = Math.max(0, Math.min(1, k));
    if (Math.abs(kk - this._proximity) < 0.004) return;
    this._proximity = kk;
    const t = this._ctx.currentTime;
    const g = AMBIENT_BASE + AMBIENT_TENSION * kk * kk;
    this._ambient.gain.gain.setTargetAtTime(g, t, 0.14);
    this._ambient.filter.frequency.setTargetAtTime(110 + 190 * kk, t, 0.14);
    this._ambient.high.gain.setTargetAtTime(0.0035 * kk * kk, t, 0.14);
  }

  get proximity() { return this._proximity; }

  dispose() {
    if (this._ctx) {
      const p = this._ctx.close();
      if (p && typeof p.then === 'function') p.then(null, () => {});
    }
    this._ctx = null;
    this._ambient = null;
    this._unlocked = false;
  }

  // ---------------------------------------------------------------- ambient
  _startAmbient() {
    const ctx = this._ctx, master = this._master;
    // Two detuned sub-sines (very low, loopable, no rhythm) through a lowpass
    // = "the void breathing". A third quieter sine through its own gain is the
    // tension overtone that fades in with proximity.
    const gain = ctx.createGain();
    gain.gain.value = 0;
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 110;
    filter.Q.value = 0.4;
    const high = ctx.createGain();
    high.gain.value = 0;
    const o1 = ctx.createOscillator(); o1.frequency.value = 47; o1.type = 'sine';
    const o2 = ctx.createOscillator(); o2.frequency.value = 58.5; o2.type = 'sine';
    const o3 = ctx.createOscillator(); o3.frequency.value = 118; o3.type = 'sine';
    o1.connect(filter); o2.connect(filter);
    filter.connect(gain);
    o3.connect(high); high.connect(gain);
    gain.connect(master);
    o1.start(); o2.start(); o3.start();
    this._ambient = { gain, filter, high };
  }

  _makeNoise() {
    const ctx = this._ctx;
    const len = Math.floor(ctx.sampleRate * 2);
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    return buf;
  }

  // ---------------------------------------------------------------- synths
  _build(def, opts) {
    const ctx = this._ctx, out = this._master;
    const amp = def.amp * (opts.intensity ?? 1);
    const t0 = ctx.currentTime + 0.002;
    switch (def.kind) {
      case 'click': this._click(t0, amp); break;
      case 'tick': this._tick(t0, amp); break;
      case 'low': this._low(t0, amp, 210, 155); break;
      case 'blip': this._blip(t0, amp); break;
      case 'whoosh': this._whoosh(t0, amp); break;
      case 'dive': this._dive(t0, amp); break;
      case 'snap': this._snap(t0, amp, opts.object); break;
      case 'drop': this._drop(t0, amp); break;
      case 'rise': this._rise(t0, amp); break;
      case 'notes': this._notes(t0, amp); break;
      case 'ticks': this._ticks(t0, amp); break;
      default: break;
    }
  }

  // tiny helper: an osc envelope routed to master; auto-stops + disconnects
  _osc(kind, t0, f0, f1, peak, dur, out = this._master) {
    const ctx = this._ctx;
    const o = ctx.createOscillator();
    o.type = kind;
    o.frequency.setValueAtTime(f0, t0);
    if (f1 !== f0) o.frequency.exponentialRampToValueAtTime(Math.max(1, f1), t0 + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak), t0 + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    o.connect(g); g.connect(out);
    o.start(t0); o.stop(t0 + dur + 0.02);
    o.onended = () => { o.disconnect(); g.disconnect(); };
  }

  _noise(t0, peak, dur, filterType, f0, f1, q = 1, out = this._master) {
    const ctx = this._ctx;
    const src = ctx.createBufferSource();
    src.buffer = this._noiseBuf;
    src.loop = true;
    const f = ctx.createBiquadFilter();
    f.type = filterType;
    f.frequency.setValueAtTime(f0, t0);
    if (f1 !== f0) f.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t0 + dur);
    f.Q.value = q;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak), t0 + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    src.connect(f); f.connect(g); g.connect(out);
    src.start(t0); src.stop(t0 + dur + 0.02);
    src.onended = () => { src.disconnect(); f.disconnect(); g.disconnect(); };
  }

  _click(t0, amp) {
    this._osc('sine', t0, 1450, 950, amp, 0.05);
    this._noise(t0, amp * 0.7, 0.014, 'bandpass', 3200, 3200, 1.2);
  }

  _tick(t0, amp) {
    this._osc('sine', t0, 1250, 1250, amp, 0.022);
  }

  _low(t0, amp, f0 = 210, f1 = 155) {
    this._osc('triangle', t0, f0, f1, amp, 0.1);
  }

  _blip(t0, amp) {
    this._osc('sine', t0, 520, 720, amp, 0.07);
  }

  _whoosh(t0, amp) {
    // short directional whoosh: noise sweeping up a bandpass + low sine drop
    this._noise(t0, amp * 0.55, 0.38, 'bandpass', 320, 1250, 1.1);
    this._osc('sine', t0, 120, 62, amp * 0.6, 0.34);
  }

  _dive(t0, amp) {
    // horizon crossing: short deep tonal event, NOT an explosion
    this._osc('sine', t0, 84, 50, amp, 0.55);
    this._osc('sine', t0 + 0.02, 41, 34, amp * 0.8, 0.5);
  }

  _snap(t0, amp, object) {
    // restrained crack/snap; the object tone biases dryness vs. depth
    const tone = objectTone(object);
    this._noise(t0, amp * 0.5 * tone.noise, 0.06, 'highpass', 1400, 1800, 0.8);
    this._osc('sine', t0, 105 * tone.low, 60 * tone.low, amp * 0.7, 0.16);
    if (tone.metal) this._osc('sine', t0 + 0.01, 420, 300, amp * 0.3, 0.08);
    if (tone.rumble) this._osc('sine', t0 + 0.005, 46, 32, amp * 0.6, 0.26);
  }

  _drop(t0, amp) {
    // capture: deep short gravitational drop
    this._osc('sine', t0, 190, 44, amp, 0.75);
    this._osc('triangle', t0 + 0.02, 95, 38, amp * 0.5, 0.7);
  }

  _rise(t0, amp) {
    // escape: restrained rising tone
    this._osc('sine', t0, 205, 540, amp, 0.55);
  }

  _notes(t0, amp) {
    // mission complete: 2–3 note confirmation, nothing triumphant
    this._osc('sine', t0, 392, 392, amp, 0.1);
    this._osc('sine', t0 + 0.13, 523.25, 523.25, amp, 0.14);
    this._osc('sine', t0 + 0.28, 659.25, 659.25, amp * 0.8, 0.16);
  }

  _ticks(t0, amp) {
    // mission unlock: 2 short mechanical confirmations
    this._osc('sine', t0, 700, 700, amp, 0.035);
    this._osc('sine', t0 + 0.09, 980, 980, amp * 0.8, 0.045);
  }
}
