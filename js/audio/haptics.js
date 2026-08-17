// audio/haptics.js — semantic haptic feedback via navigator.vibrate.
//
// All haptics go through this module. It:
//   - guards every call (missing API, iOS Safari, reduced-motion → no-op)
//   - keeps patterns short — never long continuous vibration
//   - never throws; vibration is an enhancement, the game must run without it.
//
// Like the rest of the audio layer this is DOM-light and testable from node:
// the caller injects `vibrate` (navigator.vibrate) so the test can stub it.

const REDUCED_MOTION = (() => {
  try {
    if (typeof window !== 'undefined' && window.matchMedia) {
      return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    }
  } catch (err) { /* ignore */ }
  return false;
})();

// Semantic gesture → short vibration pattern (ms). No long hums; everything
// is a small pulse or a brief pattern, and reduced-motion halves the counts.
const GESTURES = Object.freeze({
  tap: 12,
  launch: 24,
  horizon: 35,
  tear: 16,
  capture: [55, 30, 45],
  escape: [18, 40, 18],
  success: [14, 30, 14],
  failure: 30,
});

function scale(pattern, reduced) {
  if (!reduced) return pattern;
  if (Array.isArray(pattern)) return pattern.map((v) => Math.max(6, Math.round(v / 2)));
  return Math.max(6, Math.round(pattern / 2));
}

export class Haptics {
  constructor({ vibrate, reducedMotion = REDUCED_MOTION } = {}) {
    this._vibrate = vibrate;
    this._reducedMotion = reducedMotion;
    this._enabled = true;
  }

  // True if a real vibrate function is available (stubbed in tests).
  get available() {
    return typeof this._vibrate === 'function';
  }

  // Phase 20 — explicit Haptics ON/OFF (the Settings screen owns this; the
  // game layer never touches it directly).
  setEnabled(v) {
    this._enabled = !!v;
    return this._enabled;
  }

  get enabled() {
    return this._enabled;
  }

  // Phase 20 — let the app push the settings-resolved reduced-motion decision
  // (system pref OR explicit toggle) into the haptic scaler.
  setReducedMotion(v) {
    this._reducedMotion = !!v;
    return this._reducedMotion;
  }

  tap() { this._pulse('tap'); }
  launch() { this._pulse('launch'); }
  horizon() { this._pulse('horizon'); }
  tear() { this._pulse('tear'); }
  capture() { this._pulse('capture'); }
  escape() { this._pulse('escape'); }
  success() { this._pulse('success'); }
  failure() { this._pulse('failure'); }

  _pulse(name) {
    if (!this.available || !this._enabled) return;
    try {
      const pattern = GESTURES[name];
      if (pattern === undefined) return;
      this._vibrate(scale(pattern, this._reducedMotion));
    } catch (err) { /* never crash on haptics */ }
  }
}
