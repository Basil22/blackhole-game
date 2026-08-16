// game/trajectory.js — orbital injection velocity for throws.
// Mostly tangential so the object arcs around the hole, plus a small
// radial-inward component so periapsis drops inside the horizon and the
// object is captured (swings in, then plunges). The aim drag nudges tangential
// vs radial within a band that always captures.

export function launchVelocity(world, spawnPos, aim) {
  const R = spawnPos.length();
  const vCirc = Math.sqrt(world.mu / R);
  const radial = spawnPos.clone().normalize();
  const up = new THREE.Vector3(0, 1, 0);
  const tang = new THREE.Vector3().crossVectors(up, radial).normalize();
  if (tang.lengthSq() < 0.01) tang.set(1, 0, 0);
  const tangFrac = Math.max(0.35, Math.min(0.43, 0.40 + aim.dx * 0.0004));
  const radFrac = Math.max(0.05, Math.min(0.30, 0.12 + aim.dy * 0.0004));
  const vel = new THREE.Vector3()
    .addScaledVector(tang, vCirc * tangFrac)
    .addScaledVector(radial, -vCirc * radFrac);
  vel.y += 3.2;
  return vel;
}