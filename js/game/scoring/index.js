// game/scoring/index.js — barrel for the throw-scoring engine (V2 uncapped).
//
//   ThrowTelemetry
//        |
//   calculateThrowScore(telemetry)
//        |
//   ThrowScore  (pure, serializable, uncapped, deterministic)
//
// Three.js-free / DOM-free / physics-free: it only reads the finalized
// telemetry you hand it. Tuning lives entirely in SCORING_CONFIG.
export { SCORING_CONFIG, normalize01, safeDistance, safeNum } from './config.js';
export { isConsumed, stretch, precision, absorption, destruction, survivalMultiplier } from './categories.js';
export { calculateThrowScore } from './score.js';
export { ScoreHistory } from './history.js';
