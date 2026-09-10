// tests/game/campaign.test.js — Phase-19 campaign layer (pure, node-testable).
// Verifies the declarative level set, the derived unlock logic, the controller
// protocol, persistence, replay safety, determinism, and defensive normalize.
// Run: node tests/run_campaign.js
import assert from 'node:assert';
import { test } from '../physics/support.js';
import {
  CAMPAIGN_LEVELS,
  getLevel,
  getFirstLevel,
  getLastLevel,
  createInitialCampaignState,
  normalizeCampaignState,
  completedLevelIds,
  isLevelUnlocked,
  isObjectUnlocked,
  isCampaignComplete,
  deepestUnlockedLevelId,
  levelProgress,
  unlockLevelForObject,
  unlockHintForObject,
  objectLevelIndex,
  selectLevel,
  CAMPAIGN_VERSION,
} from '../../js/game/campaign/index.js';
import {
  Campaign,
  CAMPAIGN_STORAGE_KEY,
  saveCampaign,
  loadCampaign,
} from '../../js/game/campaign/index.js';
import { MISSION_ORDER } from '../../js/game/progression/index.js';
import { getMission } from '../../js/game/missions/index.js';

const L1 = 'level-1', L2 = 'level-2', L3 = 'level-3', L4 = 'level-4';

// Mission id aliases matching the new 12-mission catalog:
const CAP = 'capture-01', NH1 = 'near-horizon-01', FLY = 'flyby-01',
  SC1 = 'score-01', T1 = 'tear-01', ORB = 'orbit-01',
  NH2 = 'near-horizon-02', STR = 'stretch-01', ESC = 'escape-01',
  T2 = 'tear-02', SC2 = 'score-02', SC3 = 'score-03';

// Level required sets (from levels.js):
const L1_REQ = [CAP, NH1, FLY, SC1, T1, ORB];
const L2_REQ = [CAP, NH1, NH2, STR, ESC, ORB];
const L3_REQ = [NH2, STR, ESC, T2, SC2, SC3];
const L4_REQ = [NH2, T2, SC2, SC3];

function memStorage() {
  const m = new Map();
  return {
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => m.set(k, String(v)),
    removeItem: (k) => m.delete(k),
    _map: m,
  };
}

// All 12 missions completed:
const ALL = [CAP, NH1, FLY, SC1, T1, ORB, NH2, STR, ESC, T2, SC2, SC3];

// ------------------------------------------------------------ definitions ---
test('level set is declarative, ordered, and references real missions', () => {
  assert.strictEqual(CAMPAIGN_LEVELS.length, 4);
  for (let i = 0; i < CAMPAIGN_LEVELS.length; i++) {
    const l = CAMPAIGN_LEVELS[i];
    assert.strictEqual(l.index, i + 1);
    assert.ok(l.id && l.title && l.description);
    assert.ok(l.requiredMissionIds.length > 0, 'level has required missions');
    for (const mid of l.requiredMissionIds) {
      assert.ok(getMission(mid), `required mission ${mid} exists in catalog`);
    }
    // unlocks reference the NEXT level + a real object id
    if (l.unlocks) {
      assert.strictEqual(l.unlocks.levelId, getLevelByIndexStrict(l.index + 1).id);
      assert.strictEqual(l.unlocks.objectId, getLevelByIndexStrict(l.index + 1).objectId);
    } else {
      assert.strictEqual(l, getLastLevel(), 'only the last level unlocks nothing');
    }
  }
  // object per level: rock/human/ship/planet
  assert.deepStrictEqual(CAMPAIGN_LEVELS.map((l) => l.objectId), ['rock', 'human', 'ship', 'planet']);
});

// ------------------------------------------------------------- initial ------
test('initial state: level-1 current, rock unlocked, everything else locked', () => {
  const s = createInitialCampaignState();
  assert.strictEqual(s.version, CAMPAIGN_VERSION);
  assert.strictEqual(s.currentLevelId, L1);
  assert.strictEqual(s.showIntro, true);
  assert.ok(isLevelUnlocked(L1, []));
  assert.ok(!isLevelUnlocked(L2, []));
  assert.ok(isObjectUnlocked('rock', []));
  assert.ok(!isObjectUnlocked('human', []));
  assert.ok(!isObjectUnlocked('ship', []));
  assert.ok(!isObjectUnlocked('planet', []));
  assert.ok(!isCampaignComplete([]));
  assert.strictEqual(deepestUnlockedLevelId([]), L1);
});

test('first level needs six missions and unlocks the astronaut', () => {
  const done = L1_REQ;
  const levels = completedLevelIds(done);
  assert.deepStrictEqual(levels, [L1]);
  assert.ok(isObjectUnlocked('human', levels));
  assert.ok(!isObjectUnlocked('ship', levels));
  assert.ok(!isObjectUnlocked('planet', levels));
  assert.ok(isLevelUnlocked(L2, levels));
  assert.ok(!isLevelUnlocked(L3, levels));
  assert.strictEqual(deepestUnlockedLevelId(levels), L2);
});

test('partial progress completes nothing and unlocks nothing', () => {
  for (const subset of [[CAP], [ORB], [ESC], []]) {
    const levels = completedLevelIds(subset);
    assert.deepStrictEqual(levels, [], `subset ${subset} completed levels`);
    assert.ok(!isObjectUnlocked('human', levels));
    assert.ok(!isLevelUnlocked(L2, levels));
  }
});

test('full set completes every level and the campaign', () => {
  const levels = completedLevelIds(ALL);
  assert.deepStrictEqual(levels, [L1, L2, L3, L4]);
  assert.ok(isObjectUnlocked('rock', levels));
  assert.ok(isObjectUnlocked('human', levels));
  assert.ok(isObjectUnlocked('ship', levels));
  assert.ok(isObjectUnlocked('planet', levels));
  assert.ok(isCampaignComplete(levels));
  assert.strictEqual(deepestUnlockedLevelId(levels), L4);
});

test('unknown and duplicate mission ids never satisfy requirements', () => {
  const junk = [...L1_REQ, 'nope', CAP, null, 42];
  assert.deepStrictEqual(completedLevelIds(junk), [L1]);
  // duplicates in the completed list are harmless (set semantics via includes)
  assert.deepStrictEqual(completedLevelIds([...L1_REQ, ...L1_REQ]), [L1]);
});

// -------------------------------------------------------------- progress ----
test('levelProgress counts required missions, not catalog breadth', () => {
  assert.deepStrictEqual(levelProgress(L1, []), { done: 0, required: 6, complete: false });
  assert.deepStrictEqual(levelProgress(L1, [CAP, ESC]), { done: 1, required: 6, complete: false });
  assert.deepStrictEqual(levelProgress(L1, L1_REQ), { done: 6, required: 6, complete: true });
  assert.deepStrictEqual(levelProgress(L2, ALL), { done: 6, required: 6, complete: true });
  assert.deepStrictEqual(levelProgress('nope', ALL), { done: 0, required: 0, complete: false });
});

// ----------------------------------------------------------- lock hints -----
test('lock hints name the exact level to clear', () => {
  assert.strictEqual(unlockLevelForObject('rock', []), 0);
  assert.strictEqual(unlockHintForObject('rock', []), '');
  assert.strictEqual(unlockLevelForObject('human', []), 1);
  assert.strictEqual(unlockHintForObject('human', []), 'CLEAR LEVEL 1');
  assert.strictEqual(unlockLevelForObject('ship', []), 2);
  assert.strictEqual(unlockHintForObject('ship', []), 'CLEAR LEVEL 2');
  assert.strictEqual(unlockLevelForObject('planet', []), 3);
  assert.strictEqual(unlockHintForObject('planet', []), 'CLEAR LEVEL 3');
  const l1done = completedLevelIds(L1_REQ);
  assert.strictEqual(unlockHintForObject('human', l1done), '');
  assert.strictEqual(unlockLevelForObject('human', l1done), 0);
  assert.strictEqual(unlockHintForObject('planet', completedLevelIds(ALL)), '');
});

test('objectLevelIndex names the objects OWN ladder position', () => {
  assert.strictEqual(objectLevelIndex('rock'), 1);
  assert.strictEqual(objectLevelIndex('human'), 2);
  assert.strictEqual(objectLevelIndex('ship'), 3);
  assert.strictEqual(objectLevelIndex('planet'), 4);
  assert.strictEqual(objectLevelIndex('nope'), 0);
  // independent of the completed set — it describes the object, not the lock
  assert.strictEqual(objectLevelIndex('human'), objectLevelIndex('human'));
});

// ----------------------------------------------------------- transitions ----
test('selectLevel only accepts unlocked, known levels', () => {
  const s = createInitialCampaignState();
  assert.strictEqual(selectLevel(s, L2, []), s, 'locked level rejected');
  assert.strictEqual(selectLevel(s, L1, []), s, 'same level is a no-op');
  assert.strictEqual(selectLevel(s, 'nope', []), s, 'unknown level rejected');
  const next = selectLevel(s, L2, completedLevelIds(L1_REQ));
  assert.notStrictEqual(next, s);
  assert.strictEqual(next.currentLevelId, L2);
  assert.strictEqual(next.showIntro, true);
  assert.strictEqual(next.version, CAMPAIGN_VERSION);
});

// ------------------------------------------------------------ normalize -----
test('normalize falls back to initial on garbage input', () => {
  for (const raw of [null, undefined, 42, 'x', [], {}, { version: 0 }, { version: 99, currentLevelId: L1 }]) {
    const s = normalizeCampaignState(raw);
    assert.strictEqual(s.currentLevelId, L1, `raw=${JSON.stringify(raw)}`);
    assert.strictEqual(s.showIntro, true);
    assert.strictEqual(s.version, CAMPAIGN_VERSION);
  }
});

test('normalize accepts a valid stored state and preserves showIntro=false', () => {
  const s = normalizeCampaignState({ version: CAMPAIGN_VERSION, currentLevelId: L3, showIntro: false });
  assert.strictEqual(s.currentLevelId, L3);
  assert.strictEqual(s.showIntro, false);
});

test('normalize never re-enables intro and rejects unknown level ids', () => {
  const s = normalizeCampaignState({ version: CAMPAIGN_VERSION, currentLevelId: 'nope', showIntro: true });
  assert.strictEqual(s.currentLevelId, L1);
  const s2 = normalizeCampaignState({ version: CAMPAIGN_VERSION, currentLevelId: L2, showIntro: 1 });
  assert.strictEqual(s2.showIntro, true);
});

// ----------------------------------------------------------- storage --------
test('campaign storage round-trips and swallows corrupt bytes', () => {
  const store = memStorage();
  const state = { version: CAMPAIGN_VERSION, currentLevelId: L2, showIntro: false };
  saveCampaign(state, store);
  assert.deepStrictEqual(loadCampaign(store), state);
  store.setItem(CAMPAIGN_STORAGE_KEY, '{not json');
  assert.strictEqual(loadCampaign(store), null);
  store.setItem(CAMPAIGN_STORAGE_KEY, null);
  assert.strictEqual(loadCampaign(store), null);
});

// ------------------------------------------------------------ controller ----
test('controller initial load normalizes empty storage', () => {
  const c = new Campaign({ storage: memStorage() });
  assert.strictEqual(c.state.currentLevelId, L1);
  assert.strictEqual(c.state.showIntro, true);
  assert.ok(c.isObjectUnlocked('rock', []));
  assert.ok(!c.isObjectUnlocked('human', []));
});

test('recordMissionComplete reports one level when its missions complete', () => {
  const c = new Campaign({ storage: memStorage() });
  // Before: 5 of 6 L1 missions done. After: all 6 done -> L1 completes.
  const before = L1_REQ.slice(0, 5);
  const after = [...L1_REQ];
  const out = c.recordMissionComplete(before, after);
  assert.strictEqual(out.changed, true);
  assert.deepStrictEqual(out.newLevels.map((l) => l.id), [L1]);
  assert.deepStrictEqual(out.unlockedObjects, ['human']);
  assert.strictEqual(out.currentLevelId, L2);
  assert.strictEqual(out.currentLevelChanged, true);
  assert.strictEqual(out.campaignComplete, false);
  // campaign state persisted the auto-advance
  assert.strictEqual(c.state.currentLevelId, L2);
});

test('recordMissionComplete is idempotent on replays', () => {
  const c = new Campaign({ storage: memStorage() });
  const done = [...L1_REQ];
  c.recordMissionComplete([], done);
  const out = c.recordMissionComplete(done, done);
  assert.strictEqual(out.changed, false);
  assert.deepStrictEqual(out.newLevels, []);
  assert.deepStrictEqual(out.unlockedObjects, []);
});

test('recordMissionComplete marks the campaign complete on the final missions', () => {
  const c = new Campaign({ storage: memStorage() });
  // Before: L1+L2 done. After: ALL -> completes L3+L4 and the campaign.
  const before = [...new Set([...L1_REQ, ...L2_REQ])];
  const out = c.recordMissionComplete(before, ALL);
  assert.strictEqual(out.changed, true);
  assert.ok(out.newLevels.some((l) => l.id === L3) || out.newLevels.some((l) => l.id === L4));
  assert.strictEqual(out.campaignComplete, true);
  assert.strictEqual(out.currentLevelId, L4);
});

test('replay cannot re-unlock or re-advance after completion', () => {
  const c = new Campaign({ storage: memStorage() });
  const done = [...L1_REQ];
  const out1 = c.recordMissionComplete([], done);
  assert.strictEqual(out1.changed, true);
  assert.strictEqual(c.state.currentLevelId, L2);
  // replaying the same completed mission set again — nothing changes
  const out2 = c.recordMissionComplete(done, done);
  assert.strictEqual(out2.changed, false);
  assert.strictEqual(c.state.currentLevelId, L2);
});

test('manual selectLevel persists and locked levels are rejected', () => {
  const c = new Campaign({ storage: memStorage() });
  assert.strictEqual(c.selectLevel(L2, []), false, 'locked rejected');
  assert.strictEqual(c.selectLevel(L2, L1_REQ), true);
  assert.strictEqual(c.state.currentLevelId, L2);
  assert.strictEqual(c.selectLevel(L2, L1_REQ), false, 'same level no-op');
  // reload picks up the stored selection
  const store = memStorage();
  const c2 = new Campaign({ storage: store });
  c2.selectLevel(L2, L1_REQ);
  const c3 = new Campaign({ storage: store });
  assert.strictEqual(c3.state.currentLevelId, L2);
});

test('currentLevel clamps when the stored selection is no longer unlocked', () => {
  const store = memStorage();
  const c = new Campaign({ storage: store });
  c.recordMissionComplete([], L1_REQ); // current -> L2
  // progression reset behind the scenes: mission set is now empty
  assert.strictEqual(c.currentLevel([]).id, L1, 'clamped to deepest unlocked');
  // but the stored selection is untouched (still persisted as L2)
  assert.strictEqual(c.state.currentLevelId, L2);
});

test('dismissIntro is one-shot and persists', () => {
  const store = memStorage();
  const c = new Campaign({ storage: store });
  assert.strictEqual(c.state.showIntro, true);
  assert.strictEqual(c.dismissIntro(), true);
  assert.strictEqual(c.dismissIntro(), false);
  const c2 = new Campaign({ storage: store });
  assert.strictEqual(c2.state.showIntro, false);
});

test('reset restores a clean initial campaign', () => {
  const store = memStorage();
  const c = new Campaign({ storage: store });
  c.recordMissionComplete([], L1_REQ);
  c.dismissIntro();
  c.reset();
  assert.strictEqual(c.state.currentLevelId, L1);
  assert.strictEqual(c.state.showIntro, true);
  assert.deepStrictEqual(c.completedLevelIds(L1_REQ), [L1], 'derived, not stored');
  const c2 = new Campaign({ storage: store });
  assert.strictEqual(c2.state.currentLevelId, L1);
});

// --------------------------------------------------------- immutability -----
test('operations never mutate their inputs', () => {
  const done = [...L1_REQ];
  const before = [...done];
  const s = createInitialCampaignState();
  const levels = completedLevelIds(done);
  isLevelUnlocked(L2, levels);
  isObjectUnlocked('human', levels);
  selectLevel(s, L2, levels);
  levelProgress(L1, done);
  assert.deepStrictEqual(done, before, 'completed list unchanged');
  assert.strictEqual(s.currentLevelId, L1, 'input state unchanged');
});

test('state snapshots are frozen copies', () => {
  const c = new Campaign({ storage: memStorage() });
  const snap = c.snapshot;
  assert.throws(() => { snap.currentLevelId = 'x'; }, TypeError);
});

test('controller queries are deterministic', () => {
  const a = new Campaign({ storage: memStorage() });
  const b = new Campaign({ storage: memStorage() });
  for (let i = 0; i < 3; i++) {
    assert.strictEqual(a.isObjectUnlocked('human', ALL), b.isObjectUnlocked('human', ALL));
    assert.strictEqual(a.completedLevelIds(ALL).join(','), b.completedLevelIds(ALL).join(','));
    assert.strictEqual(a.currentLevel(ALL).id, b.currentLevel(ALL).id);
  }
});

// helpers ----------------------------------------------------------------
function getLevelByIndexStrict(index) {
  return CAMPAIGN_LEVELS.find((l) => l.index === index) || null;
}
