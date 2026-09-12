// game/scoring/score.js — V2 uncapped scoring composition.
// ThrowTelemetry → ThrowScore. Pure: no Math.random, no Date.now, no module
// state, no DOM, no three.js. Identical telemetry → identical score.
//
// Categories: Stretch, Precision, Absorption, Destruction (base score).
// Survival multiplier applied on top. No hard cap.

import { SCORING_CONFIG } from './config.js';
import {
  stretch, precision, absorption, destruction, survivalMultiplier,
} from './categories.js';

function makeCat(key, label) {
  return { key, label, score: 0 };
}

export function calculateThrowScore(telemetry, config = SCORING_CONFIG) {
  const cats = {
    stretch: makeCat('stretch', 'Stretch'),
    precision: makeCat('precision', 'Precision'),
    absorption: makeCat('absorption', 'Absorption'),
    destruction: makeCat('destruction', 'Destruction'),
  };

  stretch(cats.stretch, telemetry, config);
  precision(cats.precision, telemetry, config);
  absorption(cats.absorption, telemetry, config);
  destruction(cats.destruction, telemetry, config);

  const baseTotal = cats.stretch.score + cats.precision.score
    + cats.absorption.score + cats.destruction.score;

  const surv = survivalMultiplier(telemetry, config);

  const total = Math.round(baseTotal * surv.multiplier);

  const breakdown = [
    { ...cats.stretch },
    { ...cats.precision },
    { ...cats.absorption },
    { ...cats.destruction },
  ];

  // Add survival multiplier as a display row
  const survRow = {
    key: 'survival', label: 'Survival',
    score: total - baseTotal, // the bonus points from survival
    multiplier: surv.multiplier,
    survived: surv.survived,
    closestApproach: surv.closestApproach,
    timeNearHorizon: surv.timeNearHorizon,
  };
  breakdown.push(survRow);

  return {
    total,
    baseTotal,
    // No hard max — uncapped scoring. maxTotal is an estimate for UI display
    // (progress bars, etc). Set to a "reference excellent" score.
    maxTotal: 0,
    horizonRadius: config.horizonRadius,
    categories: {
      stretch: { ...cats.stretch },
      precision: { ...cats.precision },
      absorption: { ...cats.absorption },
      destruction: { ...cats.destruction },
    },
    survival: surv,
    breakdown,
  };
}
