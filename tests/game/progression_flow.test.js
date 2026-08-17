// tests/game/progression_flow.test.js — the Phase-9 mission-outcome plan (the
// pure layer that decides what the result panel SAYS: status, tone, and the
// progression/unlock line). Driven with crafted mission + missionResult +
// completeOutcome triples that mirror the real main.js protocol.
import assert from 'node:assert';
import { test } from '../physics/support.js';
import { missionFlow, completeMission, createInitialProgressionState, MISSION_ORDER, normalizeProgressionState } from '../../js/game/progression/index.js';
import { getMission } from '../../js/game/missions/index.js';

const NEAR = getMission('near-horizon-01');
const ESCAPE = getMission('escape-01');
const FINAL = getMission('score-02');

// A completeOutcome exactly as completeMission() + Progression.complete return it.
const outcome = (changed, unlockedMissionId) => ({ changed, unlockedMissionId });
const ok = (mission = NEAR) => ({ missionId: mission.id, completed: true, progress: 1, reason: 'ok' });
const failRes = (mission = NEAR) => ({ missionId: mission.id, completed: false, progress: 0, reason: 'nope' });

test('failed mission → MISSION FAILED, never unlocks or shows progression', () => {
  const plan = missionFlow({ mission: NEAR, missionResult: failRes(), alreadyCompleted: false, completeOutcome: null, campaignComplete: false });
  assert.strictEqual(plan.status, 'MISSION FAILED');
  assert.strictEqual(plan.tone, 'fail');
  assert.strictEqual(plan.completed, false);
  assert.strictEqual(plan.progression, null);
});

test('mission completion displays the correct unlock (from unlockedMissionId, not indexes)', () => {
  // first mission done → progression unlocks escape-01 (Breaking Free)
  const plan = missionFlow({ mission: NEAR, missionResult: ok(), alreadyCompleted: false, completeOutcome: outcome(true, 'escape-01'), campaignComplete: false });
  assert.strictEqual(plan.status, 'MISSION COMPLETE');
  assert.strictEqual(plan.tone, 'done');
  assert.strictEqual(plan.progression.kicker, 'NEXT MISSION');
  assert.strictEqual(plan.progression.title, 'Break Free');
  assert.strictEqual(plan.progression.tone, 'unlock');
});

test('unlock title resolves through the catalog, never a raw id', () => {
  const plan = missionFlow({ mission: getMission('capture-01'), missionResult: ok(getMission('capture-01')), alreadyCompleted: false, completeOutcome: outcome(true, 'survive-near-horizon-01'), campaignComplete: false });
  assert.strictEqual(plan.progression.title, 'Grazing the Void');
});

test('replay of a completed mission → MISSION ALREADY COMPLETED, no progression line', () => {
  const plan = missionFlow({ mission: NEAR, missionResult: ok(), alreadyCompleted: true, completeOutcome: outcome(false, null), campaignComplete: false });
  assert.strictEqual(plan.status, 'MISSION ALREADY COMPLETED');
  assert.strictEqual(plan.tone, 'already');
  assert.strictEqual(plan.replay, true);
  assert.strictEqual(plan.progression, null);
});

test('replay does not advance progression (pure semantics preserved)', () => {
  let s = createInitialProgressionState();
  const a = completeMission(s, 'near-horizon-01');
  s = a.state;
  const replay = completeMission(s, 'near-horizon-01');
  assert.strictEqual(replay.state, s, 'replay is a no-op');
  assert.strictEqual(replay.unlockedMissionId, null);
});

test('completed-with-unlock shows exactly one unlock line (no stale titles)', () => {
  const plan = missionFlow({ mission: ESCAPE, missionResult: ok(ESCAPE), alreadyCompleted: false, completeOutcome: outcome(true, 'capture-01'), campaignComplete: false });
  assert.strictEqual(plan.progression.title, 'Into the Abyss');
  const again = missionFlow({ mission: ESCAPE, missionResult: ok(ESCAPE), alreadyCompleted: true, completeOutcome: outcome(false, null), campaignComplete: false });
  assert.strictEqual(again.progression, null, 'next throw after replay loses the unlock line');
});

test('campaign completion displays the final plan', () => {
  const plan = missionFlow({ mission: FINAL, missionResult: ok(FINAL), alreadyCompleted: false, completeOutcome: outcome(true, null), campaignComplete: true });
  assert.strictEqual(plan.status, 'CAMPAIGN COMPLETE');
  assert.strictEqual(plan.tone, 'final');
  assert.strictEqual(plan.progression.kicker, 'CAMPAIGN');
  assert.strictEqual(plan.progression.title, '7 / 7 MISSIONS');
  assert.strictEqual(plan.progression.tagline, 'You conquered the black hole.');
});

test('campaign completion never unlocks a phantom mission', () => {
  const plan = missionFlow({ mission: FINAL, missionResult: ok(FINAL), alreadyCompleted: false, completeOutcome: outcome(true, null), campaignComplete: true });
  assert.strictEqual(plan.progression.tone, 'final');
  assert.ok(!('unlockedMissionId' in plan.progression), 'no unlock id anywhere in the plan');
});

test('campaign completion does not prevent further throws (replay after campaign)', () => {
  let s = createInitialProgressionState();
  for (const id of MISSION_ORDER) s = completeMission(s, id).state;
  assert.ok(s.campaignComplete);
  // any post-campaign playthrough is a no-op against the frozen semantics
  const again = completeMission(s, 'near-horizon-01');
  assert.strictEqual(again.state, s);
  assert.strictEqual(again.unlockedMissionId, null);
  const plan = missionFlow({ mission: NEAR, missionResult: ok(), alreadyCompleted: true, completeOutcome: outcome(false, null), campaignComplete: true });
  assert.strictEqual(plan.status, 'MISSION ALREADY COMPLETED');
  assert.strictEqual(plan.progression, null, 'no stale unlock after campaign');
});

test('a changed completion that unlocks nothing only happens on final (never mid-campaign fake)', () => {
  let s = completeMission(createInitialProgressionState(), 'escape-01'); // illegal: locked
  // locked completes are ignored entirely
  assert.strictEqual(s.state.currentMissionId, 'near-horizon-01');
});

test('unlock message vanishes on the next throw of a different mission (no stale state)', () => {
  const unlockPlan = missionFlow({ mission: NEAR, missionResult: ok(), alreadyCompleted: false, completeOutcome: outcome(true, 'escape-01'), campaignComplete: false });
  assert.ok(unlockPlan.progression);
  const nextThrow = missionFlow({ mission: ESCAPE, missionResult: failRes(ESCAPE), alreadyCompleted: false, completeOutcome: null, campaignComplete: false });
  assert.strictEqual(nextThrow.status, 'MISSION FAILED');
  assert.strictEqual(nextThrow.progression, null);
});

test('NaN/malformed inputs cannot break the planner (defensive collapse)', () => {
  for (const mission of [null, undefined, 5, 'x', { id: 'y' }, { id: 'z', title: 3, type: 'BOGUS' }]) {
    const plan = missionFlow({ mission, missionResult: ok(), alreadyCompleted: NaN, completeOutcome: outcome(NaN, NaN), campaignComplete: NaN });
    assert.strictEqual(plan.status, '', 'no mission → no status');
    assert.strictEqual(plan.tone, '');
    assert.strictEqual(plan.progression, null);
  }
  // malformed result + valid mission → clean failure
  for (const res of [null, undefined, {}, { completed: 'yes' }, { completed: NaN }]) {
    const plan = missionFlow({ mission: NEAR, missionResult: res, alreadyCompleted: false, completeOutcome: null, campaignComplete: false });
    assert.strictEqual(plan.status, 'MISSION FAILED');
    assert.strictEqual(plan.progression, null);
  }
});

test('planner never mutates its inputs', () => {
  const mission = getMission(MISSION_ORDER[0]);
  const res = ok();
  const oc = outcome(true, 'escape-01');
  const before = JSON.stringify([mission, res, oc]);
  missionFlow({ mission, missionResult: res, alreadyCompleted: false, completeOutcome: oc, campaignComplete: false });
  assert.strictEqual(JSON.stringify([mission, res, oc]), before);
});

test('every MISSION_ORDER mission produces a coherent first-completion plan', () => {
  for (const id of MISSION_ORDER) {
    const m = getMission(id);
    const plan = missionFlow({ mission: m, missionResult: ok(m), alreadyCompleted: false, completeOutcome: outcome(true, null), campaignComplete: false });
    assert.strictEqual(plan.completed, true, `${id} completed`);
    assert.strictEqual(plan.status, 'MISSION COMPLETE');
    assert.strictEqual(plan.progression, null, 'unlock only when unlockedMissionId present');
  }
});

test('replay flag drives ALREADY COMPLETED regardless of campaign state', () => {
  for (const campaignComplete of [false, true]) {
    const plan = missionFlow({ mission: NEAR, missionResult: ok(), alreadyCompleted: true, completeOutcome: outcome(false, null), campaignComplete });
    assert.strictEqual(plan.status, 'MISSION ALREADY COMPLETED', `campaignComplete=${campaignComplete}`);
  }
});

test('normalization never exposes garbage to the flow planner', () => {
  const s = normalizeProgressionState({ version: 1, currentMissionId: 'nope', unlockedMissionIds: ['nope'], completedMissionIds: [] });
  assert.deepStrictEqual(s, createInitialProgressionState());
  // planner works fine even if handed that normalized-initial state's campaign flag
  const plan = missionFlow({ mission: NEAR, missionResult: ok(), alreadyCompleted: false, completeOutcome: outcome(true, 'escape-01'), campaignComplete: s.campaignComplete });
  assert.strictEqual(plan.progression.title, 'Break Free');
});