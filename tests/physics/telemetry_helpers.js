// tests/physics/telemetry_helpers.js — shared throw runners for telemetry tests.
// Physics layer only (objects.js is Three.js-free), so no rendering involved.
import { BlackHoleWorld, createThrowTelemetry, terminationFrom, TERMINATION } from '../../js/physics.js';
import { getObjectDef } from '../../js/objects.js';

// Run a real object throw (rock/human/ship/planet) and record telemetry until
// the sim ends or `seconds` elapse. Auto-finalizes with the physics reason when
// the object is gone, PLAYER_RESET otherwise (mimics the game loop).
export function objectThrow(objectId, vel, {
  size = 1, seconds = 30, drag = 0.1,
  origin = { x: 0, y: 19.2, z: 384 },
  horizonRadius = 40, despawnRadius = 560,
} = {}) {
  const world = new BlackHoleWorld({ mu: 12.288e6, horizonRadius, drag, despawnRadius });
  const meta = getObjectDef(objectId).build(world, origin, size);
  for (const p of world.bodies) { p.vel.x = vel.x; p.vel.y = vel.y; p.vel.z = vel.z; }
  const tm = createThrowTelemetry({ world });
  stepRecord(world, tm, seconds);
  const reason = world.aliveCount() > 0 ? TERMINATION.PLAYER_RESET
    : terminationFrom(tm.consumedPointCount, tm.initialPointCount);
  return { result: tm.finalizeThrow(reason), world, tm, meta };
}

// Single-point-mass throw for edge cases.
export function pointThrow(pos, vel, {
  seconds = 30, horizonRadius = 40, despawnRadius = 560, mu = 12.288e6,
} = {}) {
  const world = new BlackHoleWorld({ mu, horizonRadius, despawnRadius });
  const idx = world.addPoint(pos, 1, 0.5);
  world.bodies[idx].vel = { ...vel };
  const tm = createThrowTelemetry({ world });
  stepRecord(world, tm, seconds);
  const reason = world.aliveCount() > 0 ? TERMINATION.PLAYER_RESET
    : terminationFrom(tm.consumedPointCount, tm.initialPointCount);
  return { result: tm.finalizeThrow(reason), world, tm };
}

function stepRecord(world, tm, seconds) {
  const steps = Math.round(seconds / world.dt);
  for (let i = 0; i < steps; i++) {
    const events = world.step();
    for (const ev of events) {
      if (ev.type === 'tear') tm.recordTear();
      else if (ev.type === 'consume') tm.recordConsumption(world.bodies[ev.index].mass);
    }
    tm.recordStep();
    if (world.aliveCount() === 0) break;
  }
}