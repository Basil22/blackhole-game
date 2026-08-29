// audit11b.mjs — empirical check of a REAL orbital throw under spaghettification
// physics (spring-mass, gravity per mass, orbital drag decay). Proves:
//   1. a tangential ~vCirc launch actually orbits (stays bound, near R)
//   2. drag slowly decays it but a RESET mid-orbit is unconsumed
//   3. PLAYER_RESET finalize reports trajectoryState = ORBITAL
import { BlackHoleWorld, V3, createThrowTelemetry, TERMINATION } from './js/physics.js';
import { CATALOG } from './js/objects.js';

const MU = 12.288e6;
const H = 40;
const SPAWN = V3.make(0, 19.2, 384);
const R = V3.length(SPAWN);
const vCirc = Math.sqrt(MU / R);

function newWorld(size, def) {
  const drag = (0.1 + 0.04 * (size - 1)) / 1.6;
  const world = new BlackHoleWorld({ mu: MU, horizonRadius: H, drag, despawnRadius: 560 });
  const origin = V3.make(SPAWN.x, SPAWN.y, SPAWN.z);
  const meta = def.build(world, origin, size);
  return { world, meta };
}

const radial = V3.make(SPAWN.x / R, SPAWN.y / R, SPAWN.z / R);
const up = V3.make(0, 1, 0);
const tang = V3.normalize(V3.make(), V3.cross(V3.make(), up, radial));

for (const [name, size] of [['ship', 1], ['planet', 1]]) {
  const def = CATALOG.find((o) => o.id === name);
  const { world, meta } = newWorld(size, def);
  const vel = {
    x: tang.x * vCirc,
    y: tang.y * vCirc + 3.2,
    z: tang.z * vCirc,
  };
  for (const p of world.bodies) { p.vel.x = vel.x; p.vel.y = vel.y; p.vel.z = vel.z; }
  const tm = createThrowTelemetry({ world });

  let consumed = false, despawned = false, t = 0;
  let minR = 1e9, seenOrbit = false;
  while (t < 40) {
    world.step();
    t += world.dt;
    tm.recordStep();
    if (tm.consumedPointCount > 0) { consumed = true; break; }
    const com = world.centerOfMass();
    const cR = V3.length(com);
    if (cR < minR) minR = cR;
    if (world.aliveCount() === 0) { despawned = true; break; }
  }
  console.log(`\n${name} real orbit sim (24 sim-s = ${Math.round(t)}): consumed=${consumed} despawned=${despawned} minR=${minR.toFixed(1)} alive=${world.aliveCount()} elapsed=${t.toFixed(2)}s`);

  // reset mid-orbit (unconsumed) — the natural way orbit-01 completes
  const fin = tm.finalizeThrow(TERMINATION.PLAYER_RESET);
  console.log(`  RESET finalize → trajectoryState=${fin.trajectoryState} consumed=${fin.consumedPointCount} closest=${fin.closestApproach.distance.toFixed(1)}`);
  console.log(`  initial: speed=${fin.initial.speed.toFixed(1)} (${(fin.initial.speed / vCirc).toFixed(3)} vCirc) dist=${fin.initial.distance.toFixed(1)}`);

  // now verify guidance agrees ORBITAL at launch
  const { calculateGuidance } = await import('./js/game/guidance/index.js');
  const g = calculateGuidance({ mu: MU, horizonRadius: H, pos: { x: SPAWN.x, y: SPAWN.y, z: SPAWN.z }, vel });
  console.log(`  guidance at launch: state=${g.state} periapsis=${g.periapsis.toFixed(1)}`);
}