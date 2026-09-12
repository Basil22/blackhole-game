// physics/world.js — the BlackHoleWorld: Newtonian gravity toward a central
// black hole, tide = differential gravity across an object, damped springs that
// snap on over-strain, and consumption inside the event horizon.
// NO three.js / DOM dependency. Testable in node.

import { V3 } from './vec3.js';
import { PointMass, Spring } from './masses.js';
import { integrate, resolveTears, resolveHorizon } from './integrate.js';

export class BlackHoleWorld {
  constructor(opts = {}) {
    this.mu = opts.mu ?? 12.288e6;             // gravitational parameter GM
    this.horizonRadius = opts.horizonRadius ?? 40;
    // Capture zone: points entering this radius begin gradual absorption
    // (pulled inward + shrinking) instead of instant deletion at the horizon.
    // The zone between captureRadius and horizonRadius is the "slurp" zone.
    this.captureRadius = opts.captureRadius ?? (this.horizonRadius * 1.15);
    // Absorption speed: how fast captureProgress ramps from 0 to 1 once inside
    // the capture zone. Higher = faster absorption (seconds⁻¹).
    this.captureRate = opts.captureRate ?? 3.0;
    this.softening = opts.softening ?? 0.1;    // gravity singularity guard
    this.dt = opts.dt ?? 1 / 240;              // fixed physics timestep (must match PHYS_DT in game/sim.js)
    this.substeps = opts.substeps ?? 2;        // sub-steps per world step
    this.gravity = opts.gravity ?? true;
    this.drag = opts.drag ?? 0.0;              // linear velocity damping 0..1
    this.despawnRadius = opts.despawnRadius ?? Infinity; // fragments flung out beyond this are removed
    // Lateral compression factor: squeezes objects perpendicular to the radial
    // direction toward the BH, mimicking the convergence of tidal field lines.
    // 0 = no compression, higher = stronger squeeze.
    this.lateralCompression = opts.lateralCompression ?? 0.35;
    this.bodies = [];
    this.springs = [];
    this.events = [];   // {type: 'tear'|'consume'|'collide', ...}
    this.time = 0;
    this._f = [];       // scratch force accumulator
    this._scratch = V3.make();
  }

  addPoint(pos, mass = 1, radius = 0.5) {
    const p = new PointMass(pos, mass, radius);
    this.bodies.push(p);
    this._f.push(V3.make());
    return this.bodies.length - 1;
  }

  // addSpring by indices
  addSpring(ia, ib, stiffness, damping, breakStrain, color) {
    const a = this.bodies[ia], b = this.bodies[ib];
    const rest = V3.length(V3.sub(this._scratch, a.pos, b.pos));
    const s = new Spring(ia, ib, rest, stiffness, damping, breakStrain, color);
    this.springs.push(s);
    return s;
  }

  addSpringLen(ia, ib, rest, stiffness, damping, breakStrain, color) {
    const s = new Spring(ia, ib, rest, stiffness, damping, breakStrain, color);
    this.springs.push(s);
    return s;
  }

  clear() {
    this.bodies.length = 0;
    this.springs.length = 0;
    this._f.length = 0;
    this.events.length = 0;
  }

  // Advance one world step. Returns array of events produced this step.
  step() {
    const h = this.dt / this.substeps;
    this.events.length = 0;
    for (let i = 0; i < this.substeps; i++) {
      integrate(this, h);
      resolveTears(this);
      resolveHorizon(this);
    }
    this.time += this.dt;
    return this.events;
  }

  // How many points are still alive (for "is object gone" checks).
  aliveCount() {
    let c = 0;
    for (const p of this.bodies) if (p.alive) c++;
    return c;
  }

  // Center of mass of alive points (used for camera follow).
  centerOfMass() {
    let cx = 0, cy = 0, cz = 0, m = 0;
    for (const p of this.bodies) {
      if (!p.alive) continue;
      cx += p.pos.x * p.mass; cy += p.pos.y * p.mass; cz += p.pos.z * p.mass;
      m += p.mass;
    }
    if (!m) return V3.make();
    return V3.make(cx / m, cy / m, cz / m);
  }
}