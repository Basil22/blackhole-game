// game/scoring/index.js — barrel for the throw-scoring engine.
//
//   ThrowTelemetry
//        ↓
//   calculateThrowScore(telemetry)
//        ↓
//   ThrowScore  (pure, serializable, capped, deterministic)
//
// Three.js-free / DOM-free / physics-free: it only reads the finalized
// telemetry you hand it. Tuning lives entirely in SCORING_CONFIG.
export { SCORING_CONFIG, normalize01, safeDistance } from './config.js';
export { isConsumed, precision, tidal, destruction, survival, orbital, nearHorizonSurvivalBonus } from './categories.js';
export { calculateThrowScore } from './score.js';
export { ScoreHistory } from './history.js';