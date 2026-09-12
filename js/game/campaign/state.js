// game/campaign/state.js — pure Phase-19 campaign state model.
//
// The campaign is a thin, fully-derived layer over the existing mission
// progression: level completion is a pure function of the completed mission
// ids owned by Progression (the single authoritative source). The campaign
// state only stores what is NOT derivable: which unlocked level is currently
// selected and the one-shot intro flag.
//
//   completedMissionIds (Progression)  →  completedLevelIds  →  unlocks
//
// Every op is pure: Three.js-free, DOM-free, physics-free, storage-free, never
// mutates inputs. Unknown/duplicate/malformed data is rejected defensively.

import {
  CAMPAIGN_LEVELS,
  getLevel,
  getFirstLevel,
  getLastLevel,
} from './levels.js';

export const CAMPAIGN_VERSION = 1;

// ---- initial / normalize ---------------------------------------------------

export function createInitialCampaignState() {
  const first = getFirstLevel();
  return {
    version: CAMPAIGN_VERSION,
    currentLevelId: first ? first.id : null,
    showIntro: true,
  };
}

// Reconcile arbitrary stored bytes: non-object / wrong version / unknown
// currentLevelId all fall back to the initial state. showIntro only ever
// clears, never re-enables. Never throws.
export function normalizeCampaignState(raw) {
  if (!raw || typeof raw !== 'object') return createInitialCampaignState();
  if (raw.version !== CAMPAIGN_VERSION) return createInitialCampaignState();
  const currentLevelId = getLevel(raw.currentLevelId) ? raw.currentLevelId : null;
  return {
    version: CAMPAIGN_VERSION,
    currentLevelId: currentLevelId || createInitialCampaignState().currentLevelId,
    showIntro: raw.showIntro === false ? false : true,
  };
}

// ---- derived queries -------------------------------------------------------

// A level is complete iff EVERY required mission is in the completed set.
// Unknown mission ids can never satisfy a required mission.
export function completedLevelIds(completedMissionIds) {
  const done = Array.isArray(completedMissionIds) ? completedMissionIds : [];
  return CAMPAIGN_LEVELS
    .filter((l) => l.requiredMissionIds.every((id) => done.includes(id)))
    .map((l) => l.id);
}

export function isLevelUnlocked(levelId, completedLevelIdsList) {
  const lvl = getLevel(levelId);
  if (!lvl) return false;
  if (lvl.index === 1) return true;
  const prev = getLevelByIndexStrict(lvl.index - 1);
  return !!prev && completedLevelIdsList.includes(prev.id);
}

// Object availability is presentation/progression-only. A level's object is
// unlocked exactly when that level is unlocked (Level 1's object at boot,
// every later object when the preceding level completes). Unknown ids stay
// unlocked (defensive — never brick an object the catalog doesn't know about).
export function isObjectUnlocked(objectId, completedLevelIdsList) {
  const lvl = CAMPAIGN_LEVELS.find((l) => l.objectId === objectId);
  if (!lvl) return true;
  return isLevelUnlocked(lvl.id, completedLevelIdsList);
}

export function isCampaignComplete(completedLevelIdsList) {
  const last = getLastLevel();
  return !!last && completedLevelIdsList.includes(last.id);
}

// Deepest unlocked level — the level the player should be playing. Level 1 is
// always unlocked, so this always returns a valid level id.
export function deepestUnlockedLevelId(completedLevelIdsList) {
  let deepest = getFirstLevel().id;
  for (const l of CAMPAIGN_LEVELS) {
    if (isLevelUnlocked(l.id, completedLevelIdsList)) deepest = l.id;
  }
  return deepest;
}

// The progress readout for a level: completed / required mission counts.
// { done, required, complete } — required is 0 when the level has none.
export function levelProgress(levelId, completedMissionIds) {
  const lvl = getLevel(levelId);
  if (!lvl) return { done: 0, required: 0, complete: false };
  const done = Array.isArray(completedMissionIds) ? completedMissionIds : [];
  const required = lvl.requiredMissionIds.filter((id) => done.includes(id)).length;
  return {
    done: required,
    required: lvl.requiredMissionIds.length,
    complete: required === lvl.requiredMissionIds.length && lvl.requiredMissionIds.length > 0,
  };
}

// The level index a locked object needs cleared (e.g. 1 for 'human'), or 0
// when the object is already unlocked / unknown. The picker shows the compact
// 'LV.{n}' form from this; the level modal spells it out.
export function unlockLevelForObject(objectId, completedLevelIdsList) {
  const lvl = CAMPAIGN_LEVELS.find((l) => l.objectId === objectId);
  if (!lvl) return 0;
  if (isLevelUnlocked(lvl.id, completedLevelIdsList)) return 0;
  const prev = getLevelByIndexStrict(lvl.index - 1);
  return prev ? prev.index : 0;
}

// Player-facing lock hint for a locked object, e.g. 'Clear Level 1'. Empty
// string when the object is unlocked or unknown.
export function unlockHintForObject(objectId, completedLevelIdsList) {
  const n = unlockLevelForObject(objectId, completedLevelIdsList);
  return n ? `Clear Level ${n}` : '';
}

// The level index the object belongs to / unlocks at: rock→1, human→2,
// ship→3, planet→4 (or 0 when unknown). The picker's compact 'LV.{n}' reads
// this, while unlockHintForObject keeps spelling out which level to CLEAR.
export function objectLevelIndex(objectId) {
  const lvl = CAMPAIGN_LEVELS.find((l) => l.objectId === objectId);
  return lvl ? lvl.index : 0;
}

// ---- transitions (immutable) -----------------------------------------------

// Select an unlocked level; locked/missing/current are no-ops.
export function selectLevel(state, levelId, completedLevelIdsList) {
  if (!getLevel(levelId)) return state;
  if (!isLevelUnlocked(levelId, completedLevelIdsList)) return state;
  if (state.currentLevelId === levelId) return state;
  return { ...state, version: CAMPAIGN_VERSION, currentLevelId: levelId };
}

// ---- internal ---------------------------------------------------------------

function getLevelByIndexStrict(index) {
  return CAMPAIGN_LEVELS.find((l) => l.index === index) || null;
}
