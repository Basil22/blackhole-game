// physics/trajectory/predict.js — deterministic trajectory sampler.
// Runs the real physics integrator on a CLONED BlackHoleWorld so the live game
// world is never touched. Sample points come from the physics state (COM and
// COM velocity of the alive masses), never from the renderer.
//
// predictTrajectory(initialState, options) returns:
//   { samples: [{ t, position, velocity }, ...], count, duration, dt, truncated }
//
// initialState is either:
//   { world }                        — clone an entire live world (full spring-mass)
//   { mu, pos, vel, horizonRadius }  — single point mass (COM approximation)
//                                     (horizonRadius defaults to the game's 40)

import { V3 } from '../vec3.js';
import { BlackHoleWorld } from '../world.js';
import { PointMass } from '../masses.js';

export const PREDICT_DEFAULTS = Object.freeze({
  duration: 10,          // seconds of simulated time
  dt: 1 / 240,           // matches PHYS_DT when no world.dt is given
  sampleInterval: 0.25,  // seconds between samples
  maximumSamples: 512,   // hard cap on returned samples AND on steps
});

// Deep-copy a world's sim state (bodies + springs + integrator options) into a
// fresh, independent world. Renderer state and events are not copied.
export function cloneWorld(world) {
  const w = new BlackHoleWorld({
    mu: world.mu,
    horizonRadius: world.horizonRadius,
    softening: world.softening,
    dt: world.dt,
    substeps: world.substeps,
    gravity: world.gravity,
    drag: world.drag,
    despawnRadius: world.despawnRadius,
  });
  for (const p of world.bodies) w.addPoint(p.pos, p.mass, p.radius);
  for (let i = 0; i < world.bodies.length; i++) {
    const src = world.bodies[i], dst = w.bodies[i];
    dst.pos = V3.clone(src.pos);
    dst.vel = V3.clone(src.vel);
    dst.prev = V3.clone(src.prev);
    dst.alive = src.alive;
  }
  for (const s of world.springs) {
    w.addSpringLen(s.a, s.b, s.rest, s.stiff, s.damp, s.breakStrain, s.color);
    w.springs[w.springs.length - 1].alive = s.alive;
  }
  return w;
}

// Single point-mass world for trajectory analysis.
function pointWorld(state, opts) {
  const w = new BlackHoleWorld({
    mu: state.mu,
    horizonRadius: state.horizonRadius ?? 40,
    dt: opts.dt,
  });
  const idx = w.addPoint(state.pos, 1, state.radius ?? 0.5);
  w.bodies[idx].vel = V3.clone(state.vel);
  return w;
}

// Mass-weighted center-of-mass state of the alive bodies.
function comState(world, out) {
  let x = 0, y = 0, z = 0, m = 0, vx = 0, vy = 0, vz = 0;
  for (const p of world.bodies) {
    if (!p.alive) continue;
    m += p.mass;
    x += p.pos.x * p.mass; y += p.pos.y * p.mass; z += p.pos.z * p.mass;
    vx += p.vel.x * p.mass; vy += p.vel.y * p.mass; vz += p.vel.z * p.mass;
  }
  out.position = { x: m ? x / m : 0, y: m ? y / m : 0, z: m ? z / m : 0 };
  out.velocity = { x: m ? vx / m : 0, y: m ? vy / m : 0, z: m ? vz / m : 0 };
  return out;
}

export function predictTrajectory(initialState, options = {}) {
  const opts = { ...PREDICT_DEFAULTS, ...options };
  const isPoint = initialState && !initialState.world;
  const mu = isPoint ? initialState.mu : initialState.world.mu;
  const src = isPoint ? initialState : initialState.world;

  const dt = opts.dt ?? src.dt ?? PREDICT_DEFAULTS.dt;
  const world = isPoint ? pointWorld(initialState, opts) : cloneWorld(src);

  const sampleEverySteps = Math.max(1, Math.round(opts.sampleInterval / dt));
  const maxSteps = Math.max(1, Math.floor(opts.duration / dt));
  // Guard: never run more steps than maximumSamples * sampleEverySteps, and
  // never exceed maximumSamples samples. Keeps CPU bounded on any input.
  const steps = Math.min(maxSteps, opts.maximumSamples * sampleEverySteps);
  const truncated = steps < maxSteps;
  const samples = [];
  const scratch = { position: null, velocity: null };

  comState(world, scratch);
  samples.push({ t: 0, position: scratch.position, velocity: scratch.velocity });

  for (let i = 0; i < steps; i++) {
    world.step();
    if ((i + 1) % sampleEverySteps === 0) {
      if (world.aliveCount() === 0) break; // object consumed — trajectory over
      comState(world, scratch);
      samples.push({ t: world.time, position: scratch.position, velocity: scratch.velocity });
    }
  }

  return {
    samples,
    count: samples.length,
    duration: samples[samples.length - 1].t,
    dt,
    truncated,
    mu,
  };
}