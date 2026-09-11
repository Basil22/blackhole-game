// game/missions/catalog.js — the curated mission set.
// 12 missions, ordered easy → hard. Every 6 completions unlock the next object.
// Plain declarative definitions only; every shape satisfies isValidMission.
// No physics, no scoring, no UI — this is pure content the evaluator consumes.

import { MISSION_TYPES, MISSION_STATES } from './mission.js';

const S = MISSION_STATES;

export const MISSION_CATALOG = Object.freeze([
  // ────────────────── TIER 1: Missions 1-6 (easy → moderate) ──────────────────
  // Complete all 6 to unlock the astronaut.

  {
    id: 'capture-01',
    title: 'Feed the Void',
    description: 'Send the object into the black hole.',
    type: MISSION_TYPES.STATE,
    state: S.HORIZON_CROSSING,
    difficulty: 1,
    recommendedObjectIds: Object.freeze(['rock', 'planet']),
    hint: 'Aim straight at the center — the black hole swallows anything that gets close enough.',
  },
  {
    id: 'near-horizon-01',
    title: 'Touch the Edge',
    description: 'Pass within 2× the event horizon.',
    type: MISSION_TYPES.NEAR_HORIZON,
    target: 2.0,
    difficulty: 1,
    recommendedObjectIds: Object.freeze(['rock', 'human']),
    hint: 'Aim near the black hole but not straight in — a close pass counts.',
  },
  {
    id: 'flyby-01',
    title: 'Gravity Assist',
    description: 'Slingshot past the black hole without being captured.',
    type: MISSION_TYPES.STATE,
    state: S.FLYBY,
    difficulty: 2,
    recommendedObjectIds: Object.freeze(['rock', 'human']),
    hint: 'A moderate sideways throw with some speed will bend around the hole and escape.',
  },
  {
    id: 'score-01',
    title: 'First Points',
    description: 'Score at least 500 points.',
    type: MISSION_TYPES.SCORE,
    target: 500,
    difficulty: 2,
    recommendedObjectIds: Object.freeze(['rock', 'human']),
    hint: 'A close pass that stretches the object earns precision + stretch points.',
  },
  {
    id: 'tear-01',
    title: 'Tear It Apart',
    description: 'Rip the object — get at least 1 tear.',
    type: MISSION_TYPES.TEAR_COUNT,
    target: 1,
    difficulty: 2,
    recommendedObjectIds: Object.freeze(['rock', 'planet']),
    hint: 'Get the object close enough and tidal forces will pull it apart.',
  },
  {
    id: 'orbit-01',
    title: 'Find the Orbit',
    description: 'Achieve a stable orbital trajectory.',
    type: MISSION_TYPES.STATE,
    state: S.ORBITAL,
    difficulty: 3,
    recommendedObjectIds: Object.freeze(['rock', 'ship']),
    hint: 'A sideways throw at the right speed can loop around instead of falling in or flying away.',
  },

  // ────────────────── TIER 2: Missions 7-12 (moderate → hard) ──────────────────
  // Complete all 12 to unlock the ship. Planet unlocks after level progression.

  {
    id: 'near-horizon-02',
    title: 'Precision Pass',
    description: 'Pass within 1.5× the event horizon.',
    type: MISSION_TYPES.NEAR_HORIZON,
    target: 1.5,
    difficulty: 3,
    recommendedObjectIds: Object.freeze(['rock', 'human']),
    hint: 'Closer than Touch the Edge — thread the needle just outside the event horizon.',
  },
  {
    id: 'stretch-01',
    title: 'Spaghettify',
    description: 'Stretch an object to 2× its original size.',
    type: MISSION_TYPES.STRETCH,
    target: 2.0,
    difficulty: 3,
    recommendedObjectIds: Object.freeze(['human', 'ship']),
    hint: 'A close pass stretches the object — the closer you get, the more it pulls apart.',
  },
  {
    id: 'escape-01',
    title: 'Break Free',
    description: 'Escape the black hole entirely.',
    type: MISSION_TYPES.STATE,
    state: S.ESCAPING,
    difficulty: 4,
    recommendedObjectIds: Object.freeze(['rock', 'human']),
    hint: 'A hard, fast throw aimed outward is the only way to escape gravity.',
  },
  {
    id: 'tear-02',
    title: 'Demolition Expert',
    description: 'Rip the object apart at least 4 times.',
    type: MISSION_TYPES.TEAR_COUNT,
    target: 4,
    difficulty: 4,
    recommendedObjectIds: Object.freeze(['planet', 'ship']),
    hint: 'Multi-point objects (planet, ship) can tear many times on a deep plunge.',
  },
  {
    id: 'score-02',
    title: 'Score Master',
    description: 'Score at least 2,000 points.',
    type: MISSION_TYPES.SCORE,
    target: 2000,
    difficulty: 4,
    recommendedObjectIds: Object.freeze(['ship', 'planet']),
    hint: 'Stack precision + stretch + destruction — a close tearing pass with survival multiplier is the dream throw.',
  },
  {
    id: 'score-03',
    title: 'High Roller',
    description: 'Score at least 4,000 points.',
    type: MISSION_TYPES.SCORE,
    target: 4000,
    difficulty: 5,
    recommendedObjectIds: Object.freeze(['planet', 'ship']),
    hint: 'You need everything: near-horizon precision, maximum spaghettification, many tears, and survival. The perfect throw.',
  },
]);

export function getMission(id) {
  return MISSION_CATALOG.find((m) => m.id === id) || null;
}

export function getDefaultMissionId() {
  return MISSION_CATALOG[0] ? MISSION_CATALOG[0].id : null;
}
