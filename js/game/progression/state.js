// game/progression/state.js — pure campaign-progression state model for the
// Phase-7 mission set. A fixed linear order of missions; the FIRST is unlocked
// at boot, and each first completion unlocks EXACTLY ONE next mission and makes
// it current. Replays never unlock again. Completing the final mission ends the
// campaign.
//
// Pure layer: Three.js-free, DOM-free, physics-free, storage-free. Every op
// returns a NEW state object and never mutates its inputs.

import { getMission } from '../missions/index.js';

// Authoritative, fixed order — never derived from catalog/catalog insertion.
//       1 near-horizon-01 (Touch the Edge)
//       2 escape-01        (Break Free)
//       3 capture-01       (Into the Abyss)
//       4 orbit-01         (Find the Orbit)
//       5 score-01         (Make It Count)
//       6 score-02         (High Roller)
//
// NOTE (Phase 24): survive-near-horizon-01 ("Grazing the Void") was REMOVED from
// the forced order. Real-sim evidence: the horizon is binary — every close pass
// (≤1.5×HR) consumes the object (human has zero partial survivals near the hole;
// rock/ship/planet shed mass but all end HORIZON_CROSSING) — so no throw is both
// close and survived. Keeping it in the forced chain stranded players on step 4
// and made the progression campaign unwinnable on human/ship/planet paths. It
// stays in the mission CATALOG as an optional (rock-reachable) side badge; it is
// simply not part of the linear unlock ladder.
export const MISSION_ORDER = Object.freeze([
  'near-horizon-01',
  'escape-01',
  'capture-01',
  'orbit-01',
  'score-01',
  'score-02',
]);

export const PROGRESSION_VERSION = 1;

export function createInitialProgressionState() {
  const first = MISSION_ORDER[0];
  return {
    version: PROGRESSION_VERSION,
    currentMissionId: first,
    unlockedMissionIds: [first],
    completedMissionIds: [],
    lastCompletedMissionId: null,
    campaignComplete: false,
  };
}

// ---- queries -------------------------------------------------------------

export function isMissionUnlocked(state, id) {
  return !!state && state.unlockedMissionIds.includes(id);
}

export function isMissionCompleted(state, id) {
  return !!state && state.completedMissionIds.includes(id);
}

export function isCampaignComplete(state) {
  return !!state && state.campaignComplete === true;
}

export function getCurrentMission(state) {
  return state ? getMission(state.currentMissionId) || null : null;
}

export function getNextMissionId(state) {
  if (!state) return null;
  const i = MISSION_ORDER.indexOf(state.currentMissionId);
  return i >= 0 && i < MISSION_ORDER.length - 1 ? MISSION_ORDER[i + 1] : null;
}

// ---- transitions (immutable) --------------------------------------------

// First completion of an UNLOCKED mission: mark completed, unlock exactly the
// next not-yet-unlocked mission in the order, make it current. Replays and
// locked missions are no-ops (same state object, unlockedMissionId: null).
// Returns { state, unlockedMissionId: string|null }.
export function completeMission(state, id, order = MISSION_ORDER) {
  if (!isMissionUnlocked(state, id)) return { state, unlockedMissionId: null };
  if (isMissionCompleted(state, id)) return { state, unlockedMissionId: null };

  const idx = order.indexOf(id);
  let nextId = null;
  for (let i = idx + 1; i < order.length; i++) {
    if (!state.unlockedMissionIds.includes(order[i])) {
      nextId = order[i];
      break;
    }
  }

  const completedMissionIds = [...state.completedMissionIds, id];
  const unlockedMissionIds = nextId
    ? [...state.unlockedMissionIds, nextId]
    : state.unlockedMissionIds;
  const campaignComplete =
    unlockedMissionIds.length === order.length &&
    completedMissionIds.length === order.length;

  return {
    state: {
      version: PROGRESSION_VERSION,
      currentMissionId: nextId || id,
      unlockedMissionIds,
      completedMissionIds,
      lastCompletedMissionId: id,
      campaignComplete,
    },
    unlockedMissionId: nextId,
  };
}

// Select an unlocked mission to aim at; locked/missing are no-ops.
export function selectMission(state, id) {
  if (!isMissionUnlocked(state, id)) return state;
  if (state.currentMissionId === id) return state;
  return {
    ...state,
    version: PROGRESSION_VERSION,
    currentMissionId: id,
  };
}

// ---- normalization --------------------------------------------------------

function _cleanIds(raw) {
  if (!Array.isArray(raw)) return [];
  const out = [];
  for (const id of raw) {
    if (typeof id !== 'string') continue;
    if (!MISSION_ORDER.includes(id)) continue;
    if (out.includes(id)) continue;
    out.push(id);
  }
  return out;
}

// Reconcile arbitrary stored bytes against the authoritative order + catalog:
// unknown/duplicate ids stripped, completed forced inside unlocked, current
// forced inside unlocked, campaignComplete recomputed (never trusted). Falls
// back to the initial state when the data is unusable (non-object, wrong
// version, or no valid unlocked missions). Never throws.
export function normalizeProgressionState(raw) {
  if (!raw || typeof raw !== 'object') return createInitialProgressionState();
  if (raw.version !== PROGRESSION_VERSION) return createInitialProgressionState();

  const unlocked = _cleanIds(raw.unlockedMissionIds);
  if (!unlocked.length) return createInitialProgressionState();

  const completed = _cleanIds(raw.completedMissionIds).filter((id) => unlocked.includes(id));

  const lastCompleted =
    typeof raw.lastCompletedMissionId === 'string' && completed.includes(raw.lastCompletedMissionId)
      ? raw.lastCompletedMissionId
      : completed[completed.length - 1] || null;

  const current = unlocked.includes(raw.currentMissionId) ? raw.currentMissionId : unlocked[0];

  const campaignComplete =
    unlocked.length === MISSION_ORDER.length && completed.length === MISSION_ORDER.length;

  return {
    version: PROGRESSION_VERSION,
    currentMissionId: current,
    unlockedMissionIds: unlocked,
    completedMissionIds: completed,
    lastCompletedMissionId: lastCompleted,
    campaignComplete,
  };
}