// audit11c.mjs — when does a real orbital throw still classifly ORBITAL?
// Reset timing scan: after t sim-seconds, stop and ask what trajectoryState
// the telemetry would finalize as (must be ORBITAL to complete orbit-01).
import { BlackHoleWorld, V3, createThrowTelemetry, TERMINATION } from './js/physics.js';
import { CATALOG } from './js/objects.js';
import { calculateGuidance } from './js/game/guidance/index.js';

const MU = 12.288e6, H = 40;
const SPAWN = V3.make(0, 19.2, 384);
const R = V3.length(SPAWN);
const vCirc = Math.sqrt(MU / R);
const radUnit = V3.normalize(V3.make(), SPAWN);
const tangUnit = V3.normalize(V3.make(), V3.cross(V3.make(), V3.make(0, 1, 0), radUnit));
const def = CATALOG.find((o) => o.id === 'ship');

function launch(k) {
  const drag = (0.1 + 0.04 * (1 - 1)) / 1.6;
  const world = new BlackHoleWorld({ mu: MU, horizonRadius: H, drag, despawnRadius: 560 });
  def.build(world, V3.clone(SPAWN), 1);
  const vel = {
    x: tangUnit.x * vCirc * k + 3.2 * 0,
    y: tangUnit.y * vCirc * k + 3.2,
    z: tangUnit.z * vCirc * k,
  };
  for (const p of world.bodies) { p.vel.x = vel.x; p.vel.y = vel.y; p.vel.z = vel.z; }
  const tm = createThrowTelemetry({ world });
  return { world, tm, vel };
}

for (const k of [1.0, 1.05]) {
  console.log(`\n=== tangential k=${k} vCirc (speed ${(vCirc * k).toFixed(1)}) ===`);
  for (let stopAt of [3, 6, 9, 12, 15]) {
    const { world, tm, vel } = launch(k);
    const t0 = world.time;
    let consumed = false, gone = false;
    while (world.time - t0 < stopAt) {
      world.step(); tm.recordStep();
      if (tm.consumedPointCount > 0) { consumed = true; break; }
      if (world.aliveCount() === 0) { gone = true; break; }
    }
    if (consumed || gone) { console.log(`  t=${stopAt}: consumed=${consumed} allGone=${gone}`); continue; }
    const com = world.centerOfMass();
    const fin = tm.finalizeThrow(TERMINATION.PLAYER_RESET);
    const g = calculateGuidance({ mu: MU, horizonRadius: H, pos: { x: com.x, y: com.y, z: com.z }, vel: { x: fin.closestApproach.velocity.x || vel.x, y: 0, z: 0 } });
    console.log(`  reset@${stopAt}s: trajState=${fin.trajectoryState} comR=${V3.length(com).toFixed(1)} lastSpeed=${fin.initial.speed.toFixed(1)} closest=${fin.closestApproach.distance.toFixed(1)}`);
  }
}