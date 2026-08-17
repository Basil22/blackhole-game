// game/missions/catalog.js — the curated Phase-7 mission set.
// Plain declarative definitions only; every shape satisfies isValidMission.
// No physics, no scoring, no UI — this is pure content the evaluator consumes.

import { MISSION_TYPES, MISSION_STATES } from './mission.js';

const S = MISSION_STATES;

export const MISSION_CATALOG = Object.freeze([
  {
    id: 'near-horizon-01',
    title: 'Touch the Edge',
    description: 'Pass within 1.5× the event horizon.',
    type: MISSION_TYPES.NEAR_HORIZON,
    target: 1.5,
    // Phase-10 challenge metadata — declarative presentation only. difficulty
    // is a 1..5 tier, recommendedObjectIds are existing object ids, hint is a
    // player-facing tip. None of these affect the evaluator or completion.
    difficulty: 1,
    recommendedObjectIds: Object.freeze(['rock', 'human']),
    hint: 'Your goal is precision — a close pass counts even if the horizon takes the object.',
  },
  {
    id: 'escape-01',
    title: 'Break Free',
    description: 'Escape the black hole.',
    type: MISSION_TYPES.STATE,
    state: S.ESCAPING,
    difficulty: 5,
    recommendedObjectIds: Object.freeze(['rock', 'human']),
    hint: "Speed matters more than accuracy — a hard, wide launch is the only way out.",
  },
  {
    id: 'orbit-01',
    title: 'Find the Orbit',
    description: 'Achieve a stable orbital trajectory.',
    type: MISSION_TYPES.STATE,
    state: S.ORBITAL,
    difficulty: 4,
    recommendedObjectIds: Object.freeze(['ship', 'planet']),
    hint: 'Try a sideways launch — nudge it into a loop instead of a fatal plunge.',
  },
  {
    id: 'capture-01',
    title: 'Into the Abyss',
    description: 'Have the object cross the event horizon.',
    // Telemetry reports HORIZON_CROSSING the moment the object is consumed /
    // crosses the horizon (finalizeThrow: consumption wins over the analytic
    // verdict) — so this is the honest state to match, not CAPTURED.
    type: MISSION_TYPES.STATE,
    state: S.HORIZON_CROSSING,
    difficulty: 1,
    recommendedObjectIds: Object.freeze(['planet', 'rock']),
    hint: 'Aim straight in — the horizon will swallow whatever you send.',
  },
  {
    id: 'survive-near-horizon-01',
    title: 'Grazing the Void',
    description: 'Pass within 1.5× the event horizon without being fully consumed.',
    type: MISSION_TYPES.SURVIVE_NEAR_HORIZON,
    target: 1.5,
    difficulty: 3,
    recommendedObjectIds: Object.freeze(['ship', 'human']),
    hint: 'Close is not enough — the pass only counts if the object wasn\'t fully consumed.',
  },
  {
    id: 'score-01',
    title: 'Make It Count',
    description: 'Score at least 1,200 points.',
    type: MISSION_TYPES.SCORE,
    target: 1200,
    difficulty: 2,
    recommendedObjectIds: Object.freeze(['rock', 'human']),
    hint: 'A deliberate close pass that stretches the object stacks precision, tidal, and survival — enough to crack 1,200 if you thread the rim cleanly.',
  },
  {
    id: 'score-02',
    title: 'High Roller',
    description: 'Score at least 3,000 points.',
    type: MISSION_TYPES.SCORE,
    target: 3000,
    difficulty: 4,
    recommendedObjectIds: Object.freeze(['planet', 'ship']),
    hint: 'Stack every category: a max-power near-horizon pass that tears free deep mass, tears plenty, and still returns — the full house of a Black Hole throw.',
  },
]);

export function getMission(id) {
  return MISSION_CATALOG.find((m) => m.id === id) || null;
}

export function getDefaultMissionId() {
  return MISSION_CATALOG[0] ? MISSION_CATALOG[0].id : null;
}
