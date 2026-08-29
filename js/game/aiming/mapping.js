// game/aiming/mapping.js — PURE input→launch mapping (Phase 13 control envelope).
// Three.js-free, DOM-free, deterministic, O(1). Turns the slingshot drag
// (aim.dx / aim.dy) into the launch velocity around the black hole.
//
// Physics-derived (not invented): spawn R≈384.5, vCirc≈178.8, escape at the
// spawn = √2·vCirc ≈ 1.414 multiples of vCirc. Pre-Phase-11 the mapping only
// reached 0.35–0.52 vCirc → escape (≥1.41) and orbit (~1.0) were OUTSIDE the
// control envelope: every throw was CAPTURED and BREAK FREE / FIND THE ORBIT
// were impossible.
//
// Phase 13 redesign: the old linear tangFrac ramp made periapsis SATURATE at
// the spawn radius across roughly dx 180–280 (a huge flat ORBITAL region that
// produced essentially one identical wide orbit), and the top of the drag range
// (dx≈340–365) was dead (tangFrac clipped at 1.62 at both ends). This mapping
// keeps the same envelope (0.35–1.62 vCirc across 340 drag units, same gesture,
// same exported API) but reshapes the response into a deterministic, continuous,
// monotone curve that is LINEAR IN PERIAPSIS across the orbital band:
//
//   dx 0–25        : r_p 25→42  — trivial capture (short accidental pulls)
//   dx 25–40       : r_p 42→56  — the near-horizon PRECISION zone (tight orbit;
//                     every drag unit ≈ 1 unit of closest approach)
//   dx 40–258      : r_p 56→384.5 (= spawn R) — one orbit = one periapsis, no
//                     saturation: every drag unit moves the closest approach a
//                     comparable, visible amount (learnable/reproducible skill)
//   dx 258–272     : s 1.0→√2  — the escape-triggering ramp is deliberately
//                     SHORT, so escape is a full-power gesture you must choose
//   dx 272–340     : s √2→1.62 — post-escape power for a comfortable BREAK FREE
//
// The periapsis↔s conversion is the exact orbit equation at the calibration
// radius R: x = r_p/R, s = √(2x/(1+x)) — an object launched tangentially at
// s·vCirc has periapsis r_p (s=1.0 → exact circular orbit at R, s≥√2 → escape).
// The curve anchors are baked from R=384.5 (the fixed game spawn radius); the
// mapping is otherwise physics-independent. The radFrac (dy) axis is unchanged:
// dy>0 dives inward (tightens r_p), dy<0 swings outward.
//
//   tangFrac* vCirc  : tangential speed — LOW power → deep held capture,
//                      ~1.0 → orbit, ≥√2 → escape. Monotonic in aim.dx.
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

export const AIM_MAPPING = Object.freeze({
  // Tangential speed as a multiple of v_circ at the spawn radius.
  tangMin: 0.35,              // lowest power — held close-pass / capture
  tangMax: 1.62,              // comfortably past escape (√2 ≈ 1.4142)
  tangSpan: 340,              // aim.dx units to sweep tangMin → tangMax
  // Radial-inward speed as a multiple of v_circ. Base 0 → a straight pull is
  // negligibly infalling; the +yBias adds the tiny outward k that reads ESCAPING.
  radBase: 0.0,
  radMin: -0.06,              // dy<0 → slight outward bias (helps escape/orbit)
  radMax: 0.42,               // dy>0 → deep deliberate dive (precision captures)
  radGain: 0.00087,
  yBias: 3.2,                 // fixed vertical lift, preserved from the old mapping
  // Phase 13 curve anchors (drag units). The orbital band is expressed via
  // periapsis (see tangFracForRp) so closest approach stays ~linear in dx,
  // never saturating before the spawn radius.
  curve: Object.freeze({
    captureAt: Object.freeze({ dx: 25, periapsis: 42 }),        // r_p 25→42   capture → orbit seam
    precisionAt: Object.freeze({ dx: 40, periapsis: 56 }),      // r_p 42→56   near-horizon precision zone
    circularAt: Object.freeze({ dx: 258, periapsis: R_CAL }),   // r_p 56→384.5 orbital ramp (s=1.0)
    escapeAt: Object.freeze({ dx: 272, tangFrac: Math.SQRT2 }), // s 1.0→√2    short deliberate escape ramp
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

// Drag needed to sit exactly at the escape threshold (√2 · vCirc tangential).
export function escapeDrag(cfg = AIM_MAPPING) {
  return { dx: dxForTangFrac(Math.SQRT2), dy: 0 };
}
