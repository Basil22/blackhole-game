// game/scoring/score.js — pure composition: ThrowTelemetry → ThrowScore.
// Pure: no Math.random, no Date.now/performance.now, no module state, no DOM,
// no three.js, no access to the live physics world. Identical telemetry → bit-
// identical score. The result is plain, serializable data.

import { SCORING_CONFIG } from './config.js';
import {
  precision, tidal, destruction, survival, orbital, nearHorizonSurvivalBonus,
  escapeSurvivalBonus,
} from './categories.js';

// Build an empty category row. `max` = weight · maxTotalScore, so normalized 1
// always yields exactly its cap — bounded by construction.
function makeCat(key, label, max) {
  return { key, label, score: 0, normalized: 0, max: Math.round(max) };
}

export function calculateThrowScore(telemetry, config = SCORING_CONFIG) {
  const maxTotal = config.maxTotalScore;
  const w = config.weights;

  const cats = {
    precision: makeCat('precision', 'PRECISION', w.precision * maxTotal),
    tidal: makeCat('tidal', 'TIDAL', w.tidal * maxTotal),
    destruction: makeCat('destruction', 'DESTRUCTION', w.destruction * maxTotal),
    survival: makeCat('survival', 'SURVIVAL', w.survival * maxTotal),
    orbital: makeCat('orbital', 'ORBITAL', w.orbital * maxTotal),
  };

  precision(cats.precision, telemetry, config);
  tidal(cats.tidal, telemetry, config);
  destruction(cats.destruction, telemetry, config);
  survival(cats.survival, telemetry, config);
  orbital(cats.orbital, telemetry);

  const bonus = nearHorizonSurvivalBonus(telemetry, config);
  const escapeBonus = escapeSurvivalBonus(telemetry, config);

  const breakdown = [
    cats.precision, cats.tidal, cats.destruction, cats.survival, cats.orbital,
  ].map((c) => ({ ...c }));

  const bonusRow = {
    key: 'nearHorizonSurvival', label: 'NEAR-HORIZON SURVIVAL',
    score: bonus.score, normalized: bonus.normalized, max: bonus.max,
    eligible: bonus.eligible, closestApproach: bonus.closestApproach,
  };
  breakdown.push(bonusRow);
  const escapeRow = {
    key: 'escapeSurvival', label: 'HARD-WON ESCAPE',
    score: escapeBonus.score, normalized: escapeBonus.normalized, max: escapeBonus.max,
    eligible: escapeBonus.eligible, velocityRatio: escapeBonus.velocityRatio,
  };
  breakdown.push(escapeRow);

  const total = breakdown.reduce((sum, row) => sum + row.score, 0);

  return {
    total,
    maxTotal: maxTotal + config.bonus.nearHorizonSurvivalMax + config.bonus.escapeSurvivalMax,
    horizonRadius: config.horizonRadius,
    categories: {
      precision: { ...cats.precision },
      tidal: { ...cats.tidal },
      destruction: { ...cats.destruction },
      survival: { ...cats.survival },
      orbital: { ...cats.orbital },
    },
    bonus: { nearHorizonSurvival: bonus, escapeSurvival: escapeBonus },
    breakdown,
  };
}