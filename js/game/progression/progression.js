// game/progression/progression.js — campaign controller. Owns the load/
// normalize/select/complete/persist lifecycle. Reads ONLY the finalized
// mission evaluation flag (missionResult.completed) — it never re-evaluates,
// never inspects telemetry/score/guidance/physics. Writes to storage ONLY when
// selection or completion actually changes the state.

import {
  createInitialProgressionState,
  normalizeProgressionState,
  isMissionUnlocked,
  isMissionCompleted,
  getCurrentMission,
  completeMission,
  selectMission,
} from './state.js';
import { loadProgression, saveProgression, clearProgression } from './storage.js';

export class Progression {
  constructor({ storage } = {}) {
    this._storage = storage;
    this._load();
  }

  _load() {
    this._state = normalizeProgressionState(loadProgression(this._storage));
  }

  get state() {
    return this._state;
  }

  isUnlocked(id) {
    return isMissionUnlocked(this._state, id);
  }

  isCompleted(id) {
    return isMissionCompleted(this._state, id);
  }

  currentMission() {
    return getCurrentMission(this._state);
  }

  // `complete` consumes ONLY the mission id + the evaluation result
  // (completed). Returns { changed, unlockedMissionId } so the UI can show
  // "NEXT MISSION UNLOCKED" exactly once per first completion.
  complete(id) {
    const before = this._state;
    const { state, unlockedMissionId } = completeMission(before, id);
    if (state === before) return { changed: false, unlockedMissionId: null };
    this._state = state;
    saveProgression(this._state, this._storage);
    return { changed: true, unlockedMissionId };
  }

  select(id) {
    const before = this._state;
    const next = selectMission(before, id);
    if (next === before) return false;
    this._state = next;
    saveProgression(this._state, this._storage);
    return true;
  }

  // Dev-only full reset: wipe the key, restore the initial state, persist it.
  reset() {
    clearProgression(this._storage);
    this._state = createInitialProgressionState();
    saveProgression(this._state, this._storage);
  }

  // Read-only defensive snapshot for the debug hook. Fresh copies of every
  // array, deep-frozen — mutating the returned object can never touch the
  // live campaign.
  get snapshot() {
    return Object.freeze({
      version: this._state.version,
      currentMissionId: this._state.currentMissionId,
      unlockedMissionIds: Object.freeze([...this._state.unlockedMissionIds]),
      completedMissionIds: Object.freeze([...this._state.completedMissionIds]),
      lastCompletedMissionId: this._state.lastCompletedMissionId,
      campaignComplete: this._state.campaignComplete,
    });
  }
}