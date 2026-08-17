// physics/integrate.js — the numerical machinery: forces, semi-implicit Euler
// integration, spring break resolution, and the event horizon consumption pass.
// These are free functions taking the world so the sim core stays dependency-free.

import { V3 } from './vec3.js';

// Gravitational acceleration at `pos` (BH at origin): a = -mu * r / |r|^3,
// softened with eps so near-zero distance cannot blow up (a -> 0 as r -> 0,
// and r < 1e-6 is skipped entirely). Writes into `out` (no allocation).
export function gravityAcceleration(w, out, pos) {
  const r2 = V3.lengthSq(pos);
  if (r2 < 1e-6) { out.x = 0; out.y = 0; out.z = 0; return out; }
  const eps2 = w.softening * w.softening;
  const inv = 1 / (r2 + eps2);
  const mag = w.mu * inv / Math.sqrt(r2); // mu/r^3 (softened) -> a = mu*r/r^3 = mu/r^2
  out.x = -mag * pos.x;
  out.y = -mag * pos.y;
  out.z = -mag * pos.z;
  return out;
}

// Apply gravity + spring forces, integrate with semi-implicit Euler.
export function integrate(w, dt) {
  const f = w._f;
  const bodies = w.bodies;
  const n = bodies.length;

  for (let i = 0; i < n; i++) { const v = f[i]; v.x = 0; v.y = 0; v.z = 0; }

  // gravity toward origin (each mass at its OWN position -> tidal stretch)
  if (w.gravity) {
    for (let i = 0; i < n; i++) {
      const p = bodies[i];
      if (!p.alive) continue;
      gravityAcceleration(w, w._scratch, p.pos);
      f[i].x += w._scratch.x * p.mass;
      f[i].y += w._scratch.y * p.mass;
      f[i].z += w._scratch.z * p.mass;
    }
  }

  // springs
  for (const s of w.springs) {
    if (!s.alive) continue;
    const a = bodies[s.a], b = bodies[s.b];
    if (!a.alive || !b.alive) continue; // consumed this/prior substep — no force
    const dx = b.pos.x - a.pos.x, dy = b.pos.y - a.pos.y, dz = b.pos.z - a.pos.z;
    const dist = Math.sqrt(dx * dx + dy * dy + dz * dz) || 1e-6;
    const invD = 1 / dist;
    const ux = dx * invD, uy = dy * invD, uz = dz * invD;
    const extension = dist - s.rest;
    // relative velocity along the spring axis
    const vrel = (b.vel.x - a.vel.x) * ux + (b.vel.y - a.vel.y) * uy + (b.vel.z - a.vel.z) * uz;
    const fm = s.stiff * extension + s.damp * vrel; // force magnitude (a pulls toward b)
    const fx = ux * fm, fy = uy * fm, fz = uz * fm;
    f[s.a].x += fx; f[s.a].y += fy; f[s.a].z += fz;
    f[s.b].x -= fx; f[s.b].y -= fy; f[s.b].z -= fz;
  }

  // integrate
  for (let i = 0; i < n; i++) {
    const p = bodies[i];
    if (!p.alive) continue;
    p.vel.x += (f[i].x / p.mass) * dt;
    p.vel.y += (f[i].y / p.mass) * dt;
    p.vel.z += (f[i].z / p.mass) * dt;
    if (w.drag > 0) {
      const d = 1 - w.drag * dt;
      p.vel.x *= d; p.vel.y *= d; p.vel.z *= d;
    }
    p.prev.x = p.pos.x; p.prev.y = p.pos.y; p.prev.z = p.pos.z;
    p.pos.x += p.vel.x * dt;
    p.pos.y += p.vel.y * dt;
    p.pos.z += p.vel.z * dt;
  }
}

// Check springs for over-strain; kill + emit tear events.
export function resolveTears(w) {
  for (const s of w.springs) {
    if (!s.alive) continue;
    const a = w.bodies[s.a], b = w.bodies[s.b];
    if (!a.alive || !b.alive) { s.alive = false; continue; }
    const dist = V3.length(V3.sub(w._scratch, b.pos, a.pos));
    if (dist > s.rest * (1 + s.breakStrain)) {
      s.alive = false;
      // midpoint of the break = debris spawn point
      const mid = V3.make((a.pos.x + b.pos.x) / 2, (a.pos.y + b.pos.y) / 2, (a.pos.z + b.pos.z) / 2);
      w.events.push({
        type: 'tear',
        a: s.a, b: s.b,
        pos: mid,
        vel: V3.make(
          (a.vel.x + b.vel.x) / 2,
          (a.vel.y + b.vel.y) / 2,
          (a.vel.z + b.vel.z) / 2,
        ),
      });
    }
  }
}

// Remove points inside the horizon, emit consumption events.
export function resolveHorizon(w) {
  const hr = w.horizonRadius;
  for (let i = 0; i < w.bodies.length; i++) {
    const p = w.bodies[i];
    if (!p.alive) continue;
    const r2 = V3.lengthSq(p.pos);
    if (r2 <= hr * hr) {
      p.alive = false;
      w.events.push({
        type: 'consume',
        index: i,
        pos: V3.clone(p.pos),
        vel: V3.clone(p.vel),
        radius: p.radius,
      });
    } else if (r2 > w.despawnRadius * w.despawnRadius) {
      // tidal slingshot flung this fragment far outside the scene — remove it
      // silently so objects always come to a clean end.
      p.alive = false;
    }
  }
}