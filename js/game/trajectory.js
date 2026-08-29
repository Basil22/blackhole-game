// game/trajectory.js — orbital injection velocity for throws.
// Mostly tangential so the object arcs around the hole, plus a small
// radial-inward component so periapsis drops inside the horizon and the
// object is captured (swings in, then plunges). The aim drag nudges tangential
// vs radial within a band that always captures.
//
// Phase 11: the mapping now lives in the pure js/game/aiming layer and spans
// the full band up to ~1.62·vCirc so ESCAPING (≥1.41·vCirc) and ORBITAL
// (~1.0·vCirc) are reachable through deliberate drag. This function remains the
// SINGLE source of truth for BOTH the guidance prediction and the real launch,
// so the predicted initial state always equals the real throw's initial state.
// Physics/classification/telemetry are untouched.

import { aimToVelocity } from './aiming/index.js';

export function launchVelocity(world, spawnPos, aim) {
  const m = aimToVelocity({
    mu: world.mu,
    pos: { x: spawnPos.x, y: spawnPos.y, z: spawnPos.z },
    dx: aim.dx,
    dy: aim.dy,
  });
  return new THREE.Vector3(m.x, m.y, m.z);
}