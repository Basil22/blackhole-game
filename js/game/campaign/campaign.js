// game/campaign/campaign.js — Phase-19 campaign controller.
//
// Sits next to the existing Progression controller and consumes ONLY its
// completedMissionIds array — it never re-evaluates missions, never inspects
// telemetry/score/guidance/physics. Level completion and object unlocks are
// derived on the fly (pure state.js functions), so replaying missions never
// re-unlocks anything and a dev reset of progression naturally resets the
// campaign. The controller persists only the non-derivable bits: the selected
// (current) level and the one-shot intro flag.

import {
  createInitialCampaignState,
  normalizeCampaignState,
  completedLevelIds,
  isLevelUnlocked,
  isObjectUnlocked,
  isCampaignComplete,
  deepestUnlockedLevelId,
  levelProgress,
  unlockLevelForObject,
  unlockHintForObject,
  objectLevelIndex as objectLevelIndexOf,
  selectLevel as selectLevelState,
} from './state.js';
import { loadCampaign, saveCampaign, clearCampaign } from './storage.js';
import { getLevel, getLastLevel } from './levels.js';

export class Campaign {
  constructor({ storage } = {}) {
    this._storage = storage;
    this._load();
  }

  _load() {
    this._state = normalizeCampaignState(loadCampaign(this._storage));
  }

  get state() {
    return this._state;
  }

  // ---- derived queries (pure, driven by the authoritative mission set) -----

  completedLevelIds(completedMissionIds) {
    return completedLevelIds(completedMissionIds);
  }

  isLevelUnlocked(levelId, completedMissionIds) {
    return isLevelUnlocked(levelId, this.completedLevelIds(completedMissionIds));
  }

  isObjectUnlocked(objectId, completedMissionIds) {
    return isObjectUnlocked(objectId, this.completedLevelIds(completedMissionIds));
  }

  isCampaignComplete(completedMissionIds) {
    return isCampaignComplete(this.completedLevelIds(completedMissionIds));
  }

  // Effective current level: the stored selection if it is still unlocked,
  // otherwise the deepest unlocked level (e.g. after a progression reset).
  currentLevel(completedMissionIds) {
    const unlocked = this.completedLevelIds(completedMissionIds);
    if (this._state.currentLevelId && isLevelUnlocked(this._state.currentLevelId, unlocked)) {
      return getLevel(this._state.currentLevelId);
    }
    return getLevel(deepestUnlockedLevelId(unlocked));
  }

  levelProgress(levelId, completedMissionIds) {
    return levelProgress(levelId, completedMissionIds);
  }

  unlockHintForObject(objectId, completedMissionIds) {
    return unlockHintForObject(objectId, this.completedLevelIds(completedMissionIds));
  }

  unlockLevelForObject(objectId, completedMissionIds) {
    return unlockLevelForObject(objectId, this.completedLevelIds(completedMissionIds));
  }

  // The level index the object belongs to / unlocks at (2 for 'human'). The
  // picker shows this as the compact "LV.{n}"; unlocking is pure whatever the
  // completed set holds.
  objectLevelIndex(objectId) {
    return objectLevelIndexOf(objectId);
  }

  // ---- transitions ----------------------------------------------------------

  // Feed the completed-mission snapshot BEFORE and AFTER one throw's mission
  // completion. `prev` can be null (fresh boot without an explicit snapshot) —
  // then every currently-complete level reports once. Returns:
  //   { changed, newLevels: [level defs], unlockedObjects: [object ids],
  //     currentLevelId, currentLevelChanged, campaignComplete, lastLevel }
  recordMissionComplete(prevCompletedMissionIds, completedMissionIds) {
    const before = completedLevelIds(prevCompletedMissionIds || []);
    const now = completedLevelIds(completedMissionIds);
    const newLevelIds = now.filter((id) => !before.includes(id));
    if (!newLevelIds.length) {
      return {
        changed: false,
        newLevels: [],
        unlockedObjects: [],
        currentLevelId: this.currentLevel(completedMissionIds).id,
        currentLevelChanged: false,
        campaignComplete: isCampaignComplete(now),
        lastLevel: null,
      };
    }

    // Auto-advance the selected level to the deepest unlocked one, so a new
    // unlock always lands the player in the freshly opened context.
    const deepest = deepestUnlockedLevelId(now);
    const beforeLevel = this._state.currentLevelId;
    const changed =
      !beforeLevel || !isLevelUnlocked(beforeLevel, now) || beforeLevel !== deepest;
    if (changed) {
      this._state = { ...this._state, currentLevelId: deepest };
      saveCampaign(this._state, this._storage);
    }

    const newLevels = newLevelIds.map((id) => getLevel(id)).filter(Boolean);
    const unlockedObjects = [];
    for (const lvl of newLevels) {
      if (lvl.unlocks && lvl.unlocks.objectId) unlockedObjects.push(lvl.unlocks.objectId);
    }
    return {
      changed: true,
      newLevels,
      unlockedObjects,
      currentLevelId: deepest,
      currentLevelChanged: beforeLevel !== deepest,
      campaignComplete: isCampaignComplete(now),
      lastLevel: getLastLevel(),
    };
  }

  // Manually pick an unlocked level (level selector). Persists only on change.
  selectLevel(levelId, completedMissionIds) {
    const before = this._state;
    const next = selectLevelState(before, levelId, this.completedLevelIds(completedMissionIds));
    if (next === before) return false;
    this._state = next;
    saveCampaign(this._state, this._storage);
    return true;
  }

  // One-shot first-play intro flag ("DRAG TO AIM · RELEASE TO THROW").
  dismissIntro() {
    if (this._state.showIntro === false) return false;
    this._state = { ...this._state, showIntro: false };
    saveCampaign(this._state, this._storage);
    return true;
  }

  // Dev-only full reset: wipe the key, restore the initial state, persist it.
  reset() {
    clearCampaign(this._storage);
    this._state = createInitialCampaignState();
    saveCampaign(this._state, this._storage);
  }

  // Read-only defensive snapshot for the debug hook. Fresh arrays, deep-frozen.
  get snapshot() {
    return Object.freeze({
      version: this._state.version,
      currentLevelId: this._state.currentLevelId,
      showIntro: this._state.showIntro === true,
    });
  }
}
