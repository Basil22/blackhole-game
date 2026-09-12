// game/presentation.test.js — pure presentation mapping: headlines, tones,
// distance/state formatting, and the "score is passed through, never
// recomputed" guarantee. Updated for V2 scoring categories.
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
  maxTotal: 0,
  horizonRadius: 40,
  breakdown: [
    { key: 'stretch', label: 'Stretch', score: 3180 },
    { key: 'precision', label: 'Precision', score: 5420 },
    { key: 'absorption', label: 'Absorption', score: 0 },
    { key: 'destruction', label: 'Destruction', score: 1200 },
    { key: 'survival', label: 'Survival', score: 2680 },
  ],
  ...over,
});

test('HORIZON consumption without tears/stretch -> Object Consumed (danger)', () => {
  const p = presentOutcome(tm({ terminationReason: 'HORIZON', consumedPointCount: 7, trajectoryState: 'HORIZON_CROSSING' }), sc());
  assert.deepStrictEqual(p, { headline: 'Object Consumed', tone: 'danger' });
});

test('consumption with extreme stretch -> Spaghettified (danger)', () => {
  const p = presentOutcome(tm({ terminationReason: 'ALL_MASS_CONSUMED', consumedPointCount: 31, maximumStretch: 6.2, tearCount: 9 }), sc());
  assert.deepStrictEqual(p, { headline: 'Spaghettified', tone: 'danger' });
});

test('consumption with tears (mild stretch) -> Ripped Apart (danger)', () => {
  const p = presentOutcome(tm({ terminationReason: 'ALL_MASS_CONSUMED', consumedPointCount: 31, maximumStretch: 1.4, tearCount: 4 }), sc());
  assert.deepStrictEqual(p, { headline: 'Ripped Apart', tone: 'danger' });
});

test('despawned orbit -> Orbital Insertion (special)', () => {
  const p = presentOutcome(tm({ terminationReason: 'DESPAWN', trajectoryState: 'ORBITAL' }), sc());
  assert.deepStrictEqual(p, { headline: 'Orbital Insertion', tone: 'special' });
});

test('despawned near miss close to horizon -> Critical Near Miss', () => {
  const p = presentOutcome(tm({ terminationReason: 'DESPAWN', trajectoryState: 'FLYBY', closestApproach: { ...tm().closestApproach, distance: 48 } }), sc());
  assert.strictEqual(p.headline, 'Critical Near Miss');
});

test('despawned escaping far out -> Clean Escape (success)', () => {
  const p = presentOutcome(tm({ terminationReason: 'DESPAWN', trajectoryState: 'ESCAPING', closestApproach: { ...tm().closestApproach, distance: 300 } }), sc());
  assert.deepStrictEqual(p, { headline: 'Clean Escape', tone: 'success' });
});

test('despawned flyby -> Survived The Pass (success)', () => {
  const p = presentOutcome(tm({ terminationReason: 'DESPAWN', trajectoryState: 'FLYBY', closestApproach: { ...tm().closestApproach, distance: 120 } }), sc());
  assert.deepStrictEqual(p, { headline: 'Survived The Pass', tone: 'success' });
});

test('player reset -> Throw Aborted (neutral)', () => {
  const p = presentOutcome(tm({ terminationReason: 'PLAYER_RESET' }), sc());
  assert.deepStrictEqual(p, { headline: 'Throw Aborted', tone: 'neutral' });
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
  assert.strictEqual(formatState('HORIZON_CROSSING'), 'Horizon Crossing');
  assert.strictEqual(formatState('ORBITAL'), 'Orbital');
});

test('presentResult passes the score through verbatim -- never recomputed', () => {
  const telemetry = tm({ terminationReason: 'ALL_MASS_CONSUMED', consumedPointCount: 31, maximumStretch: 3 });
  const score = sc();
  const p = presentResult(telemetry, score);
  assert.strictEqual(p.total, 12480);
  assert.strictEqual(p.maxTotal, 0);
  assert.strictEqual(p.headline, 'Spaghettified');
  // breakdown rows have annotations added
  assert.strictEqual(p.breakdown.length, score.breakdown.length);
  assert.strictEqual(p.breakdown[0].key, 'stretch');
  assert.strictEqual(p.breakdown[0].score, 3180);
});

test('presentResult is NaN-proof and never invents numbers', () => {
  const p = presentResult(tm(), { total: NaN, maxTotal: undefined, breakdown: null });
  assert.strictEqual(p.total, 0);
  assert.strictEqual(p.maxTotal, 0);
  assert.deepStrictEqual(p.breakdown, []);
});
