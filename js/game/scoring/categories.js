// game/scoring/categories.js — one pure function per category. Each takes a
// fully-built `cat` row ({key,label,max}), the finalized ThrowTelemetry, and
// the config, then fills in `normalized` + `score` and attaches the reason
// fields that explain the number. Nothing here touches three.js, the DOM, or
// the live physics world.

import { normalize01, safeDistance } from './config.js';

// Did ANY mass cross the horizon? This single flag is the precision/survival
// gate: consumption = the encounter failed, however beautiful the geometry.
export function isConsumed(t) {
  return Number.isFinite(t.consumedPointCount) && t.consumedPointCount > 0;
}

// PRECISION — reward getting close to the horizon WITHOUT being consumed.
// consumed (or d <= h) ⇒ 0. Smooth exponential above h (see config.precision).
export function precision(cat, t, cfg) {
  const h = cfg.horizonRadius;
  const d = safeDistance(t.closestApproach?.distance);
  const consumed = isConsumed(t);
  let normalized = 0;
  if (!consumed && d > h) {
    normalized = normalize01(Math.exp(-cfg.precision.decay * (d / h - 1)));
  }
  cat.normalized = normalized;
  cat.score = Math.round(normalized * cat.max);
  cat.closestApproach = d;
  cat.consumed = consumed;
  return cat;
}

// TIDAL — reward meaningful spaghettification. 1× (or a zero-span object that
// physically cannot stretch) ⇔ 0; grows smoothly above 1× and asymptotes to 1.
export function tidal(cat, t, cfg) {
  const s = Number.isFinite(t.maximumStretch) ? t.maximumStretch : 1;
  const span = Number.isFinite(t.initialSpan) ? t.initialSpan : 0;
  let normalized = 0;
  if (s > 1 && span > 0) {
    normalized = normalize01(1 - Math.exp(-cfg.tidal.rate * (s - 1)));
  }
  cat.normalized = normalized;
  cat.score = Math.round(normalized * cat.max);
  cat.maximumStretch = s;
  cat.initialSpan = span;
  return cat;
}

// DESTRUCTION — tears are the primary metric; a clean tearless swallow earns a
// small separate credit. Monotone non-decreasing in tearCount (saturates).
export function destruction(cat, t, cfg) {
  const tears = Math.floor(safeDistance(t.tearCount));
  const consumed = Math.floor(safeDistance(t.consumedPointCount));
  let raw = tears / cfg.destruction.tearScale;
  if (tears === 0 && consumed > 0) raw += cfg.destruction.noTearSwallowCredit;
  const normalized = normalize01(raw);
  cat.normalized = normalized;
  cat.score = Math.round(normalized * cat.max);
  cat.tearCount = tears;
  cat.consumedPointCount = consumed;
  return cat;
}

// SURVIVAL — "did the object actually survive the encounter". Consumed ⇒ 0.
// Survived ⇒ blend of a close pass (exp proximity) and near-horizon linger
// (capped dwell). Staying far away scores ~0 by construction.
export function survival(cat, t, cfg) {
  const h = cfg.horizonRadius;
  const d = safeDistance(t.closestApproach?.distance);
  const consumed = isConsumed(t);
  const c = cfg.survival;
  let normalized = 0;
  if (!consumed) {
    const prox = d > h ? Math.exp(-c.proximityDecay * (d / h - 1)) : 0;
    const dwell = Number.isFinite(t.timeNearHorizon) ? t.timeNearHorizon / c.dwellScale : 0;
    normalized = normalize01(c.proximityWeight * prox + c.dwellWeight * dwell);
  }
  cat.normalized = normalized;
  cat.score = Math.round(normalized * cat.max);
  cat.closestApproach = d;
  cat.timeNearHorizon = Number.isFinite(t.timeNearHorizon) ? t.timeNearHorizon : 0;
  cat.consumed = consumed;
  return cat;
}

// ORBITAL — conservative V1: positive credit iff the sim reported a real
// ORBITAL state. NOT driven by orbital energy sign (that rewards bound-ness,
// not evidence of actually orbiting). Counting completed orbits is a later
// feature; nothing here tries.
export function orbital(cat, t) {
  const normalized = t.trajectoryState === 'ORBITAL' ? 1 : 0;
  cat.normalized = normalized;
  cat.score = Math.round(normalized * cat.max);
  cat.trajectoryState = t.trajectoryState;
  return cat;
}

// NEAR-HORIZON SURVIVAL BONUS — the V1 bonus. Bounded and scaled by
// the same closeness shape as precision, gated on surviving (nothing consumed)
// with closestApproach strictly outside the horizon. No combos/multipliers.
export function nearHorizonSurvivalBonus(t, cfg) {
  const h = cfg.horizonRadius;
  const d = safeDistance(t.closestApproach?.distance);
  const consumed = isConsumed(t);
  let normalized = 0;
  let eligible = false;
  if (!consumed && d > h) {
    eligible = true;
    normalized = normalize01(Math.exp(-cfg.precision.decay * (d / h - 1)));
  }
  const max = cfg.bonus.nearHorizonSurvivalMax;
  return { eligible, normalized, score: Math.round(normalized * max), max, closestApproach: d, consumed };
}

// HARD-WON ESCAPE BONUS — Phase 29. Rewards doing the genuinely hard thing (a
// real escape) instead of the accidental thing (a plunge). An escape launch
// sits at the spawn radius, so its closest approach never reads "near the
// horizon" — the discriminating skill is threading the launch JUST past the
// real escape rim. velocityRatio = launchSpeed / escapeVelocity (from the
// telemetry's initial snapshot and the configured mu). Full credit at the rim
// (rate ≈1.13), decaying linearly to zero at a full-power fling (≈1.414). A
// swallowed throw (consumed) can never claim it.
export function escapeSurvivalBonus(t, cfg) {
  const consumed = isConsumed(t);
  const state = t.trajectoryState;
  // The finalized-telemetry shape carries the launch snapshot nested under
  // `initial` ({ speed, distance }); the scoring layer reads exactly that.
  const r = safeDistance(t.initial?.distance);
  const s = safeDistance(t.initial?.speed);
  const vEsc = r > 0 ? Math.sqrt((2 * Math.max(0, cfg.mu)) / r) : 0;
  const velocityRatio = vEsc > 0 ? s / vEsc : 0;
  // Eligibility is a STATE fact: a real escape that survived. The CREDIT
  // (below) is the skill signal — how near the rim the thread ran.
  const eligible = !consumed && state === 'ESCAPING' && velocityRatio >= 1;
  let normalized = 0;
  if (eligible) {
    const e = cfg.bonus.escape;
    const span = e.velocityRatioCeiling - e.velocityRatioFloor;
    const raw = span > 0 ? 1 - (velocityRatio - e.velocityRatioFloor) / span : 0;
    normalized = normalize01(raw);  // below-floor threads clamp to full credit;
    // above-ceiling flings clamp to zero (blasé — nothing brave about it)
  }
  const max = cfg.bonus.escapeSurvivalMax;
  return {
    eligible, normalized, score: Math.round(normalized * max), max,
    velocityRatio, state,
  };
}