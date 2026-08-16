// physics.js — public re-export barrel for the pure physics engine.
// Split into js/physics/: vec3.js, masses.js, world.js, integrate.js, shapes.js
export { V3 } from './physics/vec3.js';
export { PointMass, Spring } from './physics/masses.js';
export { BlackHoleWorld } from './physics/world.js';
export { integrate, resolveTears, resolveHorizon } from './physics/integrate.js';
export { buildChain, buildStar } from './physics/shapes.js';