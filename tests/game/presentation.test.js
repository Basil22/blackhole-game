// game/presentation.test.js — pure presentation mapping: headlines, tones,
// distance/state formatting, and the "score is passed through, never
// recomputed" guarantee.
import assert from 'node:assert';
import { test } from '../physics/support.js';
import {
  presentOutcome, presentResult, formatDistance, formatState, stateTone,
} from '../../js/game/presentation.js';

// minimal finalized telemetry + score shapes
const tm = (over) => ({
  terminationReason: 'DESPAWN',
  trajectoryState: 'ESCAPING',
  consumedPointCount: 0,
  maximumStretch: 1,
  tearCount: 0,
  closestApproach: { distance: 300, time: 5, position: { x: 0, y: 0, z: -300 }, velocity: { x: 0, y: 0, z: 0 } },
  ...over,
});
const sc = (over = {}) => ({
  total: 12480,
  maxTotal: 11400,
  horizonRadius: 40,
  breakdown: [
    { key: 'precision', label: 'PRECISION', score: 5420 },
    { key: 'tidal', label: 'TIDAL', score: 3180 },
    { key: 'destruction', label: 'DESTRUCTION', score: 1200 },
    { key: 'survival', label: 'SURVIVAL', score: 2680 },
    { key: 'orbital', label: 'ORBITAL', score: 0 },
    { key: 'nearHorizonSurvival', label: 'NEAR-HORIZON SURVIVAL', score: 0 },
    { key: 'escapeSurvival', label: 'HARD-WON ESCAPE', score: 0 },
  ],
  ...over,
});

test('HORIZON consumption without tears/stretch → OBJECT CONSUMED (danger)', () => {
  const p = presentOutcome(tm({ terminationReason: 'HORIZON', consumedPointCount: 7, trajectoryState: 'HORIZON_CROSSING' }), sc());
  assert.deepStrictEqual(p, { headline: 'OBJECT CONSUMED', tone: 'danger' });
});

test('consumption with extreme stretch → SPAGHETTIFIED (danger)', () => {
  const p = presentOutcome(tm({ terminationReason: 'ALL_MASS_CONSUMED', consumedPointCount: 31, maximumStretch: 6.2, tearCount: 9 }), sc());
  assert.deepStrictEqual(p, { headline: 'SPAGHETTIFIED', tone: 'danger' });
});

test('consumption with tears (mild stretch) → RIPPED APART (danger)', () => {
  const p = presentOutcome(tm({ terminationReason: 'ALL_MASS_CONSUMED', consumedPointCount: 31, maximumStretch: 1.4, tearCount: 4 }), sc());
  assert.deepStrictEqual(p, { headline: 'RIPPED APART', tone: 'danger' });
});

test('despawned orbit → ORBITAL INSERTION (special)', () => {
  const p = presentOutcome(tm({ terminationReason: 'DESPAWN', trajectoryState: 'ORBITAL' }), sc());
  assert.deepStrictEqual(p, { headline: 'ORBITAL INSERTION', tone: 'special' });
});

test('despawned near miss close to horizon → CRITICAL NEAR MISS', () => {
  const p = presentOutcome(tm({ terminationReason: 'DESPAWN', trajectoryState: 'FLYBY', closestApproach: { ...tm().closestApproach, distance: 48 } }), sc());
  assert.strictEqual(p.headline, 'CRITICAL NEAR MISS');
});

test('despawned escaping far out → CLEAN ESCAPE (success)', () => {
  const p = presentOutcome(tm({ terminationReason: 'DESPAWN', trajectoryState: 'ESCAPING', closestApproach: { ...tm().closestApproach, distance: 300 } }), sc());
  assert.deepStrictEqual(p, { headline: 'CLEAN ESCAPE', tone: 'success' });
});

test('despawned flyby → SURVIVED THE PASS (success)', () => {
  const p = presentOutcome(tm({ terminationReason: 'DESPAWN', trajectoryState: 'FLYBY', closestApproach: { ...tm().closestApproach, distance: 120 } }), sc());
  assert.deepStrictEqual(p, { headline: 'SURVIVED THE PASS', tone: 'success' });
});

test('player reset → THROW ABORTED (neutral)', () => {
  const p = presentOutcome(tm({ terminationReason: 'PLAYER_RESET' }), sc());
  assert.deepStrictEqual(p, { headline: 'THROW ABORTED', tone: 'neutral' });
});

test('state tones for the aiming HUD', () => {
  assert.strictEqual(stateTone('ESCAPING'), 'success');
  assert.strictEqual(stateTone('FLYBY'), 'success');
  assert.strictEqual(stateTone('ORBITAL'), 'special');
  assert.strictEqual(stateTone('CAPTURED'), 'danger');
  assert.strictEqual(stateTone('HORIZON_CROSSING'), 'danger');
  assert.strictEqual(stateTone('UNKNOWN'), 'neutral');
});

test('distance + state formatting are human-readable', () => {
  assert.strictEqual(formatDistance(47.283917), '47 m');
  assert.strictEqual(formatDistance(90.49), '90 m');
  assert.strictEqual(formatDistance(1234.5), '1.2 km');
  assert.strictEqual(formatDistance(0), '0 m');
  assert.strictEqual(formatDistance(NaN), '0 m');
  assert.strictEqual(formatState('HORIZON_CROSSING'), 'HORIZON CROSSING');
  assert.strictEqual(formatState('ORBITAL'), 'ORBITAL');
});

test('presentResult passes the score through verbatim — never recomputed', () => {
  const telemetry = tm({ terminationReason: 'ALL_MASS_CONSUMED', consumedPointCount: 31, maximumStretch: 3 });
  const score = sc();
  const p = presentResult(telemetry, score);
  assert.strictEqual(p.total, 12480);
  assert.strictEqual(p.maxTotal, 11400);
  assert.strictEqual(p.headline, 'SPAGHETTIFIED');
  // breakdown rows mirror the scorer's own numbers, key by key
  assert.deepStrictEqual(p.breakdown, score.breakdown.map((r) => ({ key: r.key, label: r.label, score: r.score })));
  assert.strictEqual(p.breakdown[0].score, 5420);
  assert.strictEqual(p.breakdown[4].key, 'orbital');
});

test('presentResult is NaN-proof and never invents numbers', () => {
  const p = presentResult(tm(), { total: NaN, maxTotal: undefined, breakdown: null });
  assert.strictEqual(p.total, 0);
  assert.strictEqual(p.maxTotal, 0);
  assert.deepStrictEqual(p.breakdown, []);
});