// physics/trajectory/index.js — barrel for the trajectory-analysis layer.
// Three.js-free: operates on plain {x,y,z} pos/vel states + mu/horizonRadius.
export { TRAJECTORY, classifyTrajectory, captureVerdict, isBound } from './states.js';
export { escapeVelocityAt, velocityRelativeToEscape, orbitalInfo } from './orbital.js';
export { predictTrajectory, cloneWorld, PREDICT_DEFAULTS } from './predict.js';
export { analyzeClosestApproach, CLOSEST_DEFAULTS } from './closest.js';