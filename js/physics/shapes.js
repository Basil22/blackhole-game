// physics/shapes.js — point/spring network templates: chains and star clusters.

import { V3 } from './vec3.js';

// Generic linear chain of points. Used for rocks, humans, debris.
// start and end are 3-vectors; n is number of points.
export function buildChain(world, start, end, n, opts = {}) {
  const stiffness = opts.stiffness ?? 800;
  const damping = opts.damping ?? 8;
  const breakStrain = opts.breakStrain ?? 0.25;
  const mass = opts.mass ?? 1;
  const radius = opts.radius ?? 0.6;
  const color = opts.color ?? 0xcccccc;
  const indices = [];
  for (let i = 0; i < n; i++) {
    const t = n === 1 ? 0 : i / (n - 1);
    const pos = V3.lerp(V3.make(), start, end, t);
    // optional perpendicular jitter for organic lumpiness
    if (opts.jitter && i > 0 && i < n - 1) {
      const j = opts.jitter;
      pos.x += (Math.random() * 2 - 1) * j;
      pos.y += (Math.random() * 2 - 1) * j;
      pos.z += (Math.random() * 2 - 1) * j;
    }
    indices.push(world.addPoint(pos, mass, radius));
  }
  for (let i = 0; i < n - 1; i++) {
    world.addSpring(indices[i], indices[i + 1], stiffness, damping, breakStrain, color);
  }
  return indices;
}

export function buildStar(world, pos, opts = {}) {
  const n = opts.points ?? 30;
  const radius = opts.radius ?? 8;
  const stiffness = opts.stiffness ?? 60;
  const damping = opts.damping ?? 4;
  const breakStrain = opts.breakStrain ?? 0.08;
  // shell springs may use a different (higher) break strain so the surface
  // holds together as a solid while radial spokes tear first.
  const shellBreakStrain = opts.shellBreakStrain ?? breakStrain;
  // brace = triangulated shell (2nd-neighbor chords): stops the star from
  // collapsing into an arc/point cloud the instant spokes snap.
  const brace = opts.brace ?? false;
  const color = opts.color ?? 0xffcc88;
  const mass = opts.mass ?? 1;
  const center = world.addPoint(pos, mass * 1.5, 0.2);
  const indices = [center];
  for (let i = 0; i < n; i++) {
    // random point on a sphere
    const theta = Math.random() * Math.PI * 2;
    const phi = Math.acos(Math.random() * 2 - 1);
    const p = V3.make(
      pos.x + radius * Math.sin(phi) * Math.cos(theta),
      pos.y + radius * Math.cos(phi),
      pos.z + radius * Math.sin(phi) * Math.sin(theta),
    );
    indices.push(world.addPoint(p, mass, 0.5));
  }
  // cohesive shell: connect each surface point to center + neighbors.
  // rest lengths come from the actual geometry so big clusters (size > BH)
  // scale correctly instead of exploding on the hardcoded neighbor rest.
  // NOTE: indices[0] = center, indices[1..n] = surface points. We must use
  // absolute body indices (indices[k]), not raw loop counters, so springs
  // connect to the correct bodies even when the world already has bodies.
  for (let i = 1; i <= n; i++) {
    world.addSpringLen(indices[0], indices[i], radius, stiffness, damping, breakStrain, color);
  }
  for (let i = 1; i <= n; i++) {
    const j = i === n ? 1 : i + 1;
    world.addSpring(indices[i], indices[j], stiffness * 0.8, damping, shellBreakStrain, color);
  }
  if (brace) {
    for (let i = 1; i <= n; i++) {
      const j = ((i + 1) % n) + 1;
      world.addSpring(indices[i], indices[j], stiffness * 0.6, damping, shellBreakStrain, color);
    }
  }
  return indices;
}