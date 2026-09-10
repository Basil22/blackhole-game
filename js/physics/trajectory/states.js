// physics/trajectory/states.js — trajectory classification for a point-mass /
// COM state {pos, vel} around the black hole. Returns one of:
//
//   ESCAPING         unbound (eps > 0) and currently receding -> heading to
//                    infinity without another close passage ahead.
//   FLYBY            unbound (eps > 0) hyperbolic pass: infalling now, will
//                    turn at periapsis > horizon and then escape to infinity.
//   ORBITAL          bound (eps < 0) with periapsis outside the horizon ->
//                    repeatedly orbits the black hole.
//   CAPTURED         bound (eps < 0) with periapsis inside the horizon ->
//                    falls in and is gravitationally captured.
//   HORIZON_CROSSING trajectory already inside the horizon (r <= R_h), or an
//                    unbound/hears-limit incoming orbit whose periapsis lies
//                    inside the horizon -> will cross it before returning.
//   UNKNOWN          degenerate / non-finite state (origin, NaN).
//
// Criteria use position AND velocity (via specific orbital energy eps and
// specific angular momentum h), not distance alone: the same radius can be
// escaping or captured depending on speed and direction. Near the horizon the
// Newtonian numbers are heuristic — we deliberately do not claim exactness.

import { V3 } from '../vec3.js';
import { orbitalInfo, escapeVelocityAt } from './orbital.js';

export const TRAJECTORY = Object.freeze({
  ESCAPING: 'ESCAPING',
  FLYBY: 'FLYBY',
  ORBITAL: 'ORBITAL',
  CAPTURED: 'CAPTURED',
  HORIZON_CROSSING: 'HORIZON_CROSSING',
  UNKNOWN: 'UNKNOWN',
});

const TOL_DEFAULT = 1e-9;

// Classify {pos, vel} under a black hole of `mu` / `horizonRadius`.
export function classifyTrajectory({ mu, pos, vel, horizonRadius, energyTol = TOL_DEFAULT }) {
  const r = V3.length(pos);
  const vLen = V3.length(vel);
  if (!Number.isFinite(mu) || !Number.isFinite(r) || r === 0 || !Number.isFinite(vLen) ||
      !Number.isFinite(pos.x) || !Number.isFinite(pos.y) || !Number.isFinite(pos.z)) {
    return makeResult(TRAJECTORY.UNKNOWN, null, null);
  }

  const o = orbitalInfo({ mu, pos, vel });
  let state;
  if (r <= horizonRadius + 1e-12) {
    state = TRAJECTORY.HORIZON_CROSSING;                 // inside / grazing now
  } else if (o.energy > energyTol) {
    // unbound
    if (o.radialDirection === 'infalling' && o.periapsis <= horizonRadius) state = TRAJECTORY.HORIZON_CROSSING;
    else if (o.radialDirection === 'infalling') state = TRAJECTORY.FLYBY;
    else state = TRAJECTORY.ESCAPING;
  } else if (o.energy < -energyTol) {
    // bound
    state = o.periapsis <= horizonRadius ? TRAJECTORY.CAPTURED : TRAJECTORY.ORBITAL;
  } else {
    // marginal (parabolic) — treat like a grazing near-escape
    if (o.radialDirection === 'infalling' && o.periapsis <= horizonRadius) state = TRAJECTORY.HORIZON_CROSSING;
    else if (o.radialDirection === 'infalling') state = TRAJECTORY.FLYBY;
    else state = TRAJECTORY.ESCAPING;
  }
  return makeResult(state, o, { mu, horizonRadius, r });
}

// 'captured' (bound / will be swallowed) vs 'flyby' (unbound pass) vs 'unknown'.
export function captureVerdict(state) {
  switch (state) {
    case TRAJECTORY.ORBITAL:
    case TRAJECTORY.CAPTURED:
    case TRAJECTORY.HORIZON_CROSSING:
      return 'captured';
    case TRAJECTORY.ESCAPING:
    case TRAJECTORY.FLYBY:
      return 'flyby';
    default:
      return 'unknown';
  }
}

export function isBound(state) {
  return state === TRAJECTORY.ORBITAL || state === TRAJECTORY.CAPTURED || state === TRAJECTORY.HORIZON_CROSSING;
}

function makeResult(state, o, ctx) {
  const r = ctx ? ctx.r : NaN;
  return {
    state,
    bound: o ? o.bound : false,
    energy: o ? o.energy : NaN,
    angularMomentum: o ? o.angularMomentum : NaN,
    escapeVelocity: ctx ? escapeVelocityAt(ctx.mu, r) : NaN,
    periapsis: o ? o.periapsis : NaN,
    apoapsis: o ? o.apoapsis : NaN,
    eccentricity: o ? o.eccentricity : NaN,
    radialDirection: o ? o.radialDirection : 'unknown',
    r,
    insideHorizon: r <= (ctx ? ctx.horizonRadius : 0),
  };
}