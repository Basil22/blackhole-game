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

const score500 = getMission('score-01');
const nearHorizon20 = getMission('near-horizon-01');
const nearHorizon15 = getMission('near-horizon-02');
const escaping = getMission('escape-01');
const orbit = getMission('orbit-01');
const tear01 = getMission('tear-01');
const stretch01 = getMission('stretch-01');

test('catalog is curated (10–15 missions), declarative, and valid', () => {
  assert.ok(MISSION_CATALOG.length >= 10 && MISSION_CATALOG.length <= 15,
    `catalog has ${MISSION_CATALOG.length} missions`);
  for (const m of MISSION_CATALOG) {
    assert.ok(isValidMission(m), `mission ${m.id} valid`);
    assert.ok(typeof m.id === 'string' && m.id);
    assert.ok(typeof m.title === 'string' && m.title);
    assert.ok(typeof m.description === 'string' && m.description);
  }
  assert.ok(getDefaultMissionId(), 'default mission exists');
});

test('catalog covers all mission types in use', () => {
  const types = new Set(MISSION_CATALOG.map((m) => m.type));
  assert.ok(types.has(MISSION_TYPES.STATE));
  assert.ok(types.has(MISSION_TYPES.NEAR_HORIZON));
  assert.ok(types.has(MISSION_TYPES.SCORE));
  assert.ok(types.has(MISSION_TYPES.TEAR_COUNT));
  assert.ok(types.has(MISSION_TYPES.STRETCH));
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
  // nearHorizon20: target 2.0 × 40 = 80 m
  const r = evaluateMission(nearHorizon20, {
    telemetry: makeTelemetry({ closestApproach: { distance: 75, time: 3, position: { x: 0, y: 0, z: -75 }, velocity: { x: 0, y: 0, z: 0 } } }),
    score: makeScore(),
  });
  assert.strictEqual(r.completed, true);
  assert.strictEqual(r.progress, 1);
});

test('NEAR_HORIZON fails beyond the target multiple (progress partial)', () => {
  // nearHorizon15: target 1.5 × 40 = 60 m; a 90 m pass fails
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

test('TEAR_COUNT completes when enough tears', () => {
  const r = evaluateMission(tear01, {
    telemetry: makeTelemetry({ tearCount: 3 }),
  });
  assert.strictEqual(r.completed, true);
  assert.strictEqual(r.progress, 1);
});

test('TEAR_COUNT fails below target (progress proportional)', () => {
  const r = evaluateMission(tear01, {
    telemetry: makeTelemetry({ tearCount: 0 }),
  });
  assert.strictEqual(r.completed, false);
  assert.strictEqual(r.progress, 0);
});

test('STRETCH completes when enough stretch', () => {
  const r = evaluateMission(stretch01, {
    telemetry: makeTelemetry({ maximumStretch: 2.5 }),
  });
  assert.strictEqual(r.completed, true);
  assert.strictEqual(r.progress, 1);
});

test('STRETCH fails below target (progress proportional)', () => {
  const r = evaluateMission(stretch01, {
    telemetry: makeTelemetry({ maximumStretch: 1.5 }),
  });
  assert.strictEqual(r.completed, false);
  assert.ok(r.progress > 0 && r.progress < 1, `progress ${r.progress} is partial`);
});

test('SCORE completes at/above target', () => {
  const target = score500.target;
  const r = evaluateMission(score500, { telemetry: makeTelemetry(), score: makeScore(target) });
  assert.strictEqual(r.completed, true);
  assert.strictEqual(r.progress, 1);
});

test('SCORE fails below target (progress proportional)', () => {
  const target = score500.target;
  const r = evaluateMission(score500, { telemetry: makeTelemetry(), score: makeScore(Math.floor(target / 2)) });
  assert.strictEqual(r.completed, false);
  assert.ok(Math.abs(r.progress - 0.5) < 1e-9, `progress 0.5, got ${r.progress}`);
});

test('null telemetry → clean failure, never throws', () => {
  const r = evaluateMission(score500, { telemetry: null, score: makeScore() });
  assert.deepStrictEqual(r, { missionId: 'score-01', completed: false, progress: 0, reason: 'no telemetry' });
});

test('missing score → SCORE fails cleanly', () => {
  const r = evaluateMission(score500, { telemetry: makeTelemetry(), score: null });
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
    const r = evaluateMission(score500, { telemetry: makeTelemetry(), score: makeScore(total) });
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
  const before = JSON.stringify(score500);
  evaluateMission(score500, { telemetry: makeTelemetry(), score: makeScore() });
  assert.strictEqual(JSON.stringify(score500), before, 'mission untouched');
});

test('score is never modified by evaluation', () => {
  const s = makeScore(150);
  const before = JSON.stringify(s);
  evaluateMission(score500, { telemetry: makeTelemetry(), score: s });
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

// ----------------------------------------------------------- balance checks ---
import { CAMPAIGN_LEVELS } from '../../js/game/campaign/levels.js';

test('score targets are progressive: 500 < 2000 < 4000', () => {
  const s1 = getMission('score-01');
  const s2 = getMission('score-02');
  const s3 = getMission('score-03');
  assert.strictEqual(s1.target, 500);
  assert.strictEqual(s2.target, 2000);
  assert.strictEqual(s3.target, 4000);
});

test('every level required mission exists in the catalog', () => {
  for (const l of CAMPAIGN_LEVELS) {
    for (const mid of l.requiredMissionIds) {
      assert.ok(getMission(mid), `Level ${l.title} requires ${mid} which must exist`);
    }
  }
});

test('level required-set sizes are reasonable (4-6 per level)', () => {
  for (const l of CAMPAIGN_LEVELS) {
    assert.ok(l.requiredMissionIds.length >= 4 && l.requiredMissionIds.length <= 6,
      `Level ${l.title} has ${l.requiredMissionIds.length} required missions`);
  }
});
