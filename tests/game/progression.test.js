// tests/game/progression.test.js — the Phase-8 campaign-progression layer, in
// isolation. Pure state ops + normalization + storage + the Progression
// controller, all driven with plain data (never touches a real localStorage —
// a fake backend is injected where persistence itself is under test).
import assert from 'node:assert';
import { test } from '../physics/support.js';
import {
  PROGRESSION_VERSION,
  MISSION_ORDER,
  createInitialProgressionState,
  normalizeProgressionState,
  isMissionUnlocked,
  isMissionCompleted,
  isCampaignComplete,
  getCurrentMission,
  getNextMissionId,
  completeMission,
  selectMission,
  PROGRESSION_STORAGE_KEY,
  loadProgression,
  saveProgression,
  clearProgression,
  Progression,
} from '../../js/game/progression/index.js';
import { MISSION_CATALOG } from '../../js/game/missions/index.js';

const FIRST = 'near-horizon-01';
const SECOND = 'escape-01';
const FINAL = 'score-02';

test('initial state: only the first mission is unlocked and current', () => {
  const s = createInitialProgressionState();
  assert.strictEqual(s.version, PROGRESSION_VERSION);
  assert.strictEqual(s.currentMissionId, FIRST);
  assert.deepStrictEqual(s.unlockedMissionIds, [FIRST]);
  assert.deepStrictEqual(s.completedMissionIds, []);
  assert.strictEqual(s.lastCompletedMissionId, null);
  assert.strictEqual(s.campaignComplete, false);
  assert.ok(isMissionUnlocked(s, FIRST));
  assert.ok(!isMissionUnlocked(s, SECOND));
  assert.ok(!isCampaignComplete(s));
});

test('MISSION_ORDER has the exact 6 spec missions in order (Phase 24: Grazing optional)', () => {
  // Phase 24: survive-near-horizon-01 ("Grazing the Void") left the forced order —
  // real-sim shows it is physically unreachable near the horizon (binary horizon:
  // every ≤1.5×HR pass consumes; human has zero partial survivals), so keeping it
  // in the chain stranded players and made the campaign unwinnable. It remains in
  // the catalog as an OPTIONAL badge, so order ⊂ catalog now.
  assert.deepStrictEqual(
    [...MISSION_ORDER],
    ['near-horizon-01', 'escape-01', 'capture-01', 'orbit-01', 'score-01', 'score-02'],
  );
  assert.ok(MISSION_ORDER.length <= MISSION_CATALOG.length, 'order never exceeds catalog');
  for (const id of MISSION_ORDER) assert.ok(MISSION_CATALOG.some((m) => m.id === id), `${id} exists in catalog`);
});

test('MISSION_ORDER is frozen (immutable)', () => {
  assert.ok(Object.isFrozen(MISSION_ORDER));
  assert.throws(() => { MISSION_ORDER.push('x'); }, TypeError);
});

test('first completion unlocks exactly ONE next mission and makes it current', () => {
  const { state, unlockedMissionId } = completeMission(createInitialProgressionState(), FIRST);
  assert.strictEqual(unlockedMissionId, SECOND);
  assert.deepStrictEqual(state.completedMissionIds, [FIRST]);
  assert.deepStrictEqual(state.unlockedMissionIds, [FIRST, SECOND]);
  assert.strictEqual(state.currentMissionId, SECOND);
  assert.strictEqual(state.lastCompletedMissionId, FIRST);
  assert.ok(isMissionCompleted(state, FIRST));
  assert.ok(isMissionUnlocked(state, SECOND));
  assert.ok(!isMissionUnlocked(state, 'capture-01'), 'only one mission unlocks at a time');
  assert.ok(!isCampaignComplete(state));
});

test('locked missions cannot be completed (no-op, no unlock)', () => {
  const s = createInitialProgressionState();
  const { state, unlockedMissionId } = completeMission(s, 'capture-01');
  assert.strictEqual(state, s, 'state reference unchanged');
  assert.strictEqual(unlockedMissionId, null);
  assert.deepStrictEqual(state.completedMissionIds, []);
});

test('replay of a completed mission never re-unlocks or duplicates', () => {
  const a = completeMission(createInitialProgressionState(), FIRST);
  const { state, unlockedMissionId } = completeMission(a.state, FIRST);
  assert.strictEqual(state, a.state, 'replay keeps the same state reference');
  assert.strictEqual(unlockedMissionId, null);
  assert.deepStrictEqual(state.completedMissionIds, [FIRST], 'no duplicate entry');
  assert.deepStrictEqual(state.unlockedMissionIds, [FIRST, SECOND], 'no extra unlocks');
});

test('any unlocked mission can be completed first (not just current)', () => {
  let s = createInitialProgressionState();
  s = selectMission(s, 'capture-01');           // force-unlock is not allowed, so:
  s = completeMission(s, FIRST).state;           // 1) beat mission 1 → unlock 2
  s = completeMission(s, SECOND).state;          // 2) beat mission 2 → unlock 3
  s = selectMission(s, 'capture-01');            // 3) select mission 3 (now unlocked)
  const { state, unlockedMissionId } = completeMission(s, 'capture-01');
  assert.strictEqual(unlockedMissionId, 'orbit-01', 'next-after-capture unlocks (Phase 24: orbit follows capture)');
  assert.deepStrictEqual(state.completedMissionIds, [FIRST, SECOND, 'capture-01']);
  assert.strictEqual(state.currentMissionId, 'orbit-01', 'newly unlocked becomes current');
});

test('out-of-order completions never skip ahead in the order', () => {
  let s = createInitialProgressionState();
  s = completeMission(s, FIRST).state;           // unlock escape-01
  s = completeMission(s, SECOND).state;          // unlock capture-01
  // completing near-horizon-01 again is a replay — no unlock
  const { state, unlockedMissionId } = completeMission(s, FIRST);
  assert.strictEqual(state, s);
  assert.strictEqual(unlockedMissionId, null);
  assert.strictEqual(state.currentMissionId, 'capture-01');
});

test('completing every mission unlocks all 6 and marks campaignComplete', () => {
  let s = createInitialProgressionState();
  for (const id of MISSION_ORDER) {
    const r = completeMission(s, id);
    s = r.state;
  }
  assert.strictEqual(s.unlockedMissionIds.length, 6);
  assert.strictEqual(s.completedMissionIds.length, 6);
  assert.strictEqual(s.currentMissionId, FINAL);
  assert.strictEqual(s.lastCompletedMissionId, FINAL);
  assert.ok(isCampaignComplete(s));
});

test('final mission unlocks nothing and completes the campaign', () => {
  let s = createInitialProgressionState();
  for (const id of MISSION_ORDER.slice(0, MISSION_ORDER.length - 1)) s = completeMission(s, id).state;
  assert.ok(!isCampaignComplete(s));
  const { state, unlockedMissionId } = completeMission(s, FINAL);
  assert.strictEqual(unlockedMissionId, null, 'no mission after the final');
  assert.ok(isCampaignComplete(state));
  assert.strictEqual(state.currentMissionId, FINAL);
});

test('completion never mutates the input state', () => {
  const s = createInitialProgressionState();
  const before = JSON.stringify(s);
  completeMission(s, FIRST);
  completeMission(s, 'capture-01');
  assert.strictEqual(JSON.stringify(s), before, 'input untouched by completeMission');
});

test('selectMission moves between unlocked missions immutably', () => {
  let s = createInitialProgressionState();
  s = completeMission(s, FIRST).state;           // unlock escape-01 (now current)
  const next = selectMission(s, FIRST);          // FIRST still unlocked → reselectable
  assert.notStrictEqual(next, s);
  assert.strictEqual(next.currentMissionId, FIRST);
  assert.deepStrictEqual(next.unlockedMissionIds, s.unlockedMissionIds);
  assert.deepStrictEqual(next.completedMissionIds, s.completedMissionIds);
  assert.strictEqual(s.currentMissionId, SECOND, 'input never mutated');
});

test('selectMission rejects locked missions (no-op)', () => {
  const s = createInitialProgressionState();
  const next = selectMission(s, SECOND);
  assert.strictEqual(next, s, 'same reference');
  assert.strictEqual(next.currentMissionId, FIRST);
});

test('getCurrentMission / getNextMissionId reflect state', () => {
  const s = createInitialProgressionState();
  assert.strictEqual(getCurrentMission(s).id, FIRST);
  assert.strictEqual(getNextMissionId(s), SECOND);
  const c = completeMission(s, FIRST).state;
  assert.strictEqual(getCurrentMission(c).id, SECOND);
  assert.strictEqual(getNextMissionId(c), 'capture-01');
  let done = createInitialProgressionState();
  for (const id of MISSION_ORDER) done = completeMission(done, id).state;
  assert.strictEqual(getNextMissionId(done), null);
});

test('normalize passes a valid stored state through unchanged', () => {
  const s = createInitialProgressionState();
  s.unlockedMissionIds = [FIRST, SECOND];
  s.completedMissionIds = [FIRST];
  s.currentMissionId = SECOND;
  s.lastCompletedMissionId = FIRST;
  const n = normalizeProgressionState(s);
  assert.deepStrictEqual(n, s);
});

test('normalize strips unknown mission ids', () => {
  const s = normalizeProgressionState({
    version: 1,
    currentMissionId: 'bogus-99',
    unlockedMissionIds: ['near-horizon-01', 'not-a-mission', 7],
    completedMissionIds: ['nope'],
  });
  assert.deepStrictEqual(s.unlockedMissionIds, [FIRST]);
  assert.deepStrictEqual(s.completedMissionIds, []);
  assert.strictEqual(s.currentMissionId, FIRST);
});

test('normalize strips duplicate ids', () => {
  const n = normalizeProgressionState({
    version: 1,
    currentMissionId: FIRST,
    unlockedMissionIds: [FIRST, FIRST, SECOND, SECOND],
    completedMissionIds: [],
  });
  assert.deepStrictEqual(n.unlockedMissionIds, [FIRST, SECOND]);
});

test('normalize forces completed inside unlocked', () => {
  const n = normalizeProgressionState({
    version: 1,
    currentMissionId: FIRST,
    unlockedMissionIds: [FIRST],
    completedMissionIds: [FIRST, SECOND],
  });
  assert.deepStrictEqual(n.completedMissionIds, [FIRST], 'locked completion dropped');
  assert.deepStrictEqual(n.unlockedMissionIds, [FIRST]);
});

test('normalize forces current inside unlocked', () => {
  const n = normalizeProgressionState({
    version: 1,
    currentMissionId: FINAL,
    unlockedMissionIds: [FIRST],
    completedMissionIds: [],
  });
  assert.strictEqual(n.currentMissionId, FIRST);
});

test('normalize recomputes campaignComplete instead of trusting it', () => {
  const n = normalizeProgressionState({
    version: 1,
    currentMissionId: FIRST,
    unlockedMissionIds: [FIRST],
    completedMissionIds: [],
    campaignComplete: true,
  });
  assert.strictEqual(n.campaignComplete, false, 'recomputed, never trusted');
});

test('normalize falls back to initial on non-object input', () => {
  for (const bad of [null, undefined, 5, 'x', []]) {
    const n = normalizeProgressionState(bad);
    assert.deepStrictEqual(n, createInitialProgressionState(), `input ${JSON.stringify(bad)} → initial`);
  }
});

test('normalize falls back to initial on future version', () => {
  const n = normalizeProgressionState({
    version: 99,
    currentMissionId: SECOND,
    unlockedMissionIds: [FIRST, SECOND],
    completedMissionIds: [FIRST],
  });
  assert.deepStrictEqual(n, createInitialProgressionState());
});

test('normalize falls back to initial when nothing valid is unlocked', () => {
  const n = normalizeProgressionState({
    version: 1,
    currentMissionId: 'zzz',
    unlockedMissionIds: [],
    completedMissionIds: [],
  });
  assert.strictEqual(n.currentMissionId, FIRST);
  assert.deepStrictEqual(n.unlockedMissionIds, [FIRST]);
});

test('normalize is idempotent', () => {
  const messy = {
    version: 1,
    currentMissionId: 'escape-01',
    unlockedMissionIds: ['near-horizon-01', 'escape-01', 'escape-01', 'wat'],
    completedMissionIds: ['near-horizon-01', 'near-horizon-01', 'escape-01'],
  };
  const once = normalizeProgressionState(messy);
  assert.deepStrictEqual(normalizeProgressionState(once), once);
});

test('storage: save→load round-trips a state object', () => {
  const store = new Map();
  const fake = {
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => store.set(k, v),
    removeItem: (k) => store.delete(k),
  };
  const s = createInitialProgressionState();
  s.unlockedMissionIds = [FIRST, SECOND];
  s.completedMissionIds = [FIRST];
  saveProgression(s, fake);
  assert.ok(store.has(PROGRESSION_STORAGE_KEY));
  const loaded = loadProgression(fake);
  assert.deepStrictEqual(loaded, s);
  assert.strictEqual(loaded.completedMissionIds.length, 1);
});

test('storage: corrupt JSON collapses to null (never throws)', () => {
  const store = new Map([[PROGRESSION_STORAGE_KEY, '{not json!!']]);
  const fake = { getItem: (k) => store.get(k) ?? null };
  assert.strictEqual(loadProgression(fake), null);
});

test('storage: missing key and backend absence both yield null', () => {
  assert.strictEqual(loadProgression({ getItem: () => null }), null);
  assert.strictEqual(loadProgression(null), null);
  assert.strictEqual(loadProgression(undefined), null);
});

test('storage: backend that throws never escapes', () => {
  const throwing = {
    getItem: () => { throw new Error('boom'); },
    setItem: () => { throw new Error('boom'); },
    removeItem: () => { throw new Error('boom'); },
  };
  assert.strictEqual(loadProgression(throwing), null);
  assert.doesNotThrow(() => saveProgression(createInitialProgressionState(), throwing));
  assert.doesNotThrow(() => clearProgression(throwing));
});

test('storage: clear removes the key', () => {
  const store = new Map([[PROGRESSION_STORAGE_KEY, '{}']]);
  const fake = { getItem: (k) => store.get(k) ?? null, removeItem: (k) => store.delete(k) };
  clearProgression(fake);
  assert.strictEqual(loadProgression(fake), null);
});

test('Progression: missing/corrupt storage starts at the initial campaign', () => {
  const p = new Progression({ storage: { getItem: () => '{bad!!' } });
  assert.strictEqual(p.state.currentMissionId, FIRST);
  assert.deepStrictEqual(p.state.unlockedMissionIds, [FIRST]);
  assert.ok(!p.isCompleted(FIRST));
});

test('Progression: completing persists through the controller and self-heals reads', () => {
  const store = new Map();
  const fake = { getItem: (k) => store.get(k) ?? null, setItem: (k, v) => store.set(k, v) };
  const p = new Progression({ storage: fake });
  assert.ok(p.isUnlocked(FIRST));
  assert.ok(!p.isUnlocked(SECOND));
  const res = p.complete(FIRST);
  assert.ok(res.changed);
  assert.strictEqual(res.unlockedMissionId, SECOND);
  assert.ok(p.isCompleted(FIRST));
  assert.strictEqual(p.state.currentMissionId, SECOND);
  // fresh controller on the same backend sees the persisted progress
  const q = new Progression({ storage: fake });
  assert.ok(q.isCompleted(FIRST));
  assert.ok(q.isUnlocked(SECOND));
  assert.strictEqual(q.state.currentMissionId, SECOND);
});

test('Progression: selecting unlocks persist and lock gate blocks', () => {
  const store = new Map();
  const fake = { getItem: (k) => store.get(k) ?? null, setItem: (k, v) => store.set(k, v) };
  const p = new Progression({ storage: fake });
  assert.ok(!p.select('escape-01'), 'locked select is a no-op');
  p.complete('near-horizon-01');                 // current now escape-01
  assert.ok(p.select('near-horizon-01'), 'reselect an unlocked-but-not-current mission');
  assert.strictEqual(p.state.currentMissionId, 'near-horizon-01');
  const q = new Progression({ storage: fake });
  assert.strictEqual(q.state.currentMissionId, 'near-horizon-01');
});

test('Progression: replay after persistence does not re-unlock', () => {
  const store = new Map();
  const fake = { getItem: (k) => store.get(k) ?? null, setItem: (k, v) => store.set(k, v) };
  const p = new Progression({ storage: fake });
  p.complete('near-horizon-01');
  const before = JSON.stringify(store);
  const replay = p.complete('near-horizon-01');
  assert.ok(!replay.changed);
  assert.strictEqual(replay.unlockedMissionId, null);
  assert.strictEqual(JSON.stringify(store), before, 'replay writes nothing to storage');
});

test('Progression: reset wipes storage and restores initial', () => {
  const store = new Map();
  const fake = {
    getItem: (k) => store.get(k) ?? null,
    setItem: (k, v) => store.set(k, v),
    removeItem: (k) => store.delete(k),
  };
  const p = new Progression({ storage: fake });
  p.complete('near-horizon-01');
  p.complete('escape-01');
  assert.deepStrictEqual(p.state.completedMissionIds.length, 2);
  p.reset();
  assert.deepStrictEqual(p.state, createInitialProgressionState());
  assert.ok(!store.has(PROGRESSION_STORAGE_KEY) || loadProgression(fake) !== null, 'reset persists the fresh initial state');
  assert.strictEqual(loadProgression(fake).currentMissionId, FIRST);
});

test('Progression: full campaign → snapshot reports campaignComplete and is frozen', () => {
  const p = new Progression({ storage: null });
  for (const id of MISSION_ORDER) p.complete(id);
  const s = p.snapshot;
  assert.ok(s.campaignComplete);
  assert.strictEqual(s.completedMissionIds.length, MISSION_ORDER.length);
  assert.deepStrictEqual(s.unlockedMissionIds, [...MISSION_ORDER]);
  assert.throws(() => { s.completedMissionIds.push('x'); }, TypeError, 'nested array frozen');
  assert.throws(() => { s.campaignComplete = false; }, TypeError, 'snapshot frozen');
  // snapshot mutation never touches the live controller
  assert.ok(p.snapshot.campaignComplete);
  assert.ok(p.isCompleted('score-02'));
});

test('Progression is purely driven by completed flag (no telemetry/score coupling)', () => {
  const p = new Progression({ storage: null });
  // complete() ignores anything but the id — pass nothing else and assert the
  // controller never introduced telemetry/score reading at the API surface.
  p.complete('near-horizon-01');
  assert.deepStrictEqual(p.state.completedMissionIds, ['near-horizon-01']);
  assert.ok(!('telemetry' in p.state) && !('score' in p.state), 'state stores no telemetry/score');
  assert.ok(!('guidance' in p.state) && !('physics' in p.state));
});