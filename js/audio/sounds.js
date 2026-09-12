// audio/sounds.js — the sound palette as pure data (no Web Audio, no DOM).
//
// BLACK HOLE's audio language is a "quiet scientific instrument": every sound
// is short, low-level and descriptive — it answers "what just happened?", not
// "something exciting is happening!". Nothing here is cinematic or bombastic.
//
// This module is deliberately THREE-free / AudioContext-free so the node test
// suite can import it and guard the full event catalog, the throttle rules and
// the haptic mapping without a browser.
//
// The synth KINDS referenced here are implemented in audio.js:
//   click  short dry mechanical tick     tick   tiny slider tick
//   low    short low activation tone     blip   soft two-tone blip
//   whoosh short directional whoosh      dive   deep falling tonal event
//   snap   restrained crack/snap         drop   deep gravitational drop
//   rise   restrained rising tone        notes  2–3 note confirmation
//   ticks  2 short mechanical confirmations
//
// Object tone variants (subtle, never cartoon): the `tear` builder reads the
// `object` opt ('rock' | 'human' | 'ship' | 'planet') to bias noise vs. low
// frequency — rock = dry, human = structural, ship = slightly metallic,
// planet = deeper rumble.

export const SOUNDS = Object.freeze({
  select: { amp: 0.09, dur: 0.05, kind: 'click' },
  slider: { amp: 0.04, dur: 0.022, kind: 'tick' },
  cancel: { amp: 0.05, dur: 0.05, kind: 'tick' },
  'aim-start': { amp: 0.08, dur: 0.1, kind: 'low' },
  'aim-state': { amp: 0.05, dur: 0.07, kind: 'blip' },
  'aim-high': { amp: 0.07, dur: 0.09, kind: 'low' },
  launch: { amp: 0.15, dur: 0.42, kind: 'whoosh' },
  horizon: { amp: 0.16, dur: 0.55, kind: 'dive' },
  tear: { amp: 0.13, dur: 0.18, kind: 'snap' },
  capture: { amp: 0.19, dur: 0.75, kind: 'drop' },
  escape: { amp: 0.09, dur: 0.55, kind: 'rise' },
  'mission-complete': { amp: 0.1, dur: 0.5, kind: 'notes' },
  'mission-failed': { amp: 0.08, dur: 0.32, kind: 'low' },
  'mission-unlock': { amp: 0.06, dur: 0.22, kind: 'ticks' },
  // Phase H: expanded sound palette
  'star-reveal': { amp: 0.07, dur: 0.16, kind: 'blip' },
  'new-best': { amp: 0.08, dur: 0.26, kind: 'notes' },
  'daily-complete': { amp: 0.1, dur: 0.5, kind: 'notes' },
  'orbit-insert': { amp: 0.07, dur: 0.4, kind: 'rise' },
});

// Semantic event -> haptic gesture (see haptics.js for the patterns).
export const HAPTIC_MAP = Object.freeze({
  select: 'tap',
  slider: 'tap',
  cancel: 'tap',
  'aim-start': 'tap',
  'aim-state': 'tap',
  'aim-high': 'tap',
  launch: 'launch',
  horizon: 'horizon',
  tear: 'tear',
  capture: 'capture',
  escape: 'escape',
  'mission-complete': 'success',
  'mission-failed': 'failure',
  'mission-unlock': 'success',
  'star-reveal': 'tap',
  'new-best': 'success',
  'daily-complete': 'success',
  'orbit-insert': 'tap',
});

// Per-event throttle rules (seconds). The first event fires immediately; later
// events in the same window are dropped so a spring cascade or a slider sweep
// never becomes a machine-gun. No stacking — restraint is the point.
export const EVENT_CONFIG = Object.freeze({
  tear: { cooldown: 0.16 },
  slider: { cooldown: 0.06 },
  'aim-state': { cooldown: 0.35 },
  'aim-high': { cooldown: 0.6 },
  horizon: { cooldown: 0.5 },
  capture: { cooldown: 0.5 },
  escape: { cooldown: 0.5 },
  'mission-complete': { cooldown: 0.3 },
  'mission-failed': { cooldown: 0.3 },
  'mission-unlock': { cooldown: 0.3 },
  'star-reveal': { cooldown: 0.3 },
  'new-best': { cooldown: 0.5 },
  'daily-complete': { cooldown: 0.5 },
  'orbit-insert': { cooldown: 0.5 },
});

// Subtle per-object tear timbre biases (multipliers, applied by the snap
// builder). Higher noise = drier; higher low = deeper structural rumble.
export const OBJECT_TONE = Object.freeze({
  rock: { noise: 1.35, low: 0.7 },
  human: { noise: 0.85, low: 0.9 },
  ship: { noise: 0.65, low: 0.85, metal: 1 },
  planet: { noise: 0.45, low: 1.7, rumble: 1 },
});

export function objectTone(object) {
  return OBJECT_TONE[object] || OBJECT_TONE.rock;
}
