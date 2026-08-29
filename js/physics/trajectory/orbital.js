// physics/trajectory/orbital.js — two-body orbital quantities for the Newtonian
// approximation. All functions operate on plain {x,y,z} vectors and numbers —
// no THREE, no DOM. "Body" here always means the caller-supplied center of mass
// state {pos, vel}; for spring-mass objects the game passes the mass-weighted
// COM and COM velocity (mass-weighted average of per-point velocities). That is
// an approximation: gravity acts at each point individually (see tidal
// analysis), so a large object's COM does not follow the perfect point-mass
// path. Documented in README / PLAN.

import { V3 } from '../vec3.js';

// v_escape = sqrt(2 * mu / r) for the current Newtonian model.
export function escapeVelocityAt(mu, r) {
  return Math.sqrt((2 * mu) / Math.max(r, 1e-12));
}

// Compare current speed against local escape velocity.
// verdict: 'below' | 'at' | 'above'. Diagnostic only — never mutates velocity.
// relTol is the half-width of the 'at' band as a fraction of v_escape.
export function velocityRelativeToEscape({ mu, pos, vel, relTol = 1e-9 }) {
  const speed = V3.length(vel);
  const r = V3.length(pos);
  const vEsc = escapeVelocityAt(mu, r);
  const ratio = speed / vEsc;
  const tu = Math.abs(ratio - 1) <= relTol;
  const verdict = Number.isFinite(ratio) && tu ? 'at' : ratio > 1 ? 'above' : 'below';
  return { escapeVelocity: vEsc, speed, ratio, verdict };
}

// Orbital elements of a point-mass two-body state.
//
//   energy            specific orbital energy     eps = v^2/2 - mu/r   (J/kg)
//   angularMomentum   specific angular momentum   h = |r x v|          (m^2/s)
//   eccentricity      e = sqrt(1 + 2*eps*h^2/mu^2)
//   periapsis         closest approach distance (0 for radial infall)
//   apoapsis          farthest reachable distance (Infinity when unbound)
//   radialDirection   sign of r . v (infalling | outgoing | stationary)
//
// Degenerate radial motion (h ~ 0): periapsis collapses to the singularity —
// under the pure Newtonian approximation it would cross the origin (and any
// event horizon). This is exactly the "don't pretend it's exact near the
// horizon" limitation; real GR differs.
export function orbitalInfo({ mu, pos, vel }) {
  const r = V3.length(pos);
  const v2 = V3.lengthSq(vel);
  const epsilon = 0.5 * v2 - mu / Math.max(r, 1e-12);
  const h = V3.length(V3.cross(V3.make(), pos, vel));
  const speed = Math.sqrt(v2);
  const escapeV = escapeVelocityAt(mu, r);
  const radialSpeed = V3.dot(pos, vel) / Math.max(r, 1e-12);
  const radialDirection = Math.abs(radialSpeed) < 1e-9 ? 'stationary'
    : radialSpeed < 0 ? 'infalling' : 'outgoing';

  const mu2 = mu * mu;
  const eIn = 1 + (2 * epsilon * h * h) / mu2;
  const eccentricity = h < 1e-12 ? 0 : Math.sqrt(Math.max(0, eIn));
  const semiMajorAxis = Math.abs(epsilon) < 1e-18 ? Infinity : -mu / (2 * epsilon);
  const semiLatusRectum = (h * h) / mu;

  let periapsis, apoapsis;
  if (h < 1e-12) {
    // radial motion: bound paths fall to the centre; unbound paths escape only
    // if currently receding — an unbound infall still plunges through r=0.
    if (epsilon < 0) {
      periapsis = 0;
      apoapsis = semiMajorAxis;
    } else if (radialDirection === 'outgoing') {
      periapsis = Infinity;
      apoapsis = Infinity;
    } else {
      periapsis = 0;
      apoapsis = Infinity;
    }
  } else if (eccentricity < 1) {
    periapsis = semiLatusRectum / (1 + eccentricity);
    apoapsis = semiLatusRectum / (1 - eccentricity);
  } else {
    periapsis = semiLatusRectum / (1 + eccentricity);
    apoapsis = Infinity;
  }

  return {
    energy: epsilon,
    angularMomentum: h,
    escapeVelocity: escapeV,
    speed,
    eccentricity,
    semiMajorAxis,
    semiLatusRectum,
    periapsis,
    apoapsis,
    radialSpeed,
    radialDirection,
    bound: epsilon < 0,
  };
}