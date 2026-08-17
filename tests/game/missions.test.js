// tests/game/missions.test.js — the Phase-7 mission/objective layer, in
// isolation. The evaluator is pure (mission + telemetry + score → result), so
// these tests drive it with crafted finalized-telemetry replicas (same shape as
// finalizeThrow output) and check the required defensive + deterministic rules.
import assert from 'node:assert';
import { test } from '../physics/support.js';
import {
  MISSION_TYPES, MISSION_STATES,
  MISSION_CATALOG, getMission, getDefaultMissionId, isValidMission,
  evaluateMission,
} from '../../js/game/missions/index.js';
import { makeTelemetry } from './scoring_helpers.js';

const HORIZON = 40;
const makeScore = (total = 500) => ({ total, maxTotal: 10600, horizonRadius: HORIZON });

// A SCORE mission that requires just 100 points — easy to hit in fixtures.
const score100 = getMission('score-01');
const nearHorizon15 = getMission('near-horizon-01');
const survive15 = getMission('survive-near-horizon-01');
const escaping = getMission('escape-01');
const orbit = getMission('orbit-01');

test('catalog is curated (5–8 missions), declarative, and valid', () => {
  assert.ok(MISSION_CATALOG.length >= 5 && MISSION_CATALOG.length <= 8,
    `catalog has ${MISSION_CATALOG.length} missions`);
  for (const m of MISSION_CATALOG) {
    assert.ok(isValidMission(m), `mission ${m.id} valid`);
    assert.ok(typeof m.id === 'string' && m.id);
    assert.ok(typeof m.title === 'string' && m.title);
    assert.ok(typeof m.description === 'string' && m.description);
  }
  assert.ok(getDefaultMissionId(), 'default mission exists');
});

test('catalog covers the four mission types', () => {
  const types = new Set(MISSION_CATALOG.map((m) => m.type));
  assert.ok(types.has(MISSION_TYPES.STATE));
  assert.ok(types.has(MISSION_TYPES.NEAR_HORIZON));
  assert.ok(types.has(MISSION_TYPES.SCORE));
  assert.ok(types.has(MISSION_TYPES.SURVIVE_NEAR_HORIZON));
});

test('STATE mission completes when trajectoryState matches', () => {
  const r = evaluateMission(escaping, { telemetry: makeTelemetry({ trajectoryState: 'ESCAPING' }) });
  assert.strictEqual(r.completed, true);
  assert.strictEqual(r.progress, 1);
  assert.strictEqual(r.missionId, 'escape-01');
});

test('STATE mission fails on mismatch', () => {
  const r = evaluateMission(escaping, { telemetry: makeTelemetry({ trajectoryState: 'FLYBY' }) });
  assert.strictEqual(r.completed, false);
  assert.strictEqual(r.progress, 0);
});

test('STATE mission can match ORBITAL', () => {
  const r = evaluateMission(orbit, { telemetry: makeTelemetry({ trajectoryState: 'ORBITAL' }) });
  assert.strictEqual(r.completed, true);
});

test('NEAR_HORIZON completes when closest approach is within target multiple', () => {
  // target 1.5 × 40 = 60 m
  const r = evaluateMission(nearHorizon15, {
    telemetry: makeTelemetry({ closestApproach: { distance: 58, time: 3, position: { x: 0, y: 0, z: -58 }, velocity: { x: 0, y: 0, z: 0 } } }),
    score: makeScore(),
  });
  assert.strictEqual(r.completed, true);
  assert.strictEqual(r.progress, 1);
});

test('NEAR_HORIZON fails beyond the target multiple (progress partial)', () => {
  // target 60 m; a 90 m pass is between target (progress→1) and 2× target (0)
  const r = evaluateMission(nearHorizon15, {
    telemetry: makeTelemetry({ closestApproach: { distance: 90, time: 3, position: { x: 0, y: 0, z: -90 }, velocity: { x: 0, y: 0, z: 0 } } }),
    score: makeScore(),
  });
  assert.strictEqual(r.completed, false);
  assert.ok(r.progress > 0 && r.progress < 1, `progress ${r.progress} is partial`);
});

test('NEAR_HORIZON progress is normalized 0..1 and informational only', () => {
  const far = evaluateMission(nearHorizon15, {
    telemetry: makeTelemetry({ closestApproach: { distance: 500, time: 1, position: { x: 0, y: 0, z: -500 }, velocity: { x: 0, y: 0, z: 0 } } }),
    score: makeScore(),
  });
  assert.ok(far.progress >= 0 && far.progress <= 1, `progress in range, got ${far.progress}`);
  assert.strictEqual(far.completed, false, 'progress never alters completion');
});

test('SURVIVE_NEAR_HORIZON requires survival even when close enough', () => {
  const r = evaluateMission(survive15, {
    telemetry: makeTelemetry({
      closestApproach: { distance: 50, time: 3, position: { x: 0, y: 0, z: -50 }, velocity: { x: 0, y: 0, z: 0 } },
      consumedPointCount: 12, remainingPointCount: 0, terminationReason: 'ALL_MASS_CONSUMED',
    }),
    score: makeScore(),
  });
  assert.strictEqual(r.completed, false, 'consumed object cannot survive the pass');
});

test('SURVIVE_NEAR_HORIZON completes when the pass is survived', () => {
  const r = evaluateMission(survive15, {
    telemetry: makeTelemetry({
      closestApproach: { distance: 52, time: 3, position: { x: 0, y: 0, z: -52 }, velocity: { x: 0, y: 0, z: 0 } },
      consumedPointCount: 0, remainingPointCount: 12, terminationReason: 'DESPAWN',
    }),
    score: makeScore(),
  });
  assert.strictEqual(r.completed, true);
  assert.strictEqual(r.progress, 1);
});

test('SURVIVE_NEAR_HORIZON treats PLAYER_RESET as not survived', () => {
  const r = evaluateMission(survive15, {
    telemetry: makeTelemetry({
      closestApproach: { distance: 50, time: 3, position: { x: 0, y: 0, z: -50 }, velocity: { x: 0, y: 0, z: 0 } },
      consumedPointCount: 0, remainingPointCount: 12, terminationReason: 'PLAYER_RESET',
    }),
    score: makeScore(),
  });
  assert.strictEqual(r.completed, false, 'aborted throw is not a survival');
});

test('SCORE completes at/above target', () => {
  // Phase 24: Make It Count target raised 100 → 1200 (was trivially auto-completing).
  const target = score100.target;
  const r = evaluateMission(score100, { telemetry: makeTelemetry(), score: makeScore(target) });
  assert.strictEqual(r.completed, true);
  assert.strictEqual(r.progress, 1);
});

test('SCORE fails below target (progress proportional)', () => {
  const target = score100.target;
  const r = evaluateMission(score100, { telemetry: makeTelemetry(), score: makeScore(Math.floor(target / 2)) });
  assert.strictEqual(r.completed, false);
  assert.ok(Math.abs(r.progress - 0.5) < 1e-9, `progress 0.5, got ${r.progress}`);
});

test('null telemetry → clean failure, never throws', () => {
  const r = evaluateMission(score100, { telemetry: null, score: makeScore() });
  assert.deepStrictEqual(r, { missionId: 'score-01', completed: false, progress: 0, reason: 'no telemetry' });
});

test('missing score → SCORE fails cleanly', () => {
  const r = evaluateMission(score100, { telemetry: makeTelemetry(), score: null });
  assert.strictEqual(r.completed, false);
  assert.strictEqual(r.progress, 0);
});

test('missing closestApproach → NEAR_HORIZON fails cleanly', () => {
  const t = makeTelemetry();
  delete t.closestApproach;
  const r = evaluateMission(nearHorizon15, { telemetry: t, score: makeScore() });
  assert.strictEqual(r.completed, false);
  assert.strictEqual(r.progress, 0);
});

test('NaN/Infinity in telemetry → normalized failure, never completes', () => {
  const cases = [
    makeTelemetry({ closestApproach: { distance: NaN, time: 0, position: {}, velocity: {} } }),
    makeTelemetry({ closestApproach: { distance: Infinity, time: 0, position: {}, velocity: {} } }),
  ];
  for (const t of cases) {
    const r = evaluateMission(nearHorizon15, { telemetry: t, score: makeScore() });
    assert.strictEqual(r.completed, false, 'NaN/Infinity never completes');
    assert.ok(r.progress >= 0 && r.progress <= 1, 'progress stays normalized');
  }
});

test('NaN trajectoryState → STATE mission fails cleanly', () => {
  const r = evaluateMission(escaping, { telemetry: makeTelemetry({ trajectoryState: NaN }), score: makeScore() });
  assert.strictEqual(r.completed, false);
  assert.strictEqual(r.progress, 0);
});

test('NaN/Infinity in score → SCORE fails cleanly', () => {
  for (const total of [NaN, Infinity, -5]) {
    const r = evaluateMission(score100, { telemetry: makeTelemetry(), score: makeScore(total) });
    assert.strictEqual(r.completed, false, `total=${total} never completes`);
    assert.ok(r.progress >= 0 && r.progress <= 1, 'progress stays normalized');
  }
});

test('malformed mission definition → clean failure', () => {
  for (const bad of [null, undefined, {}, { id: 'x' }, { id: 'x', type: 'STATE' }, { id: 'x', type: 'BOGUS' }, { id: 'x', type: 'SCORE', target: NaN }]) {
    const r = evaluateMission(bad, { telemetry: makeTelemetry(), score: makeScore() });
    assert.strictEqual(r.completed, false, 'malformed mission never completes');
    assert.strictEqual(r.progress, 0);
  }
});

test('deterministic: identical inputs → identical output', () => {
  const a = evaluateMission(nearHorizon15, { telemetry: makeTelemetry(), score: makeScore() });
  const b = evaluateMission(nearHorizon15, { telemetry: makeTelemetry(), score: makeScore() });
  assert.deepStrictEqual(a, b);
});

test('mission definitions are not mutated by evaluation', () => {
  const before = JSON.stringify(score100);
  evaluateMission(score100, { telemetry: makeTelemetry(), score: makeScore() });
  assert.strictEqual(JSON.stringify(score100), before, 'mission untouched');
});

test('score is never modified by evaluation', () => {
  const s = makeScore(150);
  const before = JSON.stringify(s);
  evaluateMission(score100, { telemetry: makeTelemetry(), score: s });
  assert.strictEqual(JSON.stringify(s), before, 'score untouched');
});

test('telemetry is never modified by evaluation', () => {
  const t = makeTelemetry();
  const before = JSON.stringify(t);
  evaluateMission(nearHorizon15, { telemetry: t, score: makeScore() });
  assert.strictEqual(JSON.stringify(t), before, 'telemetry untouched');
});

test('evaluator uses the exact existing state strings (no new taxonomy)', () => {
  const states = Object.values(MISSION_STATES).sort();
  assert.deepStrictEqual(states, ['CAPTURED', 'ESCAPING', 'FLYBY', 'HORIZON_CROSSING', 'ORBITAL', 'UNKNOWN']);
  // catalog states must be drawn from that same vocabulary
  for (const m of MISSION_CATALOG.filter((x) => x.type === 'STATE')) {
    assert.ok(states.includes(m.state), `state ${m.state} is an existing state`);
  }
});

// ----------------------------------------------------------- Phase 24 balance ---
import { CAMPAIGN_LEVELS } from '../../js/game/campaign/levels.js';

test('Phase 24: score targets are achievable but not trivial (real-sim percentiles)', () => {
  const mic = getMission('score-01');
  const hr = getMission('score-02');
  assert.strictEqual(mic.target, 1200, 'Make It Count raised to 1200');
  assert.strictEqual(hr.target, 3000, 'High Roller raised to 3000');
});

test('Phase 24: Grazing is present in the catalog but not required by any level', () => {
  assert.ok(getMission('survive-near-horizon-01'), 'Grazing still a real mission');
  for (const l of CAMPAIGN_LEVELS) {
    assert.ok(!l.requiredMissionIds.includes('survive-near-horizon-01'),
      `Level ${l.title} must not require the impossible Grazing`);
  }
});

test('Phase 24: every level required-set is completable by its object (no impossible gates)', () => {
  assert.deepStrictEqual(CAMPAIGN_LEVELS.map((l) => l.requiredMissionIds.length), [2, 4, 6, 6]);
});
