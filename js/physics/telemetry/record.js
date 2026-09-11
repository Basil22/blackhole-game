// physics/telemetry/record.js — the per-step observation + finalize logic behind
// ThrowTelemetry. Kept separate from the public API so every module stays small.
// No allocations per step: running max/min, counters, and tiny scalar/vector
// copies only when a new extreme is found.

import { V3 } from '../vec3.js';
import { gravityAcceleration } from '../integrate.js';
import { classifyTrajectory } from '../trajectory/states.js';
import { computeSpan } from './span.js';

// Capture the throw's initial state (COM). Call AFTER launch velocity is applied.
export function captureInitialState(tm, world) {
  let alive = 0, mass = 0, cx = 0, cy = 0, cz = 0, vx = 0, vy = 0, vz = 0;
  for (const p of world.bodies) {
    if (!p.alive) continue;
    alive++;
    mass += p.mass;
    cx += p.pos.x * p.mass; cy += p.pos.y * p.mass; cz += p.pos.z * p.mass;
    vx += p.vel.x * p.mass; vy += p.vel.y * p.mass; vz += p.vel.z * p.mass;
  }
  if (alive === 0) return false;
  const pos = { x: cx / mass, y: cy / mass, z: cz / mass };
  const vel = { x: vx / mass, y: vy / mass, z: vz / mass };
  tm.initialPosition = pos;
  tm.initialVelocity = vel;
  tm.initialSpeed = V3.length(vel);
  tm.initialDistance = V3.length(pos);
  tm.initialMass = mass;
  tm.initialPointCount = alive;
  tm.initialSpan = computeSpan(world);
  return true;
}

// One O(N) pass per physics step over alive masses (COM, span, tidal spread,
// closest approach, max COM speed, horizon band). Skips work when nothing is
// alive anymore (object fully consumed at this step boundary).
export function recordStep(tm) {
  const world = tm.world;
  const bodies = world.bodies;
  let alive = 0, mass = 0;
  let cx = 0, cy = 0, cz = 0, vx = 0, vy = 0, vz = 0;
  let minR2 = Infinity, maxR2 = -Infinity;
  let minA2 = Infinity, maxA2 = -Infinity;

  for (const p of bodies) {
    if (!p.alive) continue;
    alive++;
    mass += p.mass;
    cx += p.pos.x * p.mass; cy += p.pos.y * p.mass; cz += p.pos.z * p.mass;
    vx += p.vel.x * p.mass; vy += p.vel.y * p.mass; vz += p.vel.z * p.mass;
    const r2 = p.pos.x * p.pos.x + p.pos.y * p.pos.y + p.pos.z * p.pos.z;
    if (r2 < minR2) minR2 = r2;
    if (r2 > maxR2) maxR2 = r2;
    // gravitational acceleration magnitude at THIS mass's OWN position
    gravityAcceleration(world, world._scratch, p.pos);
    const a2 = V3.lengthSq(world._scratch);
    if (a2 < minA2) minA2 = a2;
    if (a2 > maxA2) maxA2 = a2;
  }
  if (alive === 0) return; // all consumed/despawned — nothing meaningful to record

  const tNow = world.time;
  const px = cx / mass, py = cy / mass, pz = cz / mass;
  const qx = vx / mass, qy = vy / mass, qz = vz / mass;
  const comR = Math.sqrt(px * px + py * py + pz * pz);
  const comV = Math.sqrt(qx * qx + qy * qy + qz * qz);

  tm.dist = comR;
  tm.lastPosition.x = px; tm.lastPosition.y = py; tm.lastPosition.z = pz;
  tm.lastVelocity.x = qx; tm.lastVelocity.y = qy; tm.lastVelocity.z = qz;

  // stretch (radial spread, alive masses only)
  const span = maxR2 === -Infinity ? 0 : Math.sqrt(maxR2) - Math.sqrt(minR2);
  if (span > tm.maxSpan) tm.maxSpan = span;
  const ratio = tm.initialSpan > 0 ? span / tm.initialSpan : 0;
  if (ratio > tm.maxStretch) { tm.maxStretch = ratio; tm.maxStretchTime = tNow; }

  // closest approach
  if (comR < tm.closestDistance) {
    tm.closestDistance = comR;
    tm.closestTime = tNow;
    tm.closestPosition.x = px; tm.closestPosition.y = py; tm.closestPosition.z = pz;
    tm.closestVelocity.x = qx; tm.closestVelocity.y = qy; tm.closestVelocity.z = qz;
  }

  // max COM speed
  if (comV > tm.maxVelocity) { tm.maxVelocity = comV; tm.maxVelocityTime = tNow; }

  // tidal differential = spread of |accel| across alive masses
  const tidal = alive >= 2 && minA2 !== Infinity ? Math.sqrt(maxA2) - Math.sqrt(minA2) : 0;
  if (tidal > tm.maxTidal) { tm.maxTidal = tidal; tm.maxTidalTime = tNow; }

  // horizon proximity (COM inside the near-horizon band)
  if (comR <= tm.nearHorizonRadius) {
    tm.timeNearHorizon += world.dt;
    if (comR < tm.minNearHorizon) tm.minNearHorizon = comR;
  }
}

export function finalizeThrow(tm, world, reason) {
  tm.ended = world.time;

  // remaining state straight from the sim at finalize time
  let remPoints = 0, remMass = 0;
  for (const p of world.bodies) if (p.alive) { remPoints++; remMass += p.mass; }
  const despawned = Math.max(0, tm.initialPointCount - tm.consumedPointCount - remPoints);

  // Final trajectory state: actual consumption wins over the analytic verdict,
  // so an object that really crossed the horizon is never reported as FLYBY /
  // ESCAPING just because its COM had a high energy.
  const consumed = tm.consumedPointCount > 0;
  const horizonReason = reason === 'ALL_MASS_CONSUMED' || reason === 'HORIZON';
  let trajState = 'HORIZON_CROSSING';
  if (!consumed && !horizonReason) {
    trajState = classifyTrajectory({
      mu: world.mu,
      pos: tm.lastPosition,
      vel: tm.lastVelocity,
      horizonRadius: world.horizonRadius,
    }).state;
  }

  return {
    started: tm.started,
    ended: tm.ended,
    duration: tm.ended - tm.started,

    initial: {
      position: { ...tm.initialPosition },
      velocity: { ...tm.initialVelocity },
      speed: tm.initialSpeed,
      distance: tm.initialDistance,
      mass: tm.initialMass,
      pointCount: tm.initialPointCount,
      span: tm.initialSpan,
    },
    initialMass: tm.initialMass,
    initialPointCount: tm.initialPointCount,

    closestApproach: {
      distance: tm.closestDistance === Infinity ? 0 : tm.closestDistance,
      time: tm.closestTime,
      position: { ...tm.closestPosition },
      velocity: { ...tm.closestVelocity },
    },

    maximumStretch: tm.maxStretch,
    maximumStretchTime: tm.maxStretchTime,
    maximumTidalDifference: tm.maxTidal,
    maximumTidalDifferenceTime: tm.maxTidalTime,
    maximumVelocity: tm.maxVelocity,
    maximumVelocityTime: tm.maxVelocityTime,

    timeNearHorizon: tm.timeNearHorizon,
    minimumNearHorizonDistance: tm.minNearHorizon === Infinity ? 0 : tm.minNearHorizon,

    tearCount: tm.tearCount,
    tearTimes: tm.tearTimes.slice(),

    consumedPointCount: tm.consumedPointCount,
    consumedMass: tm.consumedMass,
    remainingPointCount: remPoints,
    remainingMass: remMass,
    despawnedPointCount: despawned,
    // Absorption timing: how gradually the object was consumed
    firstConsumeTime: tm.firstConsumeTime,
    lastConsumeTime: tm.lastConsumeTime,
    absorptionDuration: tm.consumedPointCount > 1
      ? tm.lastConsumeTime - tm.firstConsumeTime : 0,
    consumptionFraction: tm.initialPointCount > 0
      ? tm.consumedPointCount / tm.initialPointCount : 0,

    trajectoryState: trajState,
    terminationReason: reason,

    initialSpan: tm.initialSpan,
    maximumSpan: tm.maxSpan,
  };
}