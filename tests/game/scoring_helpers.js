// tests/game/scoring_helpers.js — build finalized ThrowTelemetry-shaped objects
// for the scoring engine (the engine reads only plain data, so a well-formed
// replica is a faithful stand-in for a real finalize output).

// Defaults model a survived, decent close pass. Individual tests override
// exactly the fields they care about.
export function makeTelemetry(overrides = {}) {
  const t = {
    started: 0,
    ended: 6.5,
    duration: 6.5,

    initial: {
      position: { x: 0, y: 19.2, z: 384 },
      velocity: { x: 0, y: 0, z: -140 },
      speed: 140,
      distance: 384.5,
      mass: 12,
      pointCount: 12,
      span: 4.5,
    },
    initialSpeed: 140,
    initialDistance: 384.5,
    initialMass: 12,
    initialPointCount: 12,

    closestApproach: {
      distance: 46,
      time: 3.1,
      position: { x: 0, y: 1, z: -46 },
      velocity: { x: 0, y: -10, z: 0 },
    },

    maximumStretch: 1.5,
    maximumStretchTime: 3.2,
    maximumTidalDifference: 1200,
    maximumTidalDifferenceTime: 3.2,
    maximumVelocity: 260,
    maximumVelocityTime: 3.1,

    timeNearHorizon: 0.25,
    minimumNearHorizonDistance: 46,

    tearCount: 3,
    tearTimes: [3.05, 3.12, 3.18],

    consumedPointCount: 0,
    consumedMass: 0,
    remainingPointCount: 12,
    remainingMass: 12,
    despawnedPointCount: 0,

    trajectoryState: 'ESCAPING',
    terminationReason: 'DESPAWN',

    initialSpan: 4.5,
    maximumSpan: 6.75,
  };
  return { ...t, ...overrides };
}