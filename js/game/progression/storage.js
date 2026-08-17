// game/progression/storage.js — localStorage persistence for the campaign,
// one namespaced versioned key. Storage is best-effort: any failure (unavailable
// backend, quota, throws) is swallowed and reported as "nothing stored"; the
// caller normalizes through state.js so it can never crash the game.

export const PROGRESSION_STORAGE_KEY = 'blackhole-game:progression:v1';

// Parse the stored raw state object, or null when nothing is stored or the
// bytes are unusable (corrupt JSON, backend unavailable). parse errors and
// backend throws both collapse to null — normalize() then falls back to a
// clean initial state.
export function loadProgression(storage = globalThis.localStorage) {
  let raw = null;
  try {
    if (storage && typeof storage.getItem === 'function') {
      raw = storage.getItem(PROGRESSION_STORAGE_KEY);
    }
  } catch (e) {
    raw = null;
  }
  if (raw == null) return null;
  try {
    return JSON.parse(raw);
  } catch (e) {
    return null;
  }
}

export function saveProgression(state, storage = globalThis.localStorage) {
  try {
    if (storage && typeof storage.setItem === 'function') {
      storage.setItem(PROGRESSION_STORAGE_KEY, JSON.stringify(state));
    }
  } catch (e) {
    /* never let persistence break the game */
  }
}

export function clearProgression(storage = globalThis.localStorage) {
  try {
    if (storage && typeof storage.removeItem === 'function') {
      storage.removeItem(PROGRESSION_STORAGE_KEY);
    }
  } catch (e) {
    /* never let persistence break the game */
  }
}