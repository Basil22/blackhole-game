// game/aiming/mapping.js — PURE input→launch mapping (Phase 13 control envelope,
// re-anchored by the Phase-29 gameplay balance pass).
// Three.js-free, DOM-free, deterministic, O(1). Turns the slingshot drag
// (aim.dx / aim.dy) into the launch velocity around the black hole.
//
// Physics-derived (not invented): spawn R≈384.5, vCirc≈178.8, escape at the
// spawn = √2·vCirc ≈ 1.414 multiples of vCirc (analytic point-mass). The REAL
// spring-mass sim (tidal energy losses, in-flight drag) needs MORE: measured
// bisection of the real sim says the true all-object escape threshold is
// tangFrac ≈ 1.60 (5/5 ESCAPING for rock/human/ship/planet; 1.59 is still
// marginal for the planet), and real survival (a non-consumed outcome) starts
// at ~1.03 (rock) / ~1.25–1.27 (human, ship, planet). Pre-Phase-11 the mapping
// only reached 0.35–0.52 vCirc → escape and orbit were OUTSIDE the control
// envelope: every throw was CAPTURED and BREAK FREE / FIND THE ORBIT were
// impossible.
//
// Phase 13 redesign (kept): the old linear tangFrac ramp made periapsis SATURATE
// at the spawn radius across roughly dx 180–280 (a huge flat ORBITAL region).
// This mapping is a deterministic, continuous, monotone curve that is LINEAR IN
// PERIAPSIS across the sub-circular band. Phase 29 gameplay balance re-anchored
// the curve to the MEASURED real-sim bands so every mission is reachable by a
// learnable gesture, and the brutal "full-width 360px swipe or fail" escape wall
// is gone:
//
//   dx 0–25        : r_p 25→42    — trivial capture (short accidental pulls)
//   dx 25–40       : r_p 42→56    — the near-horizon PRECISION zone (tight orbit;
//                     every drag unit ≈ 1 unit of closest approach)
//   dx 40–150      : r_p 56→384.5 (= spawn R) — one orbit = one periapsis, no
//                     saturation: every drag unit moves the closest approach a
//                     comparable, visible amount (learnable/reproducible skill)
//   dx 150–250     : s 1.0→1.60   — escape ramp spanning the REAL orbital band:
//                     rock survives from ~1.03 (≈dx 155), soft objects from
//                     ~1.25–1.27 (≈dx 192–196), ESCAPING from 1.60 (dx 250)
//   dx 250–340     : s 1.60→2.0   — comfortable post-escape power (BREAK FREE
//                     starts at 250 = ~82% of a full-width 360px drag ≈ dx 306,
//                     with real margin below the screen edge; tangMax 2.0 adds a
//                     deep-escape fling tail that is desktop-only on narrow phones)
//
// The periapsis↔s conversion is the exact orbit equation at the calibration
// radius R: x = r_p/R, s = √(2x/(1+x)) — an object launched tangentially at
// s·vCirc has periapsis r_p (s=1.0 → exact circular orbit at R; the analytic
// point-mass escape is s≥√2, but the REAL sim escapes at s≈1.60 as measured).
// The curve anchors are baked from R=384.5 (the fixed game spawn radius); the
// mapping is otherwise physics-independent. The radFrac (dy) axis is unchanged:
// dy>0 dives inward (tightens r_p), dy<0 swings outward.
//
//   tangFrac* vCirc  : tangential speed — LOW power → deep held capture,
//                      ~1.0 → a wide swing, ≥1.60 → real-sim escape. Monotonic
//                      in aim.dx.
//   radFrac* vCirc   : radial-inward speed (points toward the hole). Base 0 →
//                      a straight hard pull reads ESCAPING; dy<0 (pull up /
//                      outward bias) also helps. Monotonic in aim.dy.
//   +3.2 y bias      : unchanged tiny lift so orbits and escapes stay sane.
//
// The drag lives in units of accumulated pointer delta (aim.dx/dy, ×0.9 per
// move in Game). The same constant SPAN maps 0→~0.35 on either device, so a
// full-width gesture reaches escape on desktop and mobile alike.

import { V3 } from '../../physics.js';

const R_CAL = 384.5;                       // calibration spawn radius (orbit eq.)

// Exact bound-orbit relation: tangFrac s that puts an object launched
// tangentially from radius R at periapsis r_p (s=1.0 ⇔ r_p=R circular, s=√2
// ⇔ parabolic escape). Used to shape the curve so periapsis is ~linear in dx.
export const rpForTangFrac = (s) => R_CAL * s * s / (2 - s * s);
export const tangFracForRp = (rp) => {
  const x = rp / R_CAL;
  return Math.sqrt((2 * x) / (1 + x));
};

// The measured real-sim escape threshold: the lowest tangential multiple at
// which EVERY object (rock/human/ship/planet, size 1, dy 0) escapes the hole
// with the actual spring-mass physics (bisection of the real sim, 5/5 runs).
export const ESCAPE_TANGF = 1.60;

export const AIM_MAPPING = Object.freeze({
  // Tangential speed as a multiple of v_circ at the spawn radius.
  tangMin: 0.35,              // lowest power — held close-pass / capture
  tangMax: 2.0,               // comfortably past the REAL escape threshold. Real-sim
  // escape (tidal + drag losses) is ~1.60 v_circ minus the analytic √2 — measured
  // by bisecting the full spring-mass sim (5/5 ESCAPING at 1.60 for every object,
  // planet needs ≥1.60). The old tangMax 1.77 still reached REAL escape only at
  // dx≈306 of a 360px swipe (the elastic razor's edge the Phase-29 breakdown
  // removed); 2.0 gives the post-escape ramp a wide, forgiving plateau.
  tangSpan: 340,              // aim.dx units to sweep tangMin → tangMax
  // Radial-inward speed as a multiple of v_circ. Base 0 → a straight pull is
  // negligibly infalling; the +yBias adds the tiny outward k that reads ESCAPING.
  radBase: 0.0,
  radMin: -0.06,              // dy<0 → slight outward bias (helps escape/orbit)
  radMax: 0.42,               // dy>0 → deep deliberate dive (precision captures)
  radGain: 0.00087,
  yBias: 3.2,                 // fixed vertical lift, preserved from the old mapping
  // Curve anchors (drag units). The sub-circular band is expressed via periapsis
  // (see tangFracForRp) so closest approach stays ~linear in dx, never saturating
  // before the spawn radius. The escape anchor is the MEASURED real-sim threshold,
  // NOT the analytic √2 — the honest answer to "where does escape actually begin".
  curve: Object.freeze({
    captureAt: Object.freeze({ dx: 25, periapsis: 42 }),        // r_p 25→42   capture → orbit seam
    precisionAt: Object.freeze({ dx: 40, periapsis: 56 }),      // r_p 42→56   near-horizon precision zone
    circularAt: Object.freeze({ dx: 150, periapsis: R_CAL }),   // r_p 56→384.5 sub-circular ramp (s=1.0)
    escapeAt: Object.freeze({ dx: 250, tangFrac: ESCAPE_TANGF }), // 1.0→1.60  real-sim escape ramp (~dx 250)
  }),
});

export function clampFrac(v, lo, hi) {
  return Math.max(lo, Math.min(hi, v));
}

// Pure: map drag distance → tangential multiple of v_circ, shaped by the Phase
// 13 periapsis-linear curve. Clamps to [tangMin, tangMax]. Monotone nondecreasing.
export function tangFracFromDx(dx, cfg = AIM_MAPPING) {
  const d = clampFrac(dx, 0, cfg.tangSpan);
  const { captureAt, precisionAt, circularAt, escapeAt } = cfg.curve;
  const rpMin = rpForTangFrac(cfg.tangMin);
  if (d <= captureAt.dx) {
    const rp = rpMin + (captureAt.periapsis - rpMin) * (d / captureAt.dx);
    return tangFracForRp(rp);
  }
  if (d <= precisionAt.dx) {
    const rp = captureAt.periapsis + (precisionAt.periapsis - captureAt.periapsis) *
      ((d - captureAt.dx) / (precisionAt.dx - captureAt.dx));
    return tangFracForRp(rp);
  }
  if (d <= circularAt.dx) {
    const rp = precisionAt.periapsis + (circularAt.periapsis - precisionAt.periapsis) *
      ((d - precisionAt.dx) / (circularAt.dx - precisionAt.dx));
    return tangFracForRp(rp);
  }
  if (d <= escapeAt.dx) {
    return 1.0 + (escapeAt.tangFrac - 1.0) * ((d - circularAt.dx) / (escapeAt.dx - circularAt.dx));
  }
  return escapeAt.tangFrac + (cfg.tangMax - escapeAt.tangFrac) * ((d - escapeAt.dx) / (cfg.tangSpan - escapeAt.dx));
}

// Pure: (dx, dy) → { tangFrac, radFrac, power01 }. No state, no mutation.
export function aimFractions({ dx, dy }, cfg = AIM_MAPPING) {
  const tangFrac = tangFracFromDx(dx, cfg);
  const radFrac = clampFrac(cfg.radBase + dy * cfg.radGain, cfg.radMin, cfg.radMax);
  const power01 = (tangFrac - cfg.tangMin) / (cfg.tangMax - cfg.tangMin);
  return { tangFrac, radFrac, power01 };
}

// Pure: build the launch velocity from a spawn position (plain {x,y,z}) and the
// drag. Returns a plain vector plus diagnostic fractions — NEVER three.js.
export function aimToVelocity({ mu, pos, dx, dy }, cfg = AIM_MAPPING) {
  const r = V3.length(pos);
  const vCirc = r > 0 ? Math.sqrt(Math.max(mu, 0) / r) : 0 || 1;
  const { tangFrac, radFrac, power01 } = aimFractions({ dx, dy }, cfg);

  const radial = V3.normalize(V3.make(), pos);
  const up = V3.make(0, 1, 0);
  let tang = V3.cross(V3.make(), up, radial);
  if (V3.lengthSq(tang) < 0.01) tang = V3.make(1, 0, 0);
  tang = V3.normalize(tang, tang);

  const st = vCirc * tangFrac;
  const sr = vCirc * radFrac;
  const v = {
    x: tang.x * st - radial.x * sr,
    y: tang.y * st - radial.y * sr + cfg.yBias,
    z: tang.z * st - radial.z * sr,
  };
  return {
    x: v.x, y: v.y, z: v.z,
    speed: V3.length(v),
    vCirc,
    tangFrac,
    radFrac,
    power01,
    escapeVelocity: r > 0 ? Math.sqrt((2 * Math.max(mu, 0)) / r) : Infinity,
    velocityRatio: vCirc > 0 ? V3.length(v) / (Math.sqrt(2) * vCirc) : 0,
  };
}

// Inverse helpers — how far to drag to reach a target tangential multiple.
// Deterministic so tests can derive an exact gesture for any desired state.
export function dxForTangFrac(f, cfg = AIM_MAPPING) {
  const f2 = clampFrac(f, cfg.tangMin, cfg.tangMax);
  const { captureAt, precisionAt, circularAt, escapeAt } = cfg.curve;
  const rpMin = rpForTangFrac(cfg.tangMin);
  if (f2 <= tangFracForRp(captureAt.periapsis)) {
    const rp = rpForTangFrac(f2);
    return ((rp - rpMin) / (captureAt.periapsis - rpMin)) * captureAt.dx;
  }
  if (f2 <= tangFracForRp(precisionAt.periapsis)) {
    const rp = rpForTangFrac(f2);
    return captureAt.dx + ((rp - captureAt.periapsis) / (precisionAt.periapsis - captureAt.periapsis)) *
      (precisionAt.dx - captureAt.dx);
  }
  if (f2 <= 1.0) {
    const rp = rpForTangFrac(f2);
    return precisionAt.dx + ((rp - precisionAt.periapsis) / (circularAt.periapsis - precisionAt.periapsis)) *
      (circularAt.dx - precisionAt.dx);
  }
  if (f2 <= escapeAt.tangFrac) {
    return circularAt.dx + ((f2 - 1.0) / (escapeAt.tangFrac - 1.0)) * (escapeAt.dx - circularAt.dx);
  }
  return escapeAt.dx + ((f2 - escapeAt.tangFrac) / (cfg.tangMax - escapeAt.tangFrac)) * (cfg.tangSpan - escapeAt.dx);
}

// Drag needed to sit exactly at the REAL-sim escape threshold (tangFrac
// ESCAPE_TANGF — the measured threshold where every object actually escapes,
// NOT the analytic point-mass √2).
export function escapeDrag(cfg = AIM_MAPPING) {
  return { dx: dxForTangFrac(ESCAPE_TANGF, cfg), dy: 0 };
}
