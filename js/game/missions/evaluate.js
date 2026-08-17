// game/missions/evaluate.js — the PURE mission evaluator.
//   evaluateMission(mission, { telemetry, score }) → { missionId, completed, progress, reason }
//
// Consumes ONLY a finalized ThrowTelemetry + ThrowScore. Never runs physics,
// never predicts a trajectory, never touches the live world, never mutates its
// inputs. Deterministic: identical inputs → identical output. Defensive: null /
// malformed / NaN / Infinity inputs degrade to { completed:false, progress:0,
// reason } instead of throwing.

import { isValidMission, MISSION_TYPES } from './mission.js';

// Normalize any number into [0, 1] — NaN/Infinity become 0 so a bad number can
// never complete a mission or corrupt progress.
function norm01(n) {
  return Math.max(0, Math.min(1, Number.isFinite(n) ? n : 0));
}

function fail(missionId, reason) {
  return { missionId, completed: false, progress: 0, reason };
}

// A "survived" object is one the horizon did NOT consume and the player did NOT
// cut short — the throw genuinely ended with the object still intact.
function survived(telemetry) {
  const consumed = Number.isFinite(telemetry.consumedPointCount) ? telemetry.consumedPointCount : 0;
  return consumed === 0 && telemetry.terminationReason !== 'PLAYER_RESET';
}

// A "fully consumed" object lost every point to the horizon.
function isFullyConsumed(telemetry) {
  if (telemetry.terminationReason === 'PLAYER_RESET') return false;
  const initial = Number.isFinite(telemetry.initialPointCount) ? telemetry.initialPointCount : 0;
  const consumed = Number.isFinite(telemetry.consumedPointCount) ? telemetry.consumedPointCount : 0;
  return initial > 0 && consumed >= initial;
}

function horizonRadius(score, telemetry) {
  if (score && Number.isFinite(score.horizonRadius) && score.horizonRadius > 0) return score.horizonRadius;
  if (telemetry && Number.isFinite(telemetry.horizonRadius) && telemetry.horizonRadius > 0) return telemetry.horizonRadius;
  return null;
}

// Distance progress: 1 once within the target, scaling down toward 0 as the pass
// falls short. At twice the target distance progress is 0. Purely informational —
// completion is decided ONLY by `distance <= target` above, never by progress.
function distanceProgress(distance, targetDistance) {
  if (!Number.isFinite(distance) || distance <= 0) return 0;
  if (!Number.isFinite(targetDistance) || targetDistance <= 0) return 0;
  return norm01(1 - (distance - targetDistance) / targetDistance);
}

export function evaluateMission(mission, { telemetry, score } = {}) {
  if (!isValidMission(mission)) return fail(mission ? mission.id : null, 'invalid mission definition');
  if (!telemetry || typeof telemetry !== 'object') return fail(mission.id, 'no telemetry');

  switch (mission.type) {
    case MISSION_TYPES.STATE:
      return evaluateState(mission, telemetry);
    case MISSION_TYPES.NEAR_HORIZON:
      return evaluateNearHorizon(mission, telemetry, score);
    case MISSION_TYPES.SURVIVE_NEAR_HORIZON:
      return evaluateSurviveNearHorizon(mission, telemetry, score);
    case MISSION_TYPES.SCORE:
      return evaluateScore(mission, telemetry, score);
    default:
      return fail(mission.id, `unsupported type ${mission.type}`);
  }
}

// STATE — complete when telemetry.trajectoryState matches the required state.
function evaluateState(mission, telemetry) {
  const state = telemetry.trajectoryState;
  const completed = state === mission.state;
  return {
    missionId: mission.id,
    completed,
    progress: completed ? 1 : 0,
    reason: completed ? `Reached ${state}` : `Trajectory was ${state ?? 'unknown'}, not ${mission.state}`,
  };
}

// NEAR_HORIZON — complete when the finalized closest approach is within the
// specified multiple of the event horizon.
function evaluateNearHorizon(mission, telemetry, score) {
  const hr = horizonRadius(score, telemetry);
  if (hr === null) return fail(mission.id, 'no horizon radius');
  const targetDistance = mission.target * hr;
  const d = telemetry.closestApproach ? telemetry.closestApproach.distance : NaN;
  if (!Number.isFinite(d) || d <= 0) return fail(mission.id, 'no closest approach');
  const completed = d <= targetDistance;
  return {
    missionId: mission.id,
    completed,
    progress: distanceProgress(d, targetDistance),
    reason: completed
      ? `Passed within ${mission.target}× horizon`
      : `Closest ${fmtDist(d)} — need ≤ ${fmtDist(targetDistance)}`,
  };
}

// SURVIVE_NEAR_HORIZON — near-horizon pass where the object was NOT fully
// consumed. Partial survival (some points lost, some remain) counts: the object
// grazed the void and lived to tell the tale.
function evaluateSurviveNearHorizon(mission, telemetry, score) {
  const hr = horizonRadius(score, telemetry);
  if (hr === null) return fail(mission.id, 'no horizon radius');
  const targetDistance = mission.target * hr;
  const d = telemetry.closestApproach ? telemetry.closestApproach.distance : NaN;
  if (!Number.isFinite(d) || d <= 0) return fail(mission.id, 'no closest approach');
  const closeEnough = d <= targetDistance;
  if (telemetry.terminationReason === 'PLAYER_RESET') {
    return {
      missionId: mission.id, completed: false, progress: 0,
      reason: 'Throw aborted',
    };
  }
  const fullyConsumed = isFullyConsumed(telemetry);
  const completed = closeEnough && !fullyConsumed;
  if (!closeEnough) {
    return {
      missionId: mission.id, completed, progress: distanceProgress(d, targetDistance),
      reason: `Closest ${fmtDist(d)} — need ≤ ${fmtDist(targetDistance)}`,
    };
  }
  if (fullyConsumed) {
    return {
      missionId: mission.id, completed, progress: 0,
      reason: telemetry.terminationReason === 'PLAYER_RESET'
        ? 'Throw aborted'
        : 'Passed close but the object was consumed',
    };
  }
  const initial = telemetry.initialPointCount || 0;
  const consumed = telemetry.consumedPointCount || 0;
  const intact = consumed === 0;
  return {
    missionId: mission.id, completed: true, progress: 1,
    reason: intact
      ? `Survived a pass within ${mission.target}× horizon`
      : `Grazed the void — ${consumed}/${initial} points lost, but not consumed`,
  };
}

// SCORE — complete when score.total reaches the target.
function evaluateScore(mission, telemetry, score) {
  const total = score && Number.isFinite(score.total) ? score.total : NaN;
  const target = mission.target;
  const completed = Number.isFinite(total) && total >= target;
  return {
    missionId: mission.id,
    completed,
    progress: Number.isFinite(total) ? norm01(total / target) : 0,
    reason: completed
      ? `Scored ${Math.round(total)}`
      : `Scored ${Math.round(Number.isFinite(total) ? total : 0)} — need ${target}`,
  };
}

function fmtDist(n) {
  if (!Number.isFinite(n)) return '—';
  return n >= 1000 ? `${(n / 1000).toFixed(1)} km` : `${Math.round(n)} m`;
}
