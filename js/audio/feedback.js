// audio/feedback.js — the semantic layer between gameplay and audio/haptics.
//
// The game never talks to AudioEngine or navigator.vibrate directly. It calls
// `feedback.play("launch")`, `feedback.tap("select")` etc. This module:
//   - maps a semantic event to a sound + haptic gesture
//   - throttles repetitive events (tears, slider ticks, aim-state blips) so a
//     cascade can never become a machine-gun
//   - owns the muted flag (a pure data decision — persisted elsewhere)
//   - is deliberately THREE-free / DOM-free / AudioContext-free so node can
//     import it and test the mapping + throttle rules without a browser.
//
// It is strictly read-only w.r.t. game state: it emits, it never mutates
// telemetry/score/mission/progression/trajectory/physics.

import { SOUNDS, HAPTIC_MAP, EVENT_CONFIG } from './sounds.js';

export class Feedback {
  constructor({ playSound, vibrate, now = () => performance.now() } = {}) {
    this._playSound = playSound || (() => {});
    this._vibrate = vibrate || (() => {});
    this._now = now;
    this._last = new Map();
    this._muted = false;
  }

  setMuted(m) {
    this._muted = !!m;
  }

  isMuted() { return this._muted; }

  // Full list of semantic events the feedback layer understands.
  static eventNames() {
    return Object.keys(SOUNDS);
  }

  // Can `name` fire right now? (throttle check, never blocks first call)
  allowed(name) {
    const cfg = EVENT_CONFIG[name];
    if (!cfg) return true;
    // `??` not `||` — a timestamp of 0 is valid and must not read as "never".
    const last = this._last.get(name) ?? -Infinity;
    return this._now() - last >= cfg.cooldown * 1000;
  }

  // Fire a semantic event: sound + haptic, throttled, mute-aware.
  play(name, opts = {}) {
    if (this._muted) return;
    if (name in SOUNDS) this._playSound(name, opts);
    const gesture = HAPTIC_MAP[name];
    if (gesture && !opts.noHaptic) this._vibrate(gesture, opts);
  }

  // Fire WITHOUT throttling (used by wiring for the rare genuinely-unique
  // moments; most calls go through the throttled path above).
  playNow(name, opts = {}) {
    if (this._muted) return;
    if (name in SOUNDS) this._playSound(name, opts);
    const gesture = HAPTIC_MAP[name];
    if (gesture && !opts.noHaptic) this._vibrate(gesture, opts);
  }

  // The throttled path is the default: record the timestamp only after passing
  // the gate, so a cascade keeps re-checking against the last actually-played
  // event (not against every attempt).
  _record(name) {
    const now = this._now();
    this._last.set(name, now);
    return now;
  }

  // Semantic wrappers — the only names the game layer should touch.
  tap(name = 'select') {
    if (!this.allowed(name)) return;
    this._record(name);
    this.play(name);
  }

  aimStart() {
    if (!this.allowed('aim-start')) return;
    this._record('aim-start');
    this.play('aim-start');
  }

  aimState() {
    if (!this.allowed('aim-state')) return;
    this._record('aim-state');
    this.play('aim-state');
  }

  // Phase 18 — gentle "you entered the powerful tail of the envelope" cue.
  // Latched upstream (fires once per crossing), throttled here as a guard.
  aimHigh() {
    if (!this.allowed('aim-high')) return;
    this._record('aim-high');
    this.play('aim-high');
  }

  slider() {
    if (!this.allowed('slider')) return;
    this._record('slider');
    this.play('slider');
  }

  // Phase 17 — CANCEL: subtle UI-only feedback for backing out of an aim.
  // Deliberately a plain tick + light tap: it is never a launch/capture/
  // escape/horizon/mission signal.
  cancel() {
    if (!this.allowed('cancel')) return;
    this._record('cancel');
    this.play('cancel');
  }

  launch(opts = {}) {
    if (!this.allowed('launch')) return;
    this._record('launch');
    this.play('launch', opts);
  }

  horizon() {
    if (!this.allowed('horizon')) return;
    this._record('horizon');
    this.play('horizon');
  }

  tear(opts = {}) {
    if (!this.allowed('tear')) return;
    this._record('tear');
    this.play('tear', opts);
  }

  capture() {
    if (!this.allowed('capture')) return;
    this._record('capture');
    this.play('capture');
  }

  escape() {
    if (!this.allowed('escape')) return;
    this._record('escape');
    this.play('escape');
  }

  missionComplete() {
    if (!this.allowed('mission-complete')) return;
    this._record('mission-complete');
    this.play('mission-complete');
  }

  missionFailed() {
    if (!this.allowed('mission-failed')) return;
    this._record('mission-failed');
    this.play('mission-failed');
  }

  missionUnlock() {
    if (!this.allowed('mission-unlock')) return;
    this._record('mission-unlock');
    this.play('mission-unlock');
  }

  reset() { this._last.clear(); }
}
