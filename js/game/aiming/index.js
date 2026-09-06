// game/aiming/ — Phase 13 periapsis-linear input→launch mapping (pure layer).
export { AIM_MAPPING, ESCAPE_TANGF, aimToVelocity, aimFractions, tangFracFromDx, rpForTangFrac, tangFracForRp, dxForTangFrac, escapeDrag } from './mapping.js';
export { OBJECT_SIM_PROFILES } from './simProfile.js';
export { evaluateAim, canEscape, canOrbit } from './evaluate.js';