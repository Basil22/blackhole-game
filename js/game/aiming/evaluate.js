// game/aiming/evaluate.js — PURE helpers that map an aim drag to the guidance
// verdict without touching a live world. Composes the established guidance /
// trajectory layers (calculateGuidance, classify, velocityRelativeToEscape)
// with the rebalanced mapping so tests and the GuideHud can ask "what state
// does this drag predict?" deterministically. Never runs physics, never mutates
// inputs, is three.js-free.

import { calculateGuidance } from '../guidance/index.js';
import { aimToVelocity } from './mapping.js';

// Classify what a drag from `pos` would do: returns the full guidance result
// (+ mapping diagnostics) for the plain launch state. pos/vel are {x,y,z}.
export function evaluateAim({ mu, horizonRadius = 40, pos, dx, dy }) {
  const mapped = aimToVelocity({ mu, pos, dx, dy });
  const guidance = calculateGuidance({
    mu,
    horizonRadius,
    pos: { x: pos.x, y: pos.y, z: pos.z },
    vel: { x: mapped.x, y: mapped.y, z: mapped.z },
  });
  return {
    ...guidance,
    launchSpeed: mapped.speed,
    tangFrac: mapped.tangFrac,
    radFrac: mapped.radFrac,
    power01: mapped.power01,
  };
}

// True when a drag of this tangential power can possibly reach ESCAPING from
// `pos` — i.e. the mapping (not just energy) permits escape today.
export function canEscape({ mu, pos, dx, dy }) {
  return evaluateAim({ mu, pos, dx, dy }).state === 'ESCAPING';
}

// True when a drag lands in the ORBITAL band (bound, periapsis above horizon).
export function canOrbit({ mu, pos, dx, dy }) {
  return evaluateAim({ mu, pos, dx, dy }).state === 'ORBITAL';
}