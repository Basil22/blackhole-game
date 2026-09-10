// game/challenges/daily.js — procedural daily challenge generator.
// Deterministic: the same date produces the same challenge for all players.
// Pure: no DOM, no physics, no three.js. The challenge is a mission-like goal
// with a template, target, and recommended object. Uses the existing mission
// evaluation pipeline for completion checking.

import { MISSION_TYPES } from '../missions/mission.js';

const DAILY_STORAGE_KEY = 'blackhole-game:daily:v1';

// Challenge templates — each produces a mission-compatible goal.
const TEMPLATES = [
  { type: MISSION_TYPES.SCORE, label: 'Score at least {N} points', genTarget: (d) => [500, 800, 1200, 1800, 2500, 3200, 4000][d % 7] },
  { type: MISSION_TYPES.TEAR_COUNT, label: 'Get at least {N} tears', genTarget: (d) => [1, 2, 3, 4, 5, 6][d % 6] },
  { type: MISSION_TYPES.STRETCH, label: 'Stretch to {N}x', genTarget: (d) => [1.5, 2.0, 2.5, 3.0, 3.5][d % 5] },
  { type: MISSION_TYPES.NEAR_HORIZON, label: 'Pass within {N}x horizon', genTarget: (d) => [2.5, 2.0, 1.8, 1.5, 1.3][d % 5] },
  { type: MISSION_TYPES.STATE, label: 'Achieve {S}', genState: (d) => ['HORIZON_CROSSING', 'FLYBY', 'ORBITAL', 'ESCAPING'][d % 4] },
];

const OBJECTS = ['rock', 'human', 'ship', 'planet'];

// Simple hash for deterministic seeding from a date string.
function hashDate(dateStr) {
  let h = 0;
  for (let i = 0; i < dateStr.length; i++) {
    h = ((h << 5) - h + dateStr.charCodeAt(i)) | 0;
  }
  return Math.abs(h);
}

// Get today's date string (YYYY-MM-DD).
function todayKey() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// Generate the daily challenge for a given date string.
export function generateDailyChallenge(dateStr) {
  const key = dateStr || todayKey();
  const h = hashDate(key);
  const tmpl = TEMPLATES[h % TEMPLATES.length];
  const objectId = OBJECTS[(h >> 3) % OBJECTS.length];

  const mission = {
    id: `daily-${key}`,
    title: 'Daily Challenge',
    type: tmpl.type,
    difficulty: 3,
    recommendedObjectIds: [objectId],
    hint: 'Complete the daily challenge for a streak bonus!',
  };

  if (tmpl.type === MISSION_TYPES.STATE) {
    const state = tmpl.genState(h >> 4);
    mission.state = state;
    mission.description = tmpl.label.replace('{S}', state.replace(/_/g, ' ').split(' ').map(w => w.charAt(0) + w.slice(1).toLowerCase()).join(' '));
  } else {
    const target = tmpl.genTarget(h >> 4);
    mission.target = target;
    mission.description = tmpl.label
      .replace('{N}', tmpl.type === MISSION_TYPES.STRETCH ? `${target}` : String(target));
  }

  return { dateKey: key, mission, objectId };
}

// Daily challenge persistence: tracks completion, streak, and best score.
export class DailyTracker {
  constructor({ storage } = {}) {
    this._storage = storage ?? globalThis.localStorage;
    this._data = this._load();
  }

  _load() {
    try {
      const raw = this._storage?.getItem?.(DAILY_STORAGE_KEY);
      if (!raw) return { version: 1, history: {}, streak: 0, lastCompleted: null };
      const d = JSON.parse(raw);
      return d && d.version === 1 ? d : { version: 1, history: {}, streak: 0, lastCompleted: null };
    } catch { return { version: 1, history: {}, streak: 0, lastCompleted: null }; }
  }

  _save() {
    try {
      this._storage?.setItem?.(DAILY_STORAGE_KEY, JSON.stringify(this._data));
    } catch { /* never break the game */ }
  }

  // Get today's challenge (generates it deterministically).
  today() {
    return generateDailyChallenge(todayKey());
  }

  // Is today's challenge completed?
  isCompletedToday() {
    const key = todayKey();
    return !!(this._data.history[key] && this._data.history[key].completed);
  }

  // Record a completion for today.
  complete(score) {
    const key = todayKey();
    const prev = this._data.history[key];
    const isNewBest = !prev || !prev.completed || score > (prev.bestScore || 0);

    // Calculate streak
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const yKey = `${yesterday.getFullYear()}-${String(yesterday.getMonth() + 1).padStart(2, '0')}-${String(yesterday.getDate()).padStart(2, '0')}`;

    if (!prev || !prev.completed) {
      // First completion today
      if (this._data.lastCompleted === yKey) {
        this._data.streak = (this._data.streak || 0) + 1;
      } else if (this._data.lastCompleted !== key) {
        this._data.streak = 1;
      }
      this._data.lastCompleted = key;
    }

    this._data.history[key] = {
      completed: true,
      bestScore: isNewBest ? score : (prev?.bestScore || score),
      date: Date.now(),
    };

    this._save();
    return { isNewBest, streak: this._data.streak };
  }

  get streak() {
    // Verify streak is still valid (not broken by missed days)
    const key = todayKey();
    if (this._data.lastCompleted === key) return this._data.streak;
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const yKey = `${yesterday.getFullYear()}-${String(yesterday.getMonth() + 1).padStart(2, '0')}-${String(yesterday.getDate()).padStart(2, '0')}`;
    if (this._data.lastCompleted === yKey) return this._data.streak;
    return 0; // streak broken
  }

  get bestToday() {
    const entry = this._data.history[todayKey()];
    return entry ? (entry.bestScore || 0) : 0;
  }

  reset() {
    this._data = { version: 1, history: {}, streak: 0, lastCompleted: null };
    this._save();
  }
}
