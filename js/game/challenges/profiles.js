// game/challenges/profiles.js — Phase-10 object challenge profiles.
// PURE presentation data. Each profile describes the challenge an object
// presents to the player: a difficulty tier (1..4 → EASY..EXTREME), a short
// identity line, which missions it suits, and a gameplay hint. It NEVER
// describes physics — the mass/points/springs/tearing in js/objects.js are
// untouched; ids reference the exact existing object catalog ids.

// Canonical object-id vocabulary (single source for the challenge layer).
// Must match the ids in js/objects.js CATALOG — a cross-check test asserts this.
export const OBJECT_IDS = Object.freeze(['rock', 'human', 'ship', 'planet']);

// Difficulty tier → human label (allowed values 1..4).
export const OBJECT_DIFFICULTY_LABELS = Object.freeze({
  1: 'Easy',
  2: 'Balanced',
  3: 'Hard',
  4: 'Extreme',
});

function makeProfile(props) {
  return Object.freeze({
    id: props.id,
    title: props.title,
    shortDescription: props.shortDescription,
    difficulty: props.difficulty,
    recommendedMissionIds: Object.freeze([...props.recommendedMissionIds]),
    challengeTags: Object.freeze([...props.challengeTags]),
    gameplayHint: props.gameplayHint,
  });
}

export const OBJECT_CHALLENGE_PROFILES = Object.freeze({
  rock: makeProfile({
    id: 'rock',
    title: 'Asteroid',
    shortDescription: 'A forgiving first throw.',
    difficulty: 1,
    recommendedMissionIds: Object.freeze(['capture-01', 'near-horizon-01', 'flyby-01', 'score-01', 'tear-01']),
    challengeTags: Object.freeze(['LIGHT', 'EASY', 'STURDY']),
    gameplayHint: 'Light and slow-spreading — an easy first object.',
  }),
  human: makeProfile({
    id: 'human',
    title: 'Astronaut',
    shortDescription: 'Balanced — articulated and dramatic.',
    difficulty: 2,
    recommendedMissionIds: Object.freeze(['near-horizon-01', 'near-horizon-02', 'stretch-01', 'escape-01']),
    challengeTags: Object.freeze(['BALANCED', 'ARTICULATED', 'TEARS']),
    gameplayHint: 'Every limb stretches and tears dramatically under tidal stress.',
  }),
  ship: makeProfile({
    id: 'ship',
    title: 'Starship',
    shortDescription: 'Heavy hull — rewards precise aim.',
    difficulty: 3,
    recommendedMissionIds: Object.freeze(['escape-01', 'orbit-01', 'tear-02', 'score-02']),
    challengeTags: Object.freeze(['HEAVY', 'WING_SHEAR', 'PRECISION']),
    gameplayHint: 'A heavier object demands more precise launch timing.',
  }),
  planet: makeProfile({
    id: 'planet',
    title: 'Planet',
    shortDescription: 'Huge — shreds brilliantly up close.',
    difficulty: 4,
    recommendedMissionIds: Object.freeze(['tear-02', 'score-02', 'score-03']),
    challengeTags: Object.freeze(['LARGE', 'HIGH_TIDAL_PAYOFF', 'FRAGILE']),
    gameplayHint: 'Its size makes close approaches spectacular — and dangerous.',
  }),
});

export function getObjectChallengeProfile(id) {
  return OBJECT_CHALLENGE_PROFILES[id] || null;
}

// Difficulty tier → label (e.g. 2 → "BALANCED"). "" for any out-of-range value.
export function difficultyLabel(difficulty) {
  return OBJECT_DIFFICULTY_LABELS[difficulty] || '';
}