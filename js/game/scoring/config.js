// game/scoring/config.js — the single tuning surface for the scoring engine.
// Every curve, weight, cap, and label lives here so a future developer can
// retune the game WITHOUT touching any formula or breakdown code.
//
// Contract: weights must sum to 1. Every category is `weight · maxTotalScore`
// points when `normalized === 1`, so no single metric can dominate because of
// a different numerical scale — each curve emits a unitless `[0,1]` value.

export const SCORING_CONFIG = Object.freeze({
  // Physical reference; the game's locked horizon radius (scene units).
  // Deliberately supplied here (not read from a live world) so the scorer has
  // no physics dependency and telemetry is consumed untouched.
  horizonRadius: 40,

  // Gravitational parameter of the black hole (scene units³·s⁻²). Used only to
  // derive the escape velocity for the escape-survival bonus; mirrors the fixed
  // game constant. Supplied here so telemetry (which carries no mu) can be
  // scored in isolation.
  mu: 12.288e6,

  // Share of the score ceiling per category. Sum MUST equal 1.0. V1 balances
  // are intentionally shallow — retune from real throw data later, in this
  // object, not in code.
  weights: Object.freeze({
    precision: 0.30,
    tidal: 0.25,
    destruction: 0.15,
    survival: 0.20,
    orbital: 0.10,
  }),

  // Hard ceiling for the sum of the five categories (bonus is added on top,
  // also bounded). 10000 keeps scores comfortably readable on a screen.
  maxTotalScore: 10000,

  precision: Object.freeze({
    // normalized(d) = exp(-decay · (d/h − 1))  for d > h, else 0.
    //   d = h        → 0            (crossing the horizon fails the challenge)
    //   d slightly > h → ~1         (perfect near miss)
    //   d → ∞        → 0            (boring, far away)
    // Smooth, strictly monotone decreasing with d, never infinite.
    decay: 0.5,
  }),

  survival: Object.freeze({
    // Survival is "did you actually survive a close encounter", which is NOT
    // the same function as precision. Precision rewards geometry (closeness);
    // survival rewards a close pass that also came out alive — so it blends
    // proximity with how long the object lingered inside the near-horizon band.
    //   proximity(d) = exp(-proximityDecay · (d/h − 1)) for d > h, else 0.
    //   dwell(c)     = clamp01(timeNearHorizon / dwellScale).
    proximityDecay: 0.4,
    dwellScale: 0.8,        // seconds of near-horizon time = full dwell credit
    proximityWeight: 0.6,   // + dwellWeight MUST sum to 1
    dwellWeight: 0.4,
  }),

  tidal: Object.freeze({
    // normalized(s) = 1 − exp(-rate · (s − 1))  for s > 1, else 0,
    // where s = maximumStretch = (max alive span / initial span).
    //   1× → 0, 2× → positive, grows smoothly, asymptotes to 1 (never infinite).
    // Gated on initialSpan > 0 so a zero/single-point object can never get
    // fake stretch.
    rate: 0.4,
  }),

  destruction: Object.freeze({
    // normalized = saturate( tearCount / tearScale (+ swallow credit) ).
    // Tears are the PRIMARY destruction metric. Consumption only adds credit
    // when NOTHING tore — an object swallowed whole — so one physical
    // destruction isn't counted twice (torn AND swallowed both being credited).
    tearScale: 8,                // tears to reach full destruction
    noTearSwallowCredit: 0.25,   // credit for a clean, tearless swallow
  }),

  bonus: Object.freeze({
    // NEAR-HORIZON SURVIVAL — the V1 bonus:
    // eligible iff closestApproach > horizonRadius AND nothing consumed;
    // scales linearly with the precision curve's closeness so an actual
    // hair's-breadth escape pays more than a fling that never interacted.
    // Bounded: score ∈ [0, nearHorizonSurvivalMax].
    nearHorizonSurvivalMax: 600,

    // HARD-WON ESCAPE — Phase 29: escaping the hole was nearly unpriced (a
    // proud ESCAPING throw scored less than an accidental plunge). Escapes
    // launch from the spawn radius (~384) so their closest approach is never
    // actually near the horizon — the skill that discriminates a brave escape
    // from a blasé fling is HOW CLOSE TO THE REAL-SIM ESCAPE THRESHOLD the
    // launch threads. velocityRatio = launchSpeed / escapeVelocity (measured
    // at the spawn radius): the mapping's escape rim (tangFrac 1.60) reads
    // velocityRatio ≈ 1.13, a max-power fling reads ~1.414. The bonus pays the
    // full max at the rim and decays to zero by the blasé tail:
    //   normalized = 1 − (velocityRatio − floor) / (ceiling − floor)
    // Bounded: score ∈ [0, escapeSurvivalMax]. Rolled into com.maxTotal on top.
    escapeSurvivalMax: 800,
    escape: Object.freeze({
      velocityRatioFloor: 1.13,    // ≈ the real escape rim (tangFrac 1.60)
      velocityRatioCeiling: 1.414, // ≈ a full-power fling (tangMax 2.0)
    }),
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