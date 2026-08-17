// physics/telemetry/telemetry.js — ThrowTelemetry public API.
//
// Records what ACTUALLY happened during one real throw, observed directly from
// the physics sim. Three.js-free · plain data · serializable · deterministic ·
// immutable once finalized. Complements diagnose() ("right now") and the
// trajectory layer ("what will likely happen"); never mutates the world, never
// calls the prediction system for results, and never touches rendering or UI.
//
// Lifecycle:
//   createThrowTelemetry({ world })   — capture initial COM state (call AFTER
//                                       the launch velocity is applied)
//   recordStep()                      — once per physics step
//   recordTear() / recordConsumption(mass) — from world events
//   finalizeThrow(reason)             — returns the frozen result object

import { captureInitialState, recordStep, finalizeThrow } from './record.js';

// Termination reasons supported by the current game:
//   ALL_MASS_CONSUMED  every initial point ended via a 'consume' event (fully
//                      swallowed by the horizon).
//   HORIZON            some points were consumed but the rest despawned beyond
//                      the scene radius — the object hit the horizon, partially.
//   DESPAWN            no consumption; the whole object was silently removed
//                      beyond despawnRadius (tidal slingshot / flung out).
//   PLAYER_RESET       the throw was cut short by the player (R / reset).
// ESCAPED is deliberately NOT used: the game has no gameplay "escape" boundary
// separate from despawnRadius, so inventing one would be dishonest telemetry.
export const TERMINATION = Object.freeze({
  HORIZON: 'HORIZON',
  DESPAWN: 'DESPAWN',
  ALL_MASS_CONSUMED: 'ALL_MASS_CONSUMED',
  PLAYER_RESET: 'PLAYER_RESET',
});

// Deterministic auto-reason from consumption counters (used by the game loop).
export function terminationFrom(consumedPointCount, initialPointCount) {
  if (initialPointCount > 0 && consumedPointCount >= initialPointCount) return TERMINATION.ALL_MASS_CONSUMED;
  if (consumedPointCount > 0) return TERMINATION.HORIZON;
  return TERMINATION.DESPAWN;
}

export function createThrowTelemetry({ world, nearHorizonFactor = 1.25 }) {
  const tm = {
    world,                                   // read-only reference (never mutated)
    nearHorizonRadius: world.horizonRadius * nearHorizonFactor,

    // --- lifecycle (physics simulation time, in seconds) ---
    started: 0,
    ended: 0,

    // --- initial state (COM) ---
    initialPosition: { x: 0, y: 0, z: 0 },
    initialVelocity: { x: 0, y: 0, z: 0 },
    initialSpeed: 0,
    initialDistance: 0,
    initialMass: 0,
    initialPointCount: 0,
    initialSpan: 0,

    // --- running metrics (updated in recordStep) ---
    maxSpan: 0,
    maxStretch: 1, maxStretchTime: 0,
    closestDistance: Infinity, closestTime: 0,
    closestPosition: { x: 0, y: 0, z: 0 }, closestVelocity: { x: 0, y: 0, z: 0 },
    maxVelocity: 0, maxVelocityTime: 0,
    maxTidal: 0, maxTidalTime: 0,
    timeNearHorizon: 0, minNearHorizon: Infinity,

    // --- counters (event-driven) ---
    tearCount: 0, tearTimes: [],
    consumedPointCount: 0, consumedMass: 0,

    // --- last observed live COM (for final classification) ---
    lastPosition: { x: 0, y: 0, z: 0 }, lastVelocity: { x: 0, y: 0, z: 0 },

    // --- legacy live fields consumed by the existing readout ---
    dist: 0,
    tears: 0,
    consumed: 0,
  };

  if (captureInitialState(tm, world)) {
    tm.dist = tm.initialDistance;
    tm.lastPosition = { ...tm.initialPosition };
    tm.lastVelocity = { ...tm.initialVelocity };
  }

  tm.recordStep = () => recordStep(tm);
  tm.recordTear = () => {
    tm.tearCount++;
    tm.tearTimes.push(tm.world.time);
    tm.tears = tm.tearCount;
  };
  tm.recordConsumption = (mass) => {
    tm.consumedPointCount++;
    tm.consumedMass += mass || 0;
    tm.consumed = tm.consumedPointCount;
  };
  tm.finalizeThrow = (reason) => finalizeThrow(tm, world, reason);
  return tm;
}