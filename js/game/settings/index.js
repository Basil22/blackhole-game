// game/settings/index.js — barrel + thin controller for the Phase-20 settings.
//
// `Settings` owns one source of truth for the player-configurable flags. It
// loads/persists through storage.js (best-effort), exposes immutable state,
// and forwards every real change to `onApply(state, key)` so the app shell can
// route it to the audio layer, haptics, the intro, etc. Pure + node-testable:
// `storage` and `systemPref` are injected.

import {
  SETTINGS_VERSION,
  SETTINGS_KEYS,
  createDefaultSettings,
  normalizeSettings,
  setSetting,
  effectiveReduceMotion,
} from './model.js';
import {
  SETTINGS_STORAGE_KEY,
  loadSettings,
  saveSettings,
  clearSettings,
} from './storage.js';

export {
  SETTINGS_VERSION,
  SETTINGS_KEYS,
  createDefaultSettings,
  normalizeSettings,
  setSetting,
  effectiveReduceMotion,
  SETTINGS_STORAGE_KEY,
  loadSettings,
  saveSettings,
  clearSettings,
};

export class Settings {
  constructor({ storage, systemPref } = {}) {
    this._storage = storage || null;
    this._systemPref = systemPref || (() => false);
    this._onApply = () => {};
    this.state = loadSettings(this._storage);
  }

  set onApply(fn) {
    this._onApply = typeof fn === 'function' ? fn : () => {};
  }

  get(key) {
    return this.state ? this.state[key] : undefined;
  }

  get reduceMotionEffective() {
    return effectiveReduceMotion(this.state, this._systemPref());
  }

  // Persist + apply a real change. No-op (false) when nothing changed, so the
  // caller can skip re-application (e.g. the boot-time migration write).
  set(key, value) {
    const next = setSetting(this.state, key, value);
    if (next === this.state) return false;
    this.state = next;
    saveSettings(this.state, this._storage);
    this._onApply(this.state, key);
    return true;
  }

  // Apply the current state to every consumer (called once at boot and after
  // any external state replacement). `key` mirrors which setting changed.
  apply(key = null) {
    this._onApply(this.state, key);
  }

  reset() {
    this.state = createDefaultSettings();
    saveSettings(this.state, this._storage);
    this._onApply(this.state, null);
  }
}