// game/settings/storage.js — best-effort localStorage persistence for the
// Phase-20 settings. Same defensive contract as campaign/storage.js: a missing
// backend, corrupt JSON, or anything that throws collapses to defaults and the
// game never breaks. An injectable storage allows node tests to stub it.

import { createDefaultSettings, normalizeSettings } from './model.js';

export const SETTINGS_STORAGE_KEY = 'blackhole-game:settings:v1';

function noopStorage() {
  return {
    getItem: () => null,
    setItem: () => {},
    removeItem: () => {},
  };
}

export function loadSettings(storage) {
  const s = storage || noopStorage();
  try {
    const raw = typeof s.getItem === 'function' ? s.getItem(SETTINGS_STORAGE_KEY) : null;
    if (raw == null) return createDefaultSettings();
    return normalizeSettings(JSON.parse(raw));
  } catch (err) {
    return createDefaultSettings();
  }
}

export function saveSettings(state, storage) {
  try {
    if (storage && typeof storage.setItem === 'function') {
      storage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(state));
      return true;
    }
  } catch (err) {
    /* storage disabled or full — settings simply won't persist */
  }
  return false;
}

export function clearSettings(storage) {
  try {
    if (storage && typeof storage.removeItem === 'function') {
      storage.removeItem(SETTINGS_STORAGE_KEY);
      return true;
    }
  } catch (err) {
    /* ignore */
  }
  return false;
}