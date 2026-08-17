// game/aiming/ — Phase 13 periapsis-linear input→launch mapping (pure layer).
export { AIM_MAPPING, aimToVelocity, aimFractions, tangFracFromDx, rpForTangFrac, tangFracForRp, dxForTangFrac, escapeDrag } from './mapping.js';
export { evaluateAim, canEscape, canOrbit } from './evaluate.js';