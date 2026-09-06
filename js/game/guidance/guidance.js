// game/guidance/guidance.js — PURE trajectory guidance calculation.
// Consumes a launch state { mu, horizonRadius, pos, vel } (plain {x,y,z}
// vectors, no THREE) and returns a plain, deterministic, serializable result
// that the renderer + debug hooks consume. NEVER touches a live world, NEVER
// mutates its inputs, and NEVER runs on the render loop — it only re-runs when
// the launch state meaningfully changes (see launchChanged).
//
// Reuses the existing trajectory-analysis layer wholesale:
//   predictTrajectory        — the sampled path (rendered)
//   analyzeClosestApproach   — refined closest approach (informational)
//   classifyTrajectory       — ESCAPING / FLYBY / ORBITAL / CAPTURED /
//                              HORIZON_CROSSING / UNKNOWN (no new states)
//   velocityRelativeToEscape — escape context (informational)
//
// HONESTY CORRECTION (Phase 29): classifyTrajectory is the pure point-mass
// orbit equation. The REAL spring-mass sim (tidal energy losses, in-flight
// drag) swallows far more throws than that equation predicts. When the caller
// supplies options.simProfile ({ orbitFloor, escapeAt } — measured per-object
// real-sim thresholds from the aiming layer), calculateGuidance corrects the
// analytic verdict to the measured real-sim band:
//   tangentFrac <  orbitFloor  → real outcome is HORIZON_CROSSING (swallowed)
//   orbitFloor ≤  tangentFrac < escapeAt → ORBITAL (survives, bound)
//   tangentFrac ≥ escapeAt     → ESCAPING
// This removes the two dishonest claims — the green "ORBITAL" promise for drags
// that really plunge, and the "ESCAPING" claim in the analytic √2..real rim gap.
// The rendered PATH samples stay the analytic geometry (an aspirational preview);
// only the verdict (state + closest distance) that the player READ is corrected.
// The launch state here is the point-mass COM approximation; without a profile
// the classic analytic result is returned unchanged.

import {
  predictTrajectory,
  analyzeClosestApproach,
  classifyTrajectory,
  velocityRelativeToEscape,
} from '../../physics.js';

export const GUIDANCE_DEFAULTS = Object.freeze({
  // Prediction capped on every axis — a player gesture can never create an
  // unbounded simulation. Sample cap bounds the physics steps AND the path.
  duration: 10,          // s of simulated time
  dt: 1 / 240,           // matches PHYS_DT so the path tracks the real sim
  sampleInterval: 0.05,  // s between path samples (~200 points over 10 s)
  maximumSamples: 200,   // hard cap on samples/steps, same idea as trajectory
  // Closest-approach analysis window (refined by analyzeClosestApproach).
  closestDuration: 12,
});

// Throttle: is the launch velocity different enough that a recompute is worth
// it? Returns true when direction changed by more than `minAngleDeg` OR speed
// changed by more than `minSpeedFrac`. Prevents re-running a (multi-ms)
// prediction on every pointer-move pixel; polling happens, but cheaply.
export function launchChanged(prev, next, opts = {}) {
  if (!prev) return true;
  const minAngleDeg = opts.minAngleDeg ?? 1.5;
  const minSpeedFrac = opts.minSpeedFrac ?? 0.02;
  const a2 = prev.x * prev.x + prev.y * prev.y + prev.z * prev.z;
  const b2 = next.x * next.x + next.y * next.y + next.z * next.z;
  if (a2 <= 0 || b2 <= 0) return a2 !== b2;
  const lenA = Math.sqrt(a2), lenB = Math.sqrt(b2);
  const cosAngle = (prev.x * next.x + prev.y * next.y + prev.z * next.z) / (lenA * lenB);
  const speedFrac = Math.abs(lenB - lenA) / lenA;
  const angleTol = Math.cos((minAngleDeg * Math.PI) / 180);
  return cosAngle < angleTol || speedFrac > minSpeedFrac;
}

// Tangential speed as a fraction of v_circ at the launch position — the exact
// quantity the aim mapping's dx sweeps, recomputed from a launch state so the
// guidance layer never needs the mapping. h = |r × v| / |r| is the transverse
// speed; dividing by √(μ/r) gives the same unitless tangFrac the mapping emits.
export function tangentialFraction({ mu, pos, vel }) {
  const r = Math.sqrt(pos.x * pos.x + pos.y * pos.y + pos.z * pos.z);
  if (!(r > 0) || !(mu > 0)) return 0;
  const hx = pos.y * vel.z - pos.z * vel.y;
  const hy = pos.z * vel.x - pos.x * vel.z;
  const hz = pos.x * vel.y - pos.y * vel.x;
  const vT = Math.sqrt(hx * hx + hy * hy + hz * hz) / r;
  const vCirc = Math.sqrt(mu / r);
  return vCirc > 0 ? vT / vCirc : 0;
}

// calculateGuidance({ mu, horizonRadius, pos, vel }, options) → plain object:
//   {
//     state,                  classification (existing TRAJECTORY string, e.g. 'FLYBY')
//     periapsis,
//     escapeVelocity,         sqrt(2·mu/r) at the launch position
//     launchSpeed,
//     velocityRatio,          launchSpeed / escapeVelocity
//     closestApproach: { distance, time, position, velocity },
//     samples: [{ t, position:{x,y,z}, velocity:{x,y,z} }, ...],  // capped
//     count, duration, truncated, mu, horizonRadius,
//   }
// options.simProfile = { orbitFloor, escapeAt } (measured per-object real-sim
// thresholds) corrects `state` + `closestApproach.distance` to the real sim.
// Accepted on either the launch object ({ ..., simProfile }) or `options` —
// both call shapes work so game code and tests can pass it in either place.
export function calculateGuidance({ mu, horizonRadius = 40, pos, vel, simProfile: fromState }, options = {}) {
  const opts = { ...GUIDANCE_DEFAULTS, ...options };
  const simProfile = opts.simProfile ?? fromState;

  // Defensive copies of the launch state: expose in the returned object and
  // never touch the caller's vectors.
  const launch = {
    mu,
    horizonRadius,
    pos: { x: pos.x, y: pos.y, z: pos.z },
    vel: { x: vel.x, y: vel.y, z: vel.z },
  };

  const vr = velocityRelativeToEscape(launch);
  const classification = classifyTrajectory(launch);
  const path = predictTrajectory(launch, {
    duration: opts.duration,
    dt: opts.dt,
    sampleInterval: opts.sampleInterval,
    maximumSamples: opts.maximumSamples,
  });
  const closest = analyzeClosestApproach(launch, { duration: opts.closestDuration });

  let state = classification.state;
  let closestDistance = closest.minimumDistance;
  const sp = simProfile;
  if (sp && Number.isFinite(sp.orbitFloor) && Number.isFinite(sp.escapeAt)
      && sp.orbitFloor < sp.escapeAt) {
    const tf = tangentialFraction(launch);
    const analytic = state;
    if (tf < sp.orbitFloor) {
      // Real sim: swallowed. The point-mass model said ORBITAL (or a bound
      // swing) for a huge chunk of the drag range — that promise was the lie.
      if (state === 'ORBITAL' || state === 'FLYBY' || state === 'ESCAPING') {
        state = 'HORIZON_CROSSING';
      }
    } else if (tf < sp.escapeAt) {
      // Analytic escape is √2 ≈ 1.414 — BELOW the real rim 1.60. A pull that
      // only "escapes" in the point-mass model still gets swallowed/orbits.
      if (state === 'ESCAPING') state = 'ORBITAL';
    }
    if (state === 'HORIZON_CROSSING' && analytic !== 'HORIZON_CROSSING') {
      // The object is going to be swallowed; an honest "closest pass" reads
      // right at the rim (inside the near-horizon band), not at some far
      // ellipse the point-mass model mistook for a periapsis.
      const rimBand = horizonRadius * 1.5;
      closestDistance = Math.min(closestDistance, rimBand);
    }
  }

  return {
    state,
    periapsis: classification.periapsis,
    escapeVelocity: vr.escapeVelocity,
    launchSpeed: vr.speed,
    velocityRatio: vr.ratio,
    closestApproach: {
      distance: closestDistance,
      time: closest.timeAtMinimum,
      position: { x: closest.positionAtMinimum.x, y: closest.positionAtMinimum.y, z: closest.positionAtMinimum.z },
      velocity: { x: closest.velocityAtMinimum.x, y: closest.velocityAtMinimum.y, z: closest.velocityAtMinimum.z },
    },
    samples: path.samples.map((s) => ({
      t: s.t,
      position: { x: s.position.x, y: s.position.y, z: s.position.z },
      velocity: { x: s.velocity.x, y: s.velocity.y, z: s.velocity.z },
    })),
    count: path.count,
    duration: path.duration,
    truncated: path.truncated,
    mu,
    horizonRadius,
  };
}