// physics/telemetry/span.js — object spatial-span for tidal-stretch measurement.
// The canonical span used by the live readout (previously defined in
// game/spawn.js): the radial spread of a sim's point masses around the black
// hole (BH at origin). As an object is tidally stretched along its fall, the
// inner edge moves inward (min r shrinks) while the outer edge recedes (max r
// grows), so max-min r is a robust stretch metric that works for astronaut,
// ship, planet and asteroid alike.
//
// Only ALIVE masses count: consumed / despawned corpses must not keep inflating
// the span after the object is gone.

export function computeSpan(world) {
  let minR2 = Infinity;
  let maxR2 = -Infinity;
  for (const p of world.bodies) {
    if (!p.alive) continue;
    const r2 = p.pos.x * p.pos.x + p.pos.y * p.pos.y + p.pos.z * p.pos.z;
    if (r2 < minR2) minR2 = r2;
    if (r2 > maxR2) maxR2 = r2;
  }
  if (maxR2 === -Infinity) return 0;
  return Math.sqrt(maxR2) - Math.sqrt(minR2);
}