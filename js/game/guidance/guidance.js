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
// The launch state here is the point-mass COM approximation: gravity acts per-
// mass (tidal), so a large object's true path deviates slightly from this
// prediction. That is the documented analytic-limit; the REAL throw is exactly
// what physics + telemetry + scoring always measured.

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
export function calculateGuidance({ mu, horizonRadius = 40, pos, vel }, options = {}) {
  const opts = { ...GUIDANCE_DEFAULTS, ...options };

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

  return {
    state: classification.state,
    periapsis: classification.periapsis,
    escapeVelocity: vr.escapeVelocity,
    launchSpeed: vr.speed,
    velocityRatio: vr.ratio,
    closestApproach: {
      distance: closest.minimumDistance,
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