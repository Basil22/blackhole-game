// physics/trajectory/closest.js — closest approach analysis from physics state.
// Measures the minimum distance to the black hole reachable along the predicted
// trajectory. Never sampled from rendered frames: it re-simulates the physics
// (point-mass COM clone for refinement) and returns a real physics snapshot.
//
// Returns:
//   {
//     minimumDistance,        // |positionAtMinimum|
//     timeAtMinimum,          // seconds after prediction start (t=0)
//     positionAtMinimum,      // {x,y,z}
//     velocityAtMinimum,      // {x,y,z}
//     state,                  // classifyTrajectory verdict at t=0
//     sampleCount,            // coarse samples inspected
//   }

import { predictTrajectory } from './predict.js';
import { classifyTrajectory } from './states.js';

export const CLOSEST_DEFAULTS = Object.freeze({
  duration: 40,
  dt: null,          // inherit the source world's dt when given
  sampleInterval: 0.25,
  maximumSamples: 2048,
  refineLevels: 3,   // each level re-simulates a shrinking window at 320 steps
});

export function analyzeClosestApproach(initialState, options = {}) {
  const opts = { ...CLOSEST_DEFAULTS, ...options };
  const ctx = ctxFrom(initialState, opts);

  // 1) coarse pass over the whole horizon
  const coarse = predictTrajectory(initialState, {
    duration: opts.duration,
    dt: opts.dt,
    sampleInterval: opts.sampleInterval,
    maximumSamples: opts.maximumSamples,
  });
  let best = argmin(coarse.samples);
  let cur = coarse.samples;
  let curOrigin = 0; // absolute t of cur[0]

  // 2) local refinement: re-simulate a tiny window around the minimum at finer
  // resolution, then shrink again. Uses the point-mass COM approximation.
  for (let level = 0; level < opts.refineLevels && best.idx > 0; level++) {
    const pre = cur[best.idx - 1];
    const next = cur[Math.min(best.idx + 1, cur.length - 1)];
    const windowDur = Math.max(next.t - pre.t, 1e-6);
    const fine = predictTrajectory(posState(pre, ctx), {
      duration: windowDur,
      dt: windowDur / 320,
      sampleInterval: windowDur / 320,
      maximumSamples: 1024,
    });
    curOrigin += pre.t; // fine samples restart at t=0; pre.t was relative to cur
    cur = fine.samples;
    best = argmin(cur);
    if (best.idx === 0) break; // minimum sits at the window start — can't do better
  }

  const s = best.sample;
  const initial0 = coarse.samples[0];
  return {
    minimumDistance: Math.sqrt(s.position.x ** 2 + s.position.y ** 2 + s.position.z ** 2),
    timeAtMinimum: s.t + curOrigin,
    positionAtMinimum: s.position,
    velocityAtMinimum: s.velocity,
    state: classifyTrajectory({ ...posState(initial0, ctx) }).state,
    sampleCount: coarse.count,
  };
}

function posState(sample, ctx) {
  return { mu: ctx.mu, horizonRadius: ctx.horizonRadius, pos: sample.position, vel: sample.velocity };
}

function ctxFrom(initialState, opts) {
  if (initialState.world) {
    return { mu: initialState.world.mu, horizonRadius: initialState.world.horizonRadius };
  }
  return { mu: initialState.mu, horizonRadius: initialState.horizonRadius ?? 40 };
}

function argmin(samples) {
  let best = samples[0];
  let bestIdx = 0;
  let bestR2 = Infinity;
  for (let i = 0; i < samples.length; i++) {
    const p = samples[i].position;
    const r2 = p.x * p.x + p.y * p.y + p.z * p.z;
    if (r2 < bestR2) { bestR2 = r2; best = samples[i]; bestIdx = i; }
  }
  return { sample: best, idx: bestIdx };
}