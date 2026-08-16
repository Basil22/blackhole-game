// game/spawn.js — builds a throwable sim: an object's own world + visualizer +
// telemetry. Each throw gets its OWN world so multiple objects can fly at once.

import { BlackHoleWorld, V3 } from '../physics.js';
import { ObjectVisualizer } from '../render/objects.js';

export function colorFor(kind) {
  switch (kind) {
    case 'rock': return 0xffa040;
    case 'human': return 0xffd0c0;
    case 'ship': return 0x80c0ff;
    case 'planet': return 0xffff80;
    default: return 0xffffff;
  }
}

export function computeSpan(world) {
  let min = Infinity, max = -Infinity;
  for (const p of world.bodies) {
    const r = Math.hypot(p.pos.x, p.pos.y, p.pos.z);
    if (r < min) min = r;
    if (r > max) max = r;
  }
  return max - min;
}

// Spawns the object held at `spawnPos` (dragged by aim). Returns
// { world, visualizer, meta, kind, color, telemetry }.
export function buildHeld({ def, size, spawnPos, horizonRadius, scene, timeScale = 1 }) {
  // drag = orbital decay: every object and torn fragment eventually spirals
  // into the horizon instead of orbiting forever.
  // drag scales with size: orbital decay clears debris fast for giant objects
  // (bigger than the BH) without flattening the normal-size orbital swing.
  // Divided by the scene scale (k = 1.6) so per-orbit decay matches the
  // small-hole tuning even though orbits now take 1.6× longer.
  const drag = (0.1 + 0.04 * (size - 1)) / 1.6;
  const world = new BlackHoleWorld({
    mu: 12.288e6,
    horizonRadius,
    drag,
    despawnRadius: 560, // catches tidal-slingshot debris outside the scene
  });
  const origin = V3.make(spawnPos.x, spawnPos.y, spawnPos.z);
  const meta = def.build(world, origin, size);
  const visualizer = new ObjectVisualizer(scene);
  visualizer.build(world, meta);
  return {
    world,
    visualizer,
    meta,
    kind: def.id,
    color: colorFor(def.id),
    telemetry: {
      initialSpan: computeSpan(world),
      maxSpan: 0,
      tears: 0,
      consumed: 0,
      dist: spawnPos.length(),
      timeScale,
    },
  };
}