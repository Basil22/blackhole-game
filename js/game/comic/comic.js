// game/comic/comic.js — pure, DOM-free, THREE-free core for the comic-effect
// layer (Phase 29). Manages a small pooled set of short-lived "comic word"
// slots with priority-based admission, per-event cooldowns, deterministic
// word rotation, and explicit IN/HOLD/OUT motion keyframes. Never imports
// physics, scoring, missions, telemetry, objects, audio, or render code —
// it is a presentation-only layer that simply observes game events.

export const MAX_SLOTS = 5;

// Phase 30 — each event now carries a palette colour (the Phase-29 white/
// single-amber constraint is overridden). Colour is emotion on top of the
// word — the words are still uppercase ASCII, never emoji.
export const COMIC_EVENTS = Object.freeze({
  launch: Object.freeze({
    priority: 40,
    duration: 520,
    cooldown: 400,
    words: Object.freeze(['WHOOSH!']),
    drift: Object.freeze({ x: 0, y: -60 }),
    shake: 0.2,
    accent: false,
    color: 'yellow', // canary burst
  }),
  tear: Object.freeze({
    priority: 60,
    duration: 560,
    cooldown: 420,
    words: Object.freeze(['CRACK!', 'SNAP!', 'RIP!']),
    drift: Object.freeze({ x: 0, y: -30 }),
    shake: 0.6,
    accent: false,
    color: 'orange', // material snap = explosion energy
  }),
  impact: Object.freeze({
    priority: 60,
    duration: 520,
    cooldown: 420,
    words: Object.freeze(['BAM!', 'WHAM!']),
    drift: Object.freeze({ x: 0, y: 0 }),
    shake: 0.5,
    accent: false,
    color: 'orange',
  }),
  stretch: Object.freeze({
    priority: 50,
    duration: 760,
    cooldown: 0,
    words: Object.freeze(['STREEETCH!']),
    drift: Object.freeze({ x: 0, y: -40 }),
    shake: 0.3,
    accent: false,
    color: 'magenta', // cartoon absurdity
  }),
  capture: Object.freeze({
    priority: 80,
    duration: 640,
    cooldown: 0,
    words: Object.freeze(['BOOM!', 'CRUNCH!', 'GONE!']),
    drift: Object.freeze({ x: 0, y: 0 }),
    shake: 1.0,
    accent: true,
    color: 'orange', // engulfing explosion
  }),
  escape: Object.freeze({
    priority: 80,
    duration: 620,
    cooldown: 0,
    words: Object.freeze(['WHOOSH!', 'NOPE!', 'BYE!']),
    drift: Object.freeze({ x: 0, y: -90 }),
    shake: 0.4,
    accent: false,
    color: 'blue', // cold-chrome freedom
  }),
  'mission-success': Object.freeze({
    priority: 100,
    duration: 800,
    cooldown: 0,
    words: Object.freeze(['NICE!', 'CLEAN!', 'NAILED IT!']),
    drift: Object.freeze({ x: 0, y: 0 }),
    shake: 0.4,
    accent: false,
    color: 'green', // success / unlock
  }),
  'mission-failed': Object.freeze({
    priority: 100,
    duration: 720,
    cooldown: 0,
    words: Object.freeze(['OOF!', 'TOO CLOSE!', 'MISSED!']),
    drift: Object.freeze({ x: 0, y: 0 }),
    shake: 0.3,
    accent: false,
    color: 'magenta', // playfully comedic, never mean
  }),
});

export const OBJECT_FLAVOR = Object.freeze({
  rock: Object.freeze({
    tear: Object.freeze(['BONK!', 'CRACK!', 'BAM!']),
    capture: Object.freeze(['BOOM!', 'CRUNCH!', 'GONE!']),
    escape: Object.freeze(['BYE!', 'NOPE!', 'WHOOSH!']),
  }),
  human: Object.freeze({
    tear: Object.freeze(['OUCH!', 'NOO!', 'YIKES!']),
    capture: Object.freeze(['AAAA!', 'GONE!', 'NOOO!']),
    escape: Object.freeze(['SAFE!', 'NOPE!', 'BYE!']),
    stretch: Object.freeze(['EEEK!']),
  }),
  ship: Object.freeze({
    tear: Object.freeze(['WARNING!', 'CRACK!', 'YIKES!']),
    capture: Object.freeze(['BOOM!', 'GONE!', 'BLAST!']),
    escape: Object.freeze(['CLEAR!', 'BYE!', 'WHOOSH!']),
  }),
  planet: Object.freeze({
    tear: Object.freeze(['CRACK!', 'BOOM!', 'RUMBLE!']),
    capture: Object.freeze(['CRUNCH!', 'DEVOURED!', 'GONE!']),
    escape: Object.freeze(['ESCAPED!', 'BYE!', 'FREEDOM!']),
  }),
});

export const REDUCED_FACTOR = 0.45;

export const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);

export const isComicEvent = (name) => Object.prototype.hasOwnProperty.call(COMIC_EVENTS, name);

export const eventPriority = (name) => (isComicEvent(name) ? COMIC_EVENTS[name].priority : -1);

export const shakeOf = (name) => (isComicEvent(name) ? COMIC_EVENTS[name].shake : 0);

export const accentOf = (name) => (isComicEvent(name) ? COMIC_EVENTS[name].accent : false);

export const colorOf = (name) => (isComicEvent(name) ? COMIC_EVENTS[name].color : null);

// ---- easing (deterministic; no randomness in the core) ----
const easeOut = (q) => 1 - Math.pow(1 - q, 3);
const easeIn = (q) => q * q * q;
const easeOutBack = (q) => {
  const c1 = 1.70158;
  const c3 = c1 + 1;
  const m = q - 1;
  return 1 + c3 * m * m * m + c1 * m * m;
};

// IN/HOLD/OUT model. Reduced-motion shortens the total and removes the
// overshoot + drift so only the text remains, without any bounce.
export const PHASE_IN = 0.14;
export const PHASE_IN_RM = 0.22;
export const PHASE_OUT = 0.72;
export const PHASE_OUT_RM = 0.86;

export function keyframe(p, opts) {
  const rm = !!(opts && opts.reducedMotion);
  const tIn = rm ? PHASE_IN_RM : PHASE_IN;
  const tOut = rm ? PHASE_OUT_RM : PHASE_OUT;
  let scale = 1;
  let opacity = 1;
  let drift = 0;
  if (p < tIn) {
    const q = clamp01(p / tIn);
    scale = rm ? 0.94 + 0.06 * easeOut(q) : 0.35 + 0.87 * easeOutBack(q);
    opacity = rm ? 0.5 + 0.5 * easeOut(q) : easeOut(q);
  } else if (p < tOut) {
    const q = clamp01((p - tIn) / (tOut - tIn));
    scale = rm ? 1 : 1.22 - 0.16 * easeOut(q);
    opacity = 1;
  } else {
    const q = clamp01((p - tOut) / (1 - tOut));
    scale = rm ? 1 - 0.05 * easeIn(q) : 1.06 - 0.24 * easeIn(q);
    opacity = 1 - q;
    drift = rm ? 0 : easeIn(q);
  }
  return { scale, opacity, drift, tIn, tOut };
}

export class ComicCore {
  constructor(opts) {
    const o = opts || {};
    this.reducedMotion = !!o.reducedMotion;
    this.now = 0;
    this.slots = [];
    this.cooldowns = Object.create(null);
    this.pick = Object.create(null); // per-event rotation counters
  }

  setReducedMotion(v) {
    this.reducedMotion = !!v;
  }

  wordPool(event, object) {
    const flavor = OBJECT_FLAVOR[object];
    const words = flavor && flavor[event] ? flavor[event] : COMIC_EVENTS[event].words;
    return words;
  }

  pickWord(event, object) {
    const pool = this.wordPool(event, object);
    const idx = (this.pick[event] = ((this.pick[event] || -1) + 1) % pool.length);
    return pool[idx];
  }

  show(name, opts) {
    const o = opts || {};
    if (!isComicEvent(name)) return false;
    const base = COMIC_EVENTS[name];
    const object = o.object;
    const now = this.now;
    if (this.cooldowns[name] !== undefined && now < this.cooldowns[name]) return false;

    const factor = this.reducedMotion ? REDUCED_FACTOR : 1;
    const duration = Math.round(base.duration * factor);
    this.cooldowns[name] = now + duration + base.cooldown;

    const word = this.pickWord(name, object);
    const drift = base.drift;
    const anchor = o.world
      ? { kind: 'world', x: o.world.x, y: o.world.y, z: o.world.z }
      : o.screen
        ? { kind: 'screen', x: o.screen.x, y: o.screen.y }
        : o.mission
          ? { kind: 'mission' }
          : { kind: 'bh' };

    const slot = {
      event: name,
      word,
      priority: base.priority,
      age: 0,
      duration,
      rot: ((word.length * 7) % 9) - 4,
      drift,
      anchor,
      accent: base.accent,
      color: base.color,
    };

    // Admission: append while the pool has room; once full, replace the
    // lowest-priority slot only when the incoming event is at least as
    // important (a more urgent event bumps a lesser one off the screen).
    if (this.slots.length < MAX_SLOTS) {
      this.slots.push(slot);
      return true;
    }
    let minIdx = -1;
    let minPrio = Infinity;
    for (let i = 0; i < this.slots.length; i++) {
      const s = this.slots[i];
      if (s.priority < minPrio) {
        minPrio = s.priority;
        minIdx = i;
      }
    }
    if (slot.priority < minPrio) return false;
    this.slots[minIdx] = slot;
    return true;
  }

  tick(dtMs) {
    this.now += dtMs;
    const slots = this.slots;
    for (let i = slots.length - 1; i >= 0; i--) {
      const s = slots[i];
      s.age += dtMs;
      if (s.age >= s.duration) slots.splice(i, 1);
    }
  }

  clear() {
    this.slots.length = 0;
  }

  activeCount() {
    return this.slots.length;
  }

  view() {
    return this.slots;
  }
}