// game/challenges/catalog.js — Phase-10 mission challenge metadata + validation.
// Extends the existing mission catalog (js/game/missions) with DECLARATIVE
// presentation fields: difficulty (1..5), recommendedObjectIds, and a player-
// facing hint. Mission ids + completion semantics are untouched — this layer
// only reads/validates them. Pure: Three.js-free, DOM-free, physics-free,
// deterministic, no mutation, no randomness.

import { MISSION_CATALOG, getMission, isValidMission } from '../missions/index.js';
import { OBJECT_IDS, OBJECT_CHALLENGE_PROFILES, getObjectChallengeProfile } from './profiles.js';

// Mission difficulty tier → label used in the selector (allowed values 1..5).
export const MISSION_DIFFICULTY_LABELS = Object.freeze({
  1: 'EASY',
  2: 'BALANCED',
  3: 'CHALLENGING',
  4: 'HARD',
  5: 'EXTREME',
});

// Non-empty unique string list (uppercased tokens / words are fine).
function isNonEmptyString(v) {
  return typeof v === 'string' && v.trim().length > 0;
}

// An array of unique, known ids (optionally drawn from a whitelist).
function isUniqueIdList(arr, known) {
  if (!Array.isArray(arr) || arr.length === 0) return false;
  const seen = new Set();
  for (const id of arr) {
    if (typeof id !== 'string' || !id) return false;
    if (seen.has(id)) return false;
    if (known && !known.includes(id)) return false;
    seen.add(id);
  }
  return true;
}

// A profile is challenge-valid when every field is well-formed and every
// referenced mission id really exists in the catalog.
export function isValidObjectChallengeProfile(p) {
  if (!p || typeof p !== 'object') return false;
  if (!OBJECT_IDS.includes(p.id)) return false;
  if (!isNonEmptyString(p.title) || !isNonEmptyString(p.shortDescription) || !isNonEmptyString(p.gameplayHint)) return false;
  if (!Number.isInteger(p.difficulty) || p.difficulty < 1 || p.difficulty > 4) return false;
  if (!Array.isArray(p.challengeTags) || p.challengeTags.length === 0) return false;
  if (new Set(p.challengeTags).size !== p.challengeTags.length) return false;
  if (!isUniqueIdList(p.recommendedMissionIds, MISSION_CATALOG.map((m) => m.id))) return false;
  return true;
}

// A mission carries valid challenge metadata when it survives the Phase-7
// mission validator AND adds an integer difficulty (1..5), a non-empty
// recommended-object list drawn from the object catalog, and a real hint.
// Unknown mission ids are rejected outright — the challenge layer only knows
// the curated catalog.
export function isValidMissionChallenge(m) {
  if (!isValidMission(m)) return false;
  if (!isKnownMission(m.id)) return false;
  if (!Number.isInteger(m.difficulty) || m.difficulty < 1 || m.difficulty > 5) return false;
  if (!isUniqueIdList(m.recommendedObjectIds, OBJECT_IDS)) return false;
  if (!isNonEmptyString(m.hint)) return false;
  return true;
}

export function isKnownMission(id) {
  return !!getMission(id);
}

// Difficulty view used by the selector: label + dots + accessible text.
// Out-of-range / non-integer difficulty renders as an empty tier (never
// throws — a defensive call stays safe). Valid tiers are 1..5.
export function missionDifficulty(difficulty) {
  const valid = Number.isInteger(difficulty) && difficulty >= 1 && difficulty <= 5;
  const n = valid ? difficulty : 0;
  const label = valid ? MISSION_DIFFICULTY_LABELS[n] : '';
  const dots = '●'.repeat(n) + '○'.repeat(5 - n);
  const aria = `Difficulty ${n} of 5 (${label})`;
  return { label, dots, aria };
}

// The challenge view of one mission: the mission itself plus its declarative
// presentation metadata. Returns null for unknown/malformed missions.
export function getMissionChallenge(id) {
  const m = getMission(id);
  if (!m || !isValidMissionChallenge(m)) return null;
  return { mission: m, difficulty: missionDifficulty(m.difficulty) };
}

// Cross-check the whole challenge dataset: every object has a valid profile and
// every catalog mission has valid challenge metadata. Returns { valid, errors }.
export function validateChallengeData() {
  const errors = [];

  for (const id of OBJECT_IDS) {
    if (!OBJECT_CHALLENGE_PROFILES[id]) errors.push(`no challenge profile for object '${id}'`);
    else if (!isValidObjectChallengeProfile(OBJECT_CHALLENGE_PROFILES[id])) errors.push(`invalid challenge profile for object '${id}'`);
  }
  // no extra profile keys drifting outside the object vocabulary
  for (const id of Object.keys(OBJECT_CHALLENGE_PROFILES)) {
    if (!OBJECT_IDS.includes(id)) errors.push(`profile '${id}' is not a known object`);
  }
  for (const m of MISSION_CATALOG) {
    if (!isValidMissionChallenge(m)) errors.push(`mission '${m.id}' has invalid challenge metadata`);
  }
  // every object profile's recommended missions exist
  for (const id of OBJECT_IDS) {
    const p = OBJECT_CHALLENGE_PROFILES[id];
    if (!p) continue;
    for (const mid of p.recommendedMissionIds) {
      if (!isKnownMission(mid)) errors.push(`object '${id}' recommends unknown mission '${mid}'`);
    }
  }

  return { valid: errors.length === 0, errors };
}