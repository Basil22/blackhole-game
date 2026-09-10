// game/missions/mission.js — mission definition data model + validation.
// Pure layer: no DOM, no three.js, no physics, no game-state access. A mission
// is a plain declarative object that the evaluator turns into a result against
// a finalized ThrowTelemetry + ThrowScore.

import { TRAJECTORY } from '../../physics/trajectory/index.js';

export const MISSION_TYPES = Object.freeze({
  STATE: 'STATE',
  NEAR_HORIZON: 'NEAR_HORIZON',
  SCORE: 'SCORE',
  SURVIVE_NEAR_HORIZON: 'SURVIVE_NEAR_HORIZON',
  TEAR_COUNT: 'TEAR_COUNT',       // target = minimum tear count
  STRETCH: 'STRETCH',             // target = minimum stretch ratio (e.g. 2.0 = 2×)
});

// Reuse the EXACT trajectory/telemetry state vocabulary (ESCAPING/FLYBY/ORBITAL/
// CAPTURED/HORIZON_CROSSING/UNKNOWN) instead of duplicating it. The evaluator
// compares mission.state against telemetry.trajectoryState, which is produced by
// the same classifier — so the strings always agree.
export const MISSION_STATES = TRAJECTORY;

// Defensive: reject malformed definitions before they ever reach the evaluator.
export function isValidMission(m) {
  if (!m || typeof m !== 'object') return false;
  if (typeof m.id !== 'string' || !m.id) return false;
  if (!Object.values(MISSION_TYPES).includes(m.type)) return false;
  if (m.type === MISSION_TYPES.STATE) {
    return typeof m.state === 'string' && Object.values(TRAJECTORY).includes(m.state);
  }
  return typeof m.target === 'number' && Number.isFinite(m.target) && m.target > 0;
}
