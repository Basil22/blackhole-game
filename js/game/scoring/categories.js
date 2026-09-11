// game/scoring/categories.js — V2 uncapped scoring categories.
// Each function takes a `cat` row, finalized ThrowTelemetry, and config,
// then fills in `score` + reason fields. Scores are UNCAPPED (logarithmic
// or exponential curves that keep growing). Nothing here touches three.js,
// the DOM, or the live physics world.

import { normalize01, safeDistance, safeNum } from './config.js';

// Did ANY mass cross the horizon?
export function isConsumed(t) {
  return Number.isFinite(t.consumedPointCount) && t.consumedPointCount > 0;
}

// STRETCH — reward spaghettification (elongation). Logarithmic, uncapped.
// score = scale * ln(1 + rate * (s - 1))  for s > 1, else 0.
export function stretch(cat, t, cfg) {
  const s = safeNum(t.maximumStretch);
  const span = safeNum(t.initialSpan);
  let score = 0;
  if (s > 1 && span > 0) {
    score = cfg.stretch.scale * Math.log(1 + cfg.stretch.rate * (s - 1));
  }
  cat.score = Math.round(score);
  cat.maximumStretch = s;
  cat.initialSpan = span;
  return cat;
}

// PRECISION — reward getting close to the horizon. Consumed throws get
// partial credit (60% by default) instead of being zeroed out.
export function precision(cat, t, cfg) {
  const h = cfg.horizonRadius;
  const d = safeDistance(t.closestApproach?.distance);
  const consumed = isConsumed(t);
  let score = 0;
  if (d > h) {
    const raw = cfg.precision.scale * Math.exp(-cfg.precision.decay * (d / h - 1));
    score = consumed ? raw * cfg.precision.consumedPenalty : raw;
  } else if (d > 0 && consumed) {
    // Object was consumed from very close — give near-max with penalty
    score = cfg.precision.scale * cfg.precision.consumedPenalty * 0.95;
  }
  cat.score = Math.round(score);
  cat.closestApproach = d;
  cat.consumed = consumed;
  return cat;
}

// ABSORPTION — reward gradual, cinematic consumption. Only scores when
// something was actually consumed. Slow dramatic swallows > instant ones.
export function absorption(cat, t, cfg) {
  const fraction = safeNum(t.consumptionFraction);
  const duration = safeNum(t.absorptionDuration);
  let score = 0;
  if (fraction > 0) {
    const gradualness = normalize01(duration / cfg.absorption.durationScale);
    score = cfg.absorption.scale * fraction * (0.4 + 0.6 * gradualness);
  }
  cat.score = Math.round(score);
  cat.consumptionFraction = fraction;
  cat.absorptionDuration = duration;
  return cat;
}

// DESTRUCTION — tears + consumption credit. Logarithmic in tear count.
export function destruction(cat, t, cfg) {
  const tears = Math.floor(safeNum(t.tearCount));
  const consumed = Math.floor(safeNum(t.consumedPointCount));
  let score = 0;
  if (tears > 0) {
    score = cfg.destruction.scale * Math.log(1 + tears / cfg.destruction.tearScale);
  } else if (consumed > 0) {
    score = cfg.destruction.noTearSwallowCredit;
  }
  cat.score = Math.round(score);
  cat.tearCount = tears;
  cat.consumedPointCount = consumed;
  return cat;
}

// SURVIVAL MULTIPLIER — computed separately and applied to the base total.
// Returns the multiplier value (>= 1.0). Only > 1.0 if the object survived
// (nothing consumed) and got close to the horizon.
export function survivalMultiplier(t, cfg) {
  const h = cfg.horizonRadius;
  const d = safeDistance(t.closestApproach?.distance);
  const consumed = isConsumed(t);
  const c = cfg.survivalMultiplier;

  if (consumed) {
    return { multiplier: c.base, proximity: 0, dwell: 0, survived: false };
  }

  let proxFactor = 0;
  if (d > h) {
    proxFactor = normalize01(Math.exp(-c.decay * (d / h - 1)));
  }

  const dwellTime = safeNum(t.timeNearHorizon);
  const dwellFactor = normalize01(dwellTime / c.dwellScale);

  const multiplier = c.base + c.bonus * proxFactor + c.dwellBonus * dwellFactor;

  return {
    multiplier,
    proximity: proxFactor,
    dwell: dwellFactor,
    survived: true,
    closestApproach: d,
    timeNearHorizon: dwellTime,
  };
}
