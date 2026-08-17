// game/challenges/evaluate.js — Phase-10 recommendation evaluator.
// PURE: decides which object is recommended for a mission, given the live
// object catalog (injected — never imported physics). Deterministic, no
// randomness, no mutation, defensive on garbage. The recommendation is
// advisory only: the picker stays open to every object.
//
// Selection ladder (documented, stable order):
//   1. the first mission.recommendedObjectIds entry that EXISTS in the
//      provided objectCatalog;
//   2. else the first catalog object whose challenge profile lists this
//      mission in recommendedMissionIds;
//   3. else the first object in the catalog.
// Returns null only when both mission and catalog are unusable.

import { isValidMissionChallenge } from './catalog.js';
import { getObjectChallengeProfile, difficultyLabel, OBJECT_CHALLENGE_PROFILES } from './profiles.js';

function hasObject(catalog, id) {
  return Array.isArray(catalog) && catalog.some((o) => o && o.id === id);
}

function reasonFor(objectId) {
  const p = getObjectChallengeProfile(objectId);
  if (!p) return '';
  return `${difficultyLabel(p.difficulty)} pick — ${p.shortDescription}`;
}

export function getRecommendedObject(mission, objectCatalog) {
  if (!isValidMissionChallenge(mission)) return null;

  // rung 1 — mission's own declared preference, first in declared order
  if (Array.isArray(mission.recommendedObjectIds)) {
    for (const id of mission.recommendedObjectIds) {
      if (hasObject(objectCatalog, id)) {
        return { objectId: id, reason: reasonFor(id) };
      }
    }
  }

  // rung 2 — objects that name this mission in their profile
  const catalog = Array.isArray(objectCatalog) ? objectCatalog : [];
  for (const entry of catalog) {
    if (!entry || typeof entry.id !== 'string') continue;
    const p = OBJECT_CHALLENGE_PROFILES[entry.id];
    if (p && Array.isArray(p.recommendedMissionIds) && p.recommendedMissionIds.includes(mission.id)) {
      return { objectId: entry.id, reason: reasonFor(entry.id) };
    }
  }

  // rung 3 — first available object
  if (catalog.length > 0) {
    const fallback = catalog[0];
    if (fallback && typeof fallback.id === 'string') {
      return { objectId: fallback.id, reason: reasonFor(fallback.id) };
    }
  }

  return null;
}