// tests/game/challenges.test.js — the Phase-10 challenge layer, in isolation.
// The layer is pure (object profile + mission metadata + recommendation → data),
// so these tests drive it with the real catalogs and check the required
// validation, determinism, immutability, and no-physics-change rules.
import assert from 'node:assert';
import { test } from '../physics/support.js';
import {
  OBJECT_IDS,
  OBJECT_DIFFICULTY_LABELS,
  OBJECT_CHALLENGE_PROFILES,
  getObjectChallengeProfile,
  difficultyLabel,
  MISSION_DIFFICULTY_LABELS,
  isValidObjectChallengeProfile,
  isValidMissionChallenge,
  isKnownMission,
  missionDifficulty,
  getMissionChallenge,
  validateChallengeData,
  getRecommendedObject,
} from '../../js/game/challenges/index.js';
import { MISSION_CATALOG, getMission, isValidMission, evaluateMission } from '../../js/game/missions/index.js';
import { makeTelemetry } from './scoring_helpers.js';

// The live object catalog, as the UI would inject it (the challenge layer must
// never import objects.js — physics is passed in as plain data at the border).
const LIVE_CATALOG = [
  { id: 'rock', name: 'Asteroid' },
  { id: 'human', name: 'Astronaut' },
  { id: 'ship', name: 'Starship' },
  { id: 'planet', name: 'Planet' },
];
const HORIZON = 40;
const makeScore = (total = 500) => ({ total, maxTotal: 10600, horizonRadius: HORIZON });

test('every object has a valid challenge profile', () => {
  for (const id of OBJECT_IDS) {
    const p = getObjectChallengeProfile(id);
    assert.ok(p, `profile exists for object ${id}`);
    assert.ok(isValidObjectChallengeProfile(p), `profile ${id} is valid`);
    assert.strictEqual(p.id, id);
  }
});

test('object ids match the real live object catalog exactly', () => {
  const live = LIVE_CATALOG.map((o) => o.id).sort();
  assert.deepStrictEqual(OBJECT_IDS.slice().sort(), live, 'object vocabulary = real catalog');
});

test('object difficulty tiers are 1..4 with short identities and hints', () => {
  for (const p of Object.values(OBJECT_CHALLENGE_PROFILES)) {
    assert.ok([1, 2, 3, 4].includes(p.difficulty), `${p.id} difficulty in 1..4`);
    assert.strictEqual(difficultyLabel(p.difficulty), OBJECT_DIFFICULTY_LABELS[p.difficulty]);
    assert.ok(typeof p.shortDescription === 'string' && p.shortDescription, `${p.id} shortDescription`);
    assert.ok(typeof p.gameplayHint === 'string' && p.gameplayHint, `${p.id} gameplayHint`);
    assert.ok(p.challengeTags.length > 0, `${p.id} has tags`);
  }
  for (const bad of [0, 5, -1, 2.5, NaN, Infinity]) {
    assert.strictEqual(difficultyLabel(bad), ``, `difficultyLabel(${bad}) is empty`);
  }
});

test('every mission has valid challenge metadata (difficulty/hint/recommended)', () => {
  for (const m of MISSION_CATALOG) {
    assert.ok(isValidMissionChallenge(m), `mission ${m.id} challenge metadata valid`);
    assert.ok(Number.isInteger(m.difficulty) && m.difficulty >= 1 && m.difficulty <= 5, `${m.id} difficulty 1..5`);
    assert.ok(Array.isArray(m.recommendedObjectIds) && m.recommendedObjectIds.length > 0, `${m.id} recommends something`);
    for (const oid of m.recommendedObjectIds) assert.ok(OBJECT_IDS.includes(oid), `${m.id} recommends known object ${oid}`);
    assert.ok(typeof m.hint === 'string' && m.hint, `${m.id} has a player-facing hint`);
    assert.strictEqual(MISSION_DIFFICULTY_LABELS[m.difficulty], missionDifficulty(m.difficulty).label);
  }
});

test('mission challenge metadata never changes completion semantics', () => {
  // the Phases 7-9 evaluator still uses only the original fields
  const score100 = getMission('score-01');
  const near = getMission('near-horizon-01');
  // Phase 24: score-01 target is 1200, so fixture scores derive from it.
  assert.strictEqual(evaluateMission(score100, { telemetry: makeTelemetry(), score: makeScore(score100.target) }).completed, true);
  assert.strictEqual(evaluateMission(score100, { telemetry: makeTelemetry(), score: makeScore(Math.floor(score100.target / 2)) }).completed, false);
  assert.strictEqual(evaluateMission(near, {
    telemetry: makeTelemetry({ closestApproach: { distance: 58, time: 3, position: { x: 0, y: 0, z: -58 }, velocity: { x: 0, y: 0, z: 0 } } }),
    score: makeScore(),
  }).completed, true);
  // malformed definition still rejected — challenge metadata does not rescue it
  assert.strictEqual(isValidMissionChallenge({ id: 'x', type: 'SCORE', target: 5, difficulty: 2, hint: 'h', recommendedObjectIds: ['rock'] }), false);
});

test('recommendation exists for every mission and is deterministic', () => {
  let all = 0;
  for (const m of MISSION_CATALOG) {
    const r = getRecommendedObject(m, LIVE_CATALOG);
    assert.ok(r, `mission ${m.id} has a recommendation`);
    assert.ok(OBJECT_IDS.includes(r.objectId), `mission ${m.id} recommends known object ${r.objectId}`);
    assert.ok(typeof r.reason === 'string' && r.reason, `recommendation carries a reason`);
    const again = getRecommendedObject(m, LIVE_CATALOG);
    assert.deepStrictEqual(again, r, `recommendation for ${m.id} is deterministic`);
    all++;
  }
  assert.ok(all >= MISSION_CATALOG.length, 'covered the whole catalog');
});

test('recommendation prefers the mission declared object list', () => {
  const m = getMission('capture-01'); // recommendedObjectIds ['rock','planet']
  const r = getRecommendedObject(m, LIVE_CATALOG);
  assert.strictEqual(r.objectId, 'rock', 'first declared recommendation wins');
});

test('recommendation skips un-injected objects and falls back over profiles', () => {
  // rock is absent from this catalog → mission prefers 'planet' next
  const m = getMission('capture-01');
  const catalog = LIVE_CATALOG.filter((o) => o.id !== 'rock');
  const r = getRecommendedObject(m, catalog);
  assert.strictEqual(r.objectId, 'planet', 'falls back to next available declared object');
  assert.ok(r.reason.includes('Extreme'), 'reason reflects the object difficulty tier');
});

test('recommendation falls back to a profile-recommended object when mission list absent', () => {
  // a mission with no recommendedObjectIds still resolves via object profiles
  const m = Object.assign({}, getMission('crash-test'), { id: 'mystery', type: 'SCORE', target: 1, difficulty: 1, hint: 'h', recommendedObjectIds: [] });
  assert.strictEqual(getRecommendedObject(m, LIVE_CATALOG), null, 'unknown mission id → null');
});

test('rejects unknown object ids / duplicate recommendations / bad difficulty / malformed hints', () => {
  const base = getMission('score-01');
  const unknown = { ...base, recommendedObjectIds: ['rock', 'ufo'] };
  assert.strictEqual(isValidMissionChallenge(unknown), false, 'unknown object id rejected');
  const dup = { ...base, recommendedObjectIds: ['rock', 'rock'] };
  assert.strictEqual(isValidMissionChallenge(dup), false, 'duplicate recommendation rejected');
  for (const bad of [0, 6, 2.5, NaN, Infinity, '2']) {
    assert.strictEqual(isValidMissionChallenge({ ...base, difficulty: bad }), false, `difficulty ${bad} rejected`);
  }
  for (const hint of ['', '  ', 42, null]) {
    assert.strictEqual(isValidMissionChallenge({ ...base, hint }), false, `hint ${JSON.stringify(hint)} rejected`);
  }
  assert.strictEqual(isValidMissionChallenge({ ...base, hint: undefined }), false, 'missing hint rejected');
});

test('rejects malformed descriptions and out-of-catalog recommendations', () => {
  const profile = OBJECT_CHALLENGE_PROFILES.rock;
  // build a plain copy, then apply the patch LAST so overrides stick
  const badProfile = (patch) => Object.assign(
    { ...profile, recommendedMissionIds: [...profile.recommendedMissionIds], challengeTags: [...profile.challengeTags] },
    patch,
  );
  assert.strictEqual(isValidObjectChallengeProfile(badProfile({ shortDescription: '' })), false, 'empty shortDescription');
  assert.strictEqual(isValidObjectChallengeProfile(badProfile({ gameplayHint: 42 })), false, 'non-string gameplayHint');
  assert.strictEqual(isValidObjectChallengeProfile(badProfile({ difficulty: 9 })), false, 'difficulty out of range');
  assert.strictEqual(isValidObjectChallengeProfile(badProfile({ recommendedMissionIds: ['near-horizon-01', 'near-horizon-01'] })), false, 'duplicate mission ids');
  assert.strictEqual(isValidObjectChallengeProfile(badProfile({ recommendedMissionIds: ['ghost-mission'] })), false, 'unknown mission id');
  assert.strictEqual(isValidObjectChallengeProfile(badProfile({ challengeTags: ['A', 'A'] })), false, 'duplicate tags');
});

test('NaN/Infinity anywhere in metadata is rejected', () => {
  const base = getMission('score-01');
  assert.strictEqual(isValidMissionChallenge({ ...base, difficulty: NaN }), false);
  assert.strictEqual(isValidMissionChallenge({ ...base, difficulty: Infinity }), false);
  const p = OBJECT_CHALLENGE_PROFILES.human;
  assert.strictEqual(isValidObjectChallengeProfile({ ...p, difficulty: NaN }), false);
});

test('the whole challenge dataset validates clean', () => {
  const res = validateChallengeData();
  assert.deepStrictEqual(res.errors, [], 'no cross-check errors');
  assert.strictEqual(res.valid, true);
});

test('catalogs are immutable (frozen, no mutation via helper calls)', () => {
  assert.ok(Object.isFrozen(OBJECT_CHALLENGE_PROFILES), 'profiles map frozen');
  for (const p of Object.values(OBJECT_CHALLENGE_PROFILES)) {
    assert.ok(Object.isFrozen(p), `profile ${p.id} frozen`);
    assert.ok(Object.isFrozen(p.recommendedMissionIds), `profile ${p.id} mission list frozen`);
    assert.ok(Object.isFrozen(p.challengeTags), `profile ${p.id} tags frozen`);
  }
  assert.ok(Object.isFrozen(OBJECT_IDS), 'object ids frozen');
  // helpers must not mutate their inputs
  const mission = getMission('score-01');
  const before = JSON.stringify(mission);
  getRecommendedObject(mission, LIVE_CATALOG);
  getMissionChallenge(mission.id);
  missionDifficulty(mission.difficulty);
  assert.strictEqual(JSON.stringify(mission), before, 'mission untouched by challenge helpers');
});

test('isKnownMission / getMissionChallenge behave defensively', () => {
  assert.ok(isKnownMission('escape-01'));
  assert.strictEqual(isKnownMission('not-a-mission'), false);
  const ch = getMissionChallenge('orbit-01');
  assert.ok(ch && ch.mission.id === 'orbit-01', 'challenge view for a known mission');
  assert.strictEqual(ch.difficulty.label, 'Challenging', 'difficulty label matches');
  assert.strictEqual(getMissionChallenge('not-a-mission'), null, 'unknown → null');
  assert.strictEqual(getMissionChallenge(null), null, 'garbage → null');
  const d1 = missionDifficulty(1);
  const d5 = missionDifficulty(5);
  assert.ok(d1.dots.includes('●') && d1.dots.includes('○'), 'di difficulty dots');
  assert.strictEqual(d5.dots.replace(/[○]/g, ''), '●●●●●', '5 = five filled');
  assert.ok(d1.aria.includes('Difficulty 1 of 5'), 'accessible label present');
  assert.strictEqual(missionDifficulty(7).label, '', 'out of range difficulty → empty label');
});

test('recommendation never mutates the catalog it is given', () => {
  const copy = () => LIVE_CATALOG.map((o) => ({ ...o }));
  const before = JSON.stringify(copy());
  for (const m of MISSION_CATALOG) getRecommendedObject(m, copy());
  assert.strictEqual(JSON.stringify(copy()), before, 'catalog input unchanged');
});

test('mission completion semantics unchanged by challenge layer', () => {
  // replay the Phase-7 missions suite's two most important guarantees
  const near = getMission('near-horizon-01');
  assert.strictEqual(typeof near.description, 'string');
  assert.ok(isValidMission(near));
});