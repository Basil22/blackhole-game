// game/scoring/history.js — per-mission best score persistence.
// Pure localStorage-backed store keyed by mission ID. Each entry holds the best
// score, its breakdown, the object used, and a throw counter. Schema versioned
// like progression/campaign. Best-effort: any failure collapses to defaults,
// never crashes the game.

const STORAGE_KEY = 'blackhole-game:score-history:v1';
const VERSION = 1;

function _load(storage) {
  try {
    const raw = storage && typeof storage.getItem === 'function'
      ? storage.getItem(STORAGE_KEY) : null;
    if (raw == null) return null;
    return JSON.parse(raw);
  } catch { return null; }
}

function _save(data, storage) {
  try {
    if (storage && typeof storage.setItem === 'function') {
      storage.setItem(STORAGE_KEY, JSON.stringify(data));
    }
  } catch { /* never break the game */ }
}

function _normalize(raw) {
  if (!raw || typeof raw !== 'object' || raw.version !== VERSION) {
    return { version: VERSION, missions: {} };
  }
  return { version: VERSION, missions: raw.missions || {} };
}

export class ScoreHistory {
  constructor({ storage } = {}) {
    this._storage = storage ?? globalThis.localStorage;
    this._data = _normalize(_load(this._storage));
  }

  // Get the best record for a mission, or null.
  getBest(missionId) {
    const entry = this._data.missions[missionId];
    return entry || null;
  }

  // Record a throw. Returns { isNewBest, previousBest } so the caller can
  // decide whether to show a "NEW BEST" badge.
  record(missionId, { total, breakdown, objectId, stars }) {
    if (!missionId || !Number.isFinite(total)) return { isNewBest: false, previousBest: null };

    const prev = this._data.missions[missionId];
    const previousBest = prev ? prev.bestScore : null;
    const throws = prev ? (prev.throws || 0) + 1 : 1;
    const isNewBest = !prev || total > prev.bestScore;

    if (isNewBest) {
      this._data.missions[missionId] = {
        bestScore: total,
        bestBreakdown: Array.isArray(breakdown)
          ? breakdown.map((r) => ({ key: r.key, label: r.label, score: r.score }))
          : [],
        bestStars: Number.isFinite(stars) ? stars : 0,
        objectId: objectId || null,
        date: Date.now(),
        throws,
      };
    } else if (prev) {
      prev.throws = throws;
      // Update stars even if score isn't a new best (stars might improve on a
      // different throw style)
      if (Number.isFinite(stars) && stars > (prev.bestStars || 0)) {
        prev.bestStars = stars;
      }
    }

    _save(this._data, this._storage);
    return { isNewBest, previousBest };
  }

  // Total throws across all missions.
  totalThrows() {
    let n = 0;
    for (const entry of Object.values(this._data.missions)) {
      n += entry.throws || 0;
    }
    return n;
  }

  // Reset all history.
  reset() {
    this._data = { version: VERSION, missions: {} };
    _save(this._data, this._storage);
  }

  // Read-only snapshot for debug.
  get snapshot() {
    return JSON.parse(JSON.stringify(this._data));
  }
}
