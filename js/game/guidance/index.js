// game/guidance/index.js — barrel for trajectory guidance.
//   Pure layer (guidance.js): Three.js-free prediction summary, reuses the
//   trajectory-analysis API. Rendering layer (path.js): one reused THREE.Line.
export { calculateGuidance, launchChanged, tangentialFraction, GUIDANCE_DEFAULTS } from './guidance.js';
export { TrajectoryPath } from './path.js';