// game/scoring/config.js — the single tuning surface for the scoring engine.
// V2: Philosophy C uncapped scoring. Consumption scores well, survival scores
// better via a multiplier. No hard cap — scores grow logarithmically.
//
// The five base categories each produce an UNCAPPED score (logarithmic curves
// that keep growing with more extreme throws). The survival multiplier rewards
// escaping after a close encounter, amplifying the base score.

export const SCORING_CONFIG = Object.freeze({
  // Physical reference; the game's locked horizon radius (scene units).
  horizonRadius: 40,

  // Base category tuning. Each category produces an uncapped score via
  // logarithmic or exponential curves. There is no maxTotalScore cap.
  stretch: Object.freeze({
    // score = scale * ln(1 + rate * (s - 1))  for s > 1, else 0.
    // s = maximumStretch. Grows without bound but decelerates.
    scale: 3000,
    rate: 1.5,
  }),

  precision: Object.freeze({
    // score = scale * exp(-decay * (d/h - 1))  for d > h.
    // Consumed throws: use closest approach before consumption; partial credit.
    // Perfect near-miss (d barely > h) → ~scale. Far away → ~0.
    scale: 3000,
    decay: 0.5,
    // Consumed throws get a fraction of the precision score based on how close
    // they got before being consumed.
    consumedPenalty: 0.6,  // consumed throws get 60% of what they'd get if survived
  }),

  absorption: Object.freeze({
    // Rewards gradual, cinematic consumption. Two components:
    //   completeness = consumedFraction (0-1)
    //   gradualness = min(1, absorptionDuration / durationScale)
    // score = scale * completeness * (0.4 + 0.6 * gradualness)
    // A slow, dramatic consumption scores higher than an instant swallow.
    scale: 2500,
    durationScale: 1.5,   // seconds of absorption for full gradualness credit
  }),

  destruction: Object.freeze({
    // score = scale * ln(1 + tears / tearScale)
    // Logarithmic: first few tears are worth a lot, diminishing returns after.
    // Clean swallow (0 tears) gets a flat credit.
    scale: 1500,
    tearScale: 3,
    noTearSwallowCredit: 200,  // flat points for consuming without tearing
  }),

  survivalMultiplier: Object.freeze({
    // If the object survives (nothing consumed), the base score is multiplied.
    // multiplier = base + bonus * proximityFactor
    // proximityFactor = exp(-decay * (d/h - 1)) for d > h, clamped [0,1]
    // Close survival → high multiplier. Far pass → base multiplier.
    base: 1.0,           // minimum multiplier (no bonus for far passes)
    bonus: 1.5,          // max additional multiplier for perfect near-miss
    decay: 0.4,          // how fast the bonus falls off with distance
    // Dwell time bonus: lingering near the horizon adds to the multiplier
    dwellScale: 0.8,     // seconds near horizon for full dwell bonus
    dwellBonus: 0.3,     // max additional multiplier from dwell time
  }),
});

// Clamp to [0,1]; any non-finite input collapses to 0. Every normalized metric
// passes through here BEFORE it can influence a score, which is what makes NaN
// and Infinity structurally incapable of producing a non-finite score.
export function normalize01(n) {
  return Number.isFinite(n) ? (n < 0 ? 0 : n > 1 ? 1 : n) : 0;
}

// Distances measured from telemetry; unknown/invalid collapse to 0 (which then
// reads as "at the horizon", scoring 0 precision — the safe direction).
export function safeDistance(d) {
  return Number.isFinite(d) && d > 0 ? d : 0;
}

// Safe number: NaN/Infinity/undefined → 0.
export function safeNum(n) {
  return Number.isFinite(n) ? n : 0;
}
