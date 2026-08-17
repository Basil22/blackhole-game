// game/settings/model.js — pure Phase-20 settings state: defaults, defensive
// normalization, immutable updates, and the reduced-motion resolution rule.
//
// THREE-free / DOM-free / AudioContext-free so node can import it directly.
// The settings live here as plain data; js/main.js owns HOW they are applied
// to the audio layer + intro. The storage key/round-trip lives in storage.js.
//
// Resolution rules (documented once, here, in plain words):
//   - audio / haptics: plain booleans (on by default).
//   - skipIntro: plain boolean (off by default) — "go straight to gameplay"
//     on later launches.
//   - reduceMotion: an EXPLICIT user preference (off by default). Reduced
//     motion is never FORCED OFF by the app, so the effective value is
//     `system preference OR explicit toggle` — when a user asked for reduced
//     motion anywhere (OS or this screen) we always honor it.

export const SETTINGS_VERSION = 1;

export const SETTINGS_KEYS = Object.freeze(['audio', 'haptics', 'skipIntro', 'reduceMotion']);

export function createDefaultSettings() {
  return Object.freeze({
    version: SETTINGS_VERSION,
    audio: true,
    haptics: true,
    skipIntro: false,
    reduceMotion: false,
  });
}

// Coerce an untrusted stored object into a valid settings state. Garbage, a
// missing/wrong version, or unknown keys fall back per-field to defaults;
// completely unusable input collapses to the full defaults. Never throws.
export function normalizeSettings(raw) {
  if (!raw || typeof raw !== 'object') return createDefaultSettings();
  if (raw.version !== SETTINGS_VERSION) return createDefaultSettings();
  const def = createDefaultSettings();
  const out = { version: SETTINGS_VERSION };
  for (const key of SETTINGS_KEYS) {
    out[key] = typeof raw[key] === 'boolean' ? raw[key] : def[key];
  }
  return Object.freeze(out);
}

// Immutable toggle of a single setting. Known keys only — unknown keys (or a
// value identical to the current one) return the SAME frozen object (no-op,
// so callers can diff by identity).
export function setSetting(state, key, value) {
  if (!SETTINGS_KEYS.includes(key)) return state;
  const next = !!value;
  if (state[key] === next) return state;
  return Object.freeze({ ...state, [key]: next });
}

// The effective reduced-motion decision. `systemPref` is the live OS/browser
// `prefers-reduced-motion` reading; the explicit in-game toggle stacks on top.
export function effectiveReduceMotion(state, systemPref) {
  return !!(systemPref || (state && state.reduceMotion === true));
}