// game/missions/stars.js — star rating per mission (Phase B).
// Each mission awards 1-3 stars based on quality of completion. 1 star = pass,
// 2 stars = good, 3 stars = excellent. Pure: no DOM, no physics, no state.
//
// Star thresholds are mission-type-specific and derive from the mission
// definition + the evaluation result + the throw score. The evaluator already
// computes `completed` and `progress`; stars add a quality layer on top.

import { MISSION_TYPES } from './mission.js';

// Star threshold definitions per mission type.
// Each returns 0 (not completed), 1, 2, or 3.
export function calculateStars(mission, { telemetry, score } = {}) {
  if (!mission || !telemetry) return 0;

  switch (mission.type) {
    case MISSION_TYPES.SCORE:
      return scoreStars(mission, score);
    case MISSION_TYPES.STATE:
      return stateStars(mission, telemetry, score);
    case MISSION_TYPES.NEAR_HORIZON:
      return nearHorizonStars(mission, telemetry, score);
    case MISSION_TYPES.TEAR_COUNT:
      return tearCountStars(mission, telemetry);
    case MISSION_TYPES.STRETCH:
      return stretchStars(mission, telemetry);
    case MISSION_TYPES.SURVIVE_NEAR_HORIZON:
      return surviveNearHorizonStars(mission, telemetry, score);
    default:
      return 0;
  }
}

// SCORE missions: 1* = target, 2* = 1.5x target, 3* = 2.5x target
function scoreStars(mission, score) {
  const total = score && Number.isFinite(score.total) ? score.total : 0;
  const t = mission.target;
  if (total < t) return 0;
  if (total >= t * 2.5) return 3;
  if (total >= t * 1.5) return 2;
  return 1;
}

// STATE missions: 1* = achieved state, 2* = state + score >= 800, 3* = state + score >= 2000
function stateStars(mission, telemetry, score) {
  if (telemetry.trajectoryState !== mission.state) return 0;
  const total = score && Number.isFinite(score.total) ? score.total : 0;
  if (total >= 2000) return 3;
  if (total >= 800) return 2;
  return 1;
}

// NEAR_HORIZON: 1* = within target, 2* = within target*0.75, 3* = within target*0.55
function nearHorizonStars(mission, telemetry, score) {
  const hr = (score && Number.isFinite(score.horizonRadius)) ? score.horizonRadius : 40;
  const d = telemetry.closestApproach ? telemetry.closestApproach.distance : Infinity;
  const targetDist = mission.target * hr;
  if (d > targetDist) return 0;
  if (d <= targetDist * 0.55) return 3;
  if (d <= targetDist * 0.75) return 2;
  return 1;
}

// TEAR_COUNT: 1* = target, 2* = target + 2, 3* = target + 5
function tearCountStars(mission, telemetry) {
  const tears = Math.floor(Number.isFinite(telemetry.tearCount) ? telemetry.tearCount : 0);
  const t = Math.floor(mission.target);
  if (tears < t) return 0;
  if (tears >= t + 5) return 3;
  if (tears >= t + 2) return 2;
  return 1;
}

// STRETCH: 1* = target, 2* = 1.5x target, 3* = 2x target
function stretchStars(mission, telemetry) {
  const stretch = Number.isFinite(telemetry.maximumStretch) ? telemetry.maximumStretch : 1;
  const t = mission.target;
  if (stretch < t) return 0;
  if (stretch >= t * 2) return 3;
  if (stretch >= t * 1.5) return 2;
  return 1;
}

// SURVIVE_NEAR_HORIZON: same as NEAR_HORIZON but must also survive
function surviveNearHorizonStars(mission, telemetry, score) {
  const consumed = Number.isFinite(telemetry.consumedPointCount) ? telemetry.consumedPointCount : 0;
  if (consumed > 0) return 0;
  return nearHorizonStars(mission, telemetry, score);
}

// Format stars for display: filled and empty dots (monochrome)
export function formatStars(n) {
  const filled = Math.max(0, Math.min(3, Math.floor(n)));
  return '★'.repeat(filled) + '☆'.repeat(3 - filled);
}

// Accessible label
export function starsAriaLabel(n) {
  return `${Math.max(0, Math.min(3, Math.floor(n)))} of 3 stars`;
}
