// physics/diagnostics.js — read-only inspection of a world's current state.
// Developer-facing (not wired to the UI); will later back scoring/gameplay.
// NO three.js / DOM dependency.

import { V3 } from './vec3.js';
import { gravityAcceleration } from './integrate.js';

export function diagnose(world) {
  const bodies = world.bodies;
  let aliveCount = 0;
  let aliveMass = 0;
  let totalMass = 0;
  let maxVelSq = 0;
  let maxVelIndex = -1;
  let minDist = Infinity;
  let minDistIndex = -1;
  let maxAccel = -Infinity;
  let minAccel = Infinity;

  for (let i = 0; i < bodies.length; i++) {
    const p = bodies[i];
    totalMass += p.mass;
    if (!p.alive) continue;
    aliveCount++;
    aliveMass += p.mass;
    const v2 = V3.lengthSq(p.vel);
    if (v2 > maxVelSq) { maxVelSq = v2; maxVelIndex = i; }
    const r2 = V3.lengthSq(p.pos);
    if (r2 < minDist) { minDist = r2; minDistIndex = i; }
    // gravitational acceleration magnitude at this mass's OWN position
    gravityAcceleration(world, world._scratch, p.pos);
    const a = V3.length(world._scratch);
    if (a > maxAccel) maxAccel = a;
    if (a < minAccel) minAccel = a;
  }

  // spring extension / strain over alive springs
  let maxSpringExtension = 0;
  let maxStrain = 0;
  for (const s of world.springs) {
    if (!s.alive) continue;
    const a = bodies[s.a], b = bodies[s.b];
    if (!a.alive || !b.alive) continue;
    const dist = V3.length(V3.sub(world._scratch, b.pos, a.pos));
    const ext = dist - s.rest;
    if (ext > maxSpringExtension) maxSpringExtension = ext;
    if (s.rest > 0 && ext / s.rest > maxStrain) maxStrain = ext / s.rest;
  }

  const com = world.centerOfMass();

  return {
    simTime: world.time,
    aliveCount,
    aliveMass,
    totalMass,
    springCount: world.springs.filter((s) => s.alive).length,
    com: { x: com.x, y: com.y, z: com.z },
    maxSpringExtension,
    maxStrain,
    maxVelocity: Math.sqrt(maxVelSq),
    maxVelocityIndex: maxVelIndex,
    minDistToBH: Math.sqrt(minDist),
    minDistIndex: minDistIndex,
    // tidal differential = spread of gravitational acceleration across masses
    maxTidalAccelDiff: aliveCount > 0 ? maxAccel - minAccel : 0,
  };
}