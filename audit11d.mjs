// audit11d.mjs — validate the NEW proposed mapping against the REAL sim:
//   1. verify13's dx=40/dy=130 throw must still complete near-horizon (≤60)
//   2. full-power drag must reach ESCAPING AND actually despawn as ESCAPING
//   3. orbit band (tangFrac≈1.0, radFrac≈0) stays ORBITAL on a fresh reset
//   4. monotonic speed, bounded extremes, deterministic
import { BlackHoleWorld, V3, createThrowTelemetry, TERMINATION } from './js/physics.js';
import { CATALOG } from './js/objects.js';
import { calculateGuidance } from './js/game/guidance/index.js';

const MU = 12.288e6, H = 40;
const SPAWN = V3.make(0, 19.2, 384);
const R = V3.length(SPAWN);
const vCirc = Math.sqrt(MU / R);
const radUnit = V3.normalize(V3.make(), SPAWN);
const tangUnit = V3.normalize(V3.make(), V3.cross(V3.make(), V3.make(0, 1, 0), radUnit));

// ---- proposed mapping (mirror of the module to build) ----
const TANG_MIN = 0.35, TANG_MAX = 1.62, TANG_GAIN = (1.62 - 0.35) / 340;
const RAD_MIN = -0.06, RAD_MAX = 0.42, RAD_BASE = 0.02, RAD_GAIN = 0.00087;
const tangFrac = (dx) => Math.max(TANG_MIN, Math.min(TANG_MAX, 0.35 + dx * TANG_GAIN));
const radFrac = (dy) => Math.max(RAD_MIN, Math.min(RAD_MAX, RAD_BASE + dy * RAD_GAIN));
function aimVel(dx, dy) {
  const tf = tangFrac(dx), rf = radFrac(dy);
  const v = {
    x: tangUnit.x * vCirc * tf - radUnit.x * vCirc * rf,
    y: tangUnit.y * vCirc * tf - radUnit.y * vCirc * rf + 3.2,
    z: tangUnit.z * vCirc * tf - radUnit.z * vCirc * rf,
  };
  return { v, tf, rf, speed: V3.length(v) };
}

console.log('SPEED probes (vCirc=' + vCirc.toFixed(1) + '):');
for (const [dx, dy, label] of [[0, 0, 'center'], [40, 130, 'verify13 throw'], [170, 0, 'half-width'], [340, 0, 'full-width'], [400, 0, 'beyond clamp'], [-200, -200, 'up-left']]) {
  const { v, tf, rf, speed } = aimVel(dx, dy);
  const g = calculateGuidance({ mu: MU, horizonRadius: H, pos: { x: SPAWN.x, y: SPAWN.y, z: SPAWN.z }, vel: v });
  console.log(`  dx=+${dx} dy=+${dy} (${label}): v=${speed.toFixed(1)} (${(speed / vCirc).toFixed(2)} vCirc) tf=${tf.toFixed(2)} rf=${rf.toFixed(2)} → guidance=${g.state} periapsis=${g.periapsis.toFixed(1)}`);
}

async function realThrow(dx, dy, id = 'rock', size = 1, maxT = 40) {
  const def = CATALOG.find((o) => o.id === id);
  const drag = (0.1 + 0.04 * (size - 1)) / 1.6;
  const world = new BlackHoleWorld({ mu: MU, horizonRadius: H, drag, despawnRadius: 560 });
  def.build(world, V3.clone(SPAWN), size);
  const { v } = aimVel(dx, dy);
  for (const p of world.bodies) { p.vel.x = v.x; p.vel.y = v.y; p.vel.z = v.z; }
  const tm = createThrowTelemetry({ world });
  let term = null, step = 0;
  const t0 = world.time;
  while (world.time - t0 < maxT) {
    world.step(); tm.recordStep(); step++;
    if (tm.consumedPointCount >= tm.initialPointCount) { term = 'CONSUMED'; break; }
    const com = world.centerOfMass();
    if ((tm.consumedPointCount === 0) && world.aliveCount() === 0) { term = 'DESPAWN'; break; }
  }
  if (!term) term = 'TERM_TIMEOUT';
  return { term, step, tm, world };
}

console.log('\nREAL THROWS:');
for (const [dx, dy, id, label] of [[40, 130, 'human', 'verify13 near-horizon'], [340, 0, 'rock', 'full escape'], [170, 0, 'ship', 'orbit band']]) {
  const r = await realThrow(dx, dy, id);
  const fin = r.tm.finalizeThrow(r.term === 'CONSUMED' ? TERMINATION.ALL_MASS_CONSUMED : TERMINATION.DESPAWN);
  console.log(`  ${label} (dx=${dx},dy=${dy},${id}): term=${r.term} steps=${r.step} trajState=${fin.trajectoryState} closest=${fin.closestApproach.distance.toFixed(1)} consumed=${fin.consumedPointCount}/${fin.initialPointCount}`);
}