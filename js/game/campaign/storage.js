// game/campaign/storage.js — localStorage persistence for the campaign layer,
// one namespaced versioned key. Best-effort exactly like progression/storage.js:
// any failure collapses to null (caller normalizes), never crashes the game.

export const CAMPAIGN_STORAGE_KEY = 'blackhole-game:campaign:v1';

export function loadCampaign(storage = globalThis.localStorage) {
  let raw = null;
  try {
    if (storage && typeof storage.getItem === 'function') {
      raw = storage.getItem(CAMPAIGN_STORAGE_KEY);
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

export function saveCampaign(state, storage = globalThis.localStorage) {
  try {
    if (storage && typeof storage.setItem === 'function') {
      storage.setItem(CAMPAIGN_STORAGE_KEY, JSON.stringify(state));
    }
  } catch (e) {
    /* never let persistence break the game */
  }
}

export function clearCampaign(storage = globalThis.localStorage) {
  try {
    if (storage && typeof storage.removeItem === 'function') {
      storage.removeItem(CAMPAIGN_STORAGE_KEY);
    }
  } catch (e) {
    /* never let persistence break the game */
  }
}
