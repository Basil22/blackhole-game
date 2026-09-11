// physics/integrate.js — the numerical machinery: forces, semi-implicit Euler
// integration, spring break resolution, and the event horizon consumption pass.
// These are free functions taking the world so the sim core stays dependency-free.

import { V3 } from './vec3.js';

// Gravitational acceleration at `pos` (BH at origin): a = -mu * r / |r|^3,
// softened with Plummer softening so near-zero distance cannot blow up
// (a -> 0 as r -> 0, and r < 1e-6 is skipped entirely).
// Plummer: a = -mu * r / (r^2 + eps^2)^(3/2). Writes into `out` (no alloc).
export function gravityAcceleration(w, out, pos) {
  const r2 = V3.lengthSq(pos);
  if (r2 < 1e-6) { out.x = 0; out.y = 0; out.z = 0; return out; }
  const eps2 = w.softening * w.softening;
  const denom = r2 + eps2;
  const mag = w.mu / (denom * Math.sqrt(denom)); // mu / (r^2+eps^2)^(3/2)
  out.x = -mag * pos.x;
  out.y = -mag * pos.y;
  out.z = -mag * pos.z;
  return out;
}

// Proximity factor: 0 at 4×hr, 1 at hr. Used to scale tidal effects by distance.
function proximityFactor(r, hr) {
  if (r <= hr) return 1;
  if (r >= hr * 4) return 0;
  return 1 - (r - hr) / (hr * 3);
}

// Apply gravity + lateral compression + proximity-softened springs, integrate.
export function integrate(w, dt) {
  const f = w._f;
  const bodies = w.bodies;
  const n = bodies.length;
  const hr = w.horizonRadius;
  const lc = w.lateralCompression;

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

      // Lateral compression: squeeze the point toward the radial axis (the
      // line from the BH center through the COM). This mimics the convergence
      // of geodesics near the hole — real tidal forces compress laterally while
      // stretching radially. The squeeze grows with proximity so it only kicks
      // in close to the hole, keeping distant flight unaffected.
      if (lc > 0) {
        const r2 = p.pos.x * p.pos.x + p.pos.y * p.pos.y + p.pos.z * p.pos.z;
        if (r2 > 1e-6) {
          const r = Math.sqrt(r2);
          const prox = proximityFactor(r, hr);
          if (prox > 0) {
            // radial unit vector
            const ir = 1 / r;
            const rx = p.pos.x * ir, ry = p.pos.y * ir, rz = p.pos.z * ir;
            // tangential component of position (pos - radial projection)
            const dot = p.pos.x * rx + p.pos.y * ry + p.pos.z * rz;
            const tx = p.pos.x - dot * rx;
            const ty = p.pos.y - dot * ry;
            const tz = p.pos.z - dot * rz;
            // force toward the radial axis, scaled by proximity and gravity
            const gravMag = Math.sqrt(w._scratch.x * w._scratch.x + w._scratch.y * w._scratch.y + w._scratch.z * w._scratch.z);
            const squeeze = lc * prox * gravMag * p.mass;
            f[i].x -= tx * squeeze;
            f[i].y -= ty * squeeze;
            f[i].z -= tz * squeeze;
          }
        }
      }
    }
  }

  // springs — stiffness softens with proximity so tidal forces win near the BH
  for (const s of w.springs) {
    if (!s.alive) continue;
    const a = bodies[s.a], b = bodies[s.b];
    if (!a.alive || !b.alive) continue;
    const dx = b.pos.x - a.pos.x, dy = b.pos.y - a.pos.y, dz = b.pos.z - a.pos.z;
    const dist = Math.sqrt(dx * dx + dy * dy + dz * dz) || 1e-6;
    const invD = 1 / dist;
    const ux = dx * invD, uy = dy * invD, uz = dz * invD;
    const extension = dist - s.rest;
    // Proximity-based spring softening: as the midpoint of the spring nears
    // the BH, the spring becomes weaker. This lets gravity overwhelm the
    // object's structural integrity near the horizon, causing elongation.
    const mx = (a.pos.x + b.pos.x) * 0.5;
    const my = (a.pos.y + b.pos.y) * 0.5;
    const mz = (a.pos.z + b.pos.z) * 0.5;
    const mr = Math.sqrt(mx * mx + my * my + mz * mz);
    const prox = proximityFactor(mr, hr);
    // At full proximity (r=hr), springs are 35% of their original stiffness.
    // At no proximity (r=4×hr), springs are at full stiffness.
    const softFactor = 1 - prox * 0.65;
    const stiff = s.stiff * softFactor;
    const damp = s.damp * softFactor;
    const vrel = (b.vel.x - a.vel.x) * ux + (b.vel.y - a.vel.y) * uy + (b.vel.z - a.vel.z) * uz;
    const fm = stiff * extension + damp * vrel;
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

// Gradual absorption + despawn. Points entering the capture zone
// (captureRadius) begin a gradual pull toward the center with shrinking.
// They're fully consumed (alive=false) when captureProgress reaches 1 or
// they cross the inner horizon. Points beyond despawnRadius are silently removed.
export function resolveHorizon(w) {
  const hr = w.horizonRadius;
  const cr = w.captureRadius;
  const rate = w.captureRate;
  const h = w.dt / w.substeps; // current substep dt
  for (let i = 0; i < w.bodies.length; i++) {
    const p = w.bodies[i];
    if (!p.alive) continue;
    const r2 = V3.lengthSq(p.pos);

    // Hard inner horizon — anything that reaches 0.7× horizon is fully consumed
    // regardless of capture progress (safety net).
    if (r2 <= (hr * 0.7) * (hr * 0.7)) {
      p.alive = false;
      w.events.push({
        type: 'consume',
        index: i,
        pos: V3.clone(p.pos),
        vel: V3.clone(p.vel),
        radius: p.radius,
      });
      continue;
    }

    const r = Math.sqrt(r2);

    // Inside capture zone: gradual absorption
    if (r <= cr) {
      // Ramp capture progress faster the deeper inside the zone
      const depth = 1 - (r - hr * 0.7) / (cr - hr * 0.7); // 0 at cr, 1 at 0.7×hr
      const depthClamped = Math.max(0, Math.min(1, depth));
      const rampRate = rate * (0.3 + 0.7 * depthClamped);
      p.captureProgress = Math.min(1, p.captureProgress + rampRate * h);

      // Pull the point inward toward origin (accelerating absorption pull)
      const pullStrength = 40 * p.captureProgress * p.captureProgress;
      if (r > 1e-3) {
        const ir = 1 / r;
        p.vel.x -= p.pos.x * ir * pullStrength * h;
        p.vel.y -= p.pos.y * ir * pullStrength * h;
        p.vel.z -= p.pos.z * ir * pullStrength * h;
      }

      // Fully absorbed
      if (p.captureProgress >= 1) {
        p.alive = false;
        w.events.push({
          type: 'consume',
          index: i,
          pos: V3.clone(p.pos),
          vel: V3.clone(p.vel),
          radius: p.radius,
        });
      }
      continue;
    }

    // Outside capture zone but beyond despawn radius
    if (r2 > w.despawnRadius * w.despawnRadius) {
      p.alive = false;
    }
  }
}