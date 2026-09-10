// game/campaign/levels.js — declarative campaign level definitions.
// Pure content only: id/title/description/objectId/requiredMissionIds/unlocks.
// No physics, no scoring, no UI.
//
// Structure: 4 levels. Each level's object is the one just unlocked by the
// previous tier. Completing a level's required missions unlocks the next level
// + the next object.
//   Level 1 (Rock)     — tier 1 missions (first 6)
//   Level 2 (Astronaut) — tier 1 + some tier 2 missions
//   Level 3 (Ship)     — all missions
//   Level 4 (Planet)   — all missions (victory lap)

export const CAMPAIGN_LEVELS = Object.freeze([
  {
    id: 'level-1',
    index: 1,
    title: 'First Contact',
    description: 'Learn the basics with the asteroid.',
    objectId: 'rock',
    requiredMissionIds: Object.freeze([
      'capture-01',
      'near-horizon-01',
      'flyby-01',
      'score-01',
      'tear-01',
      'orbit-01',
    ]),
    unlocks: Object.freeze({ levelId: 'level-2', objectId: 'human' }),
  },
  {
    id: 'level-2',
    index: 2,
    title: 'The Human Limit',
    description: 'Push the astronaut through harder challenges.',
    objectId: 'human',
    requiredMissionIds: Object.freeze([
      'capture-01',
      'near-horizon-01',
      'near-horizon-02',
      'stretch-01',
      'escape-01',
      'orbit-01',
    ]),
    unlocks: Object.freeze({ levelId: 'level-3', objectId: 'ship' }),
  },
  {
    id: 'level-3',
    index: 3,
    title: 'Gravity Well',
    description: 'Master the starship across the full mission set.',
    objectId: 'ship',
    requiredMissionIds: Object.freeze([
      'near-horizon-02',
      'stretch-01',
      'escape-01',
      'tear-02',
      'score-02',
      'score-03',
    ]),
    unlocks: Object.freeze({ levelId: 'level-4', objectId: 'planet' }),
  },
  {
    id: 'level-4',
    index: 4,
    title: 'Event Horizon',
    description: 'Conquer every challenge with the planet.',
    objectId: 'planet',
    requiredMissionIds: Object.freeze([
      'near-horizon-02',
      'tear-02',
      'score-02',
      'score-03',
    ]),
    unlocks: null,
  },
]);

export function getLevel(id) {
  return CAMPAIGN_LEVELS.find((l) => l.id === id) || null;
}

export function getLevelByIndex(index) {
  return CAMPAIGN_LEVELS.find((l) => l.index === index) || null;
}

export function getFirstLevel() {
  return CAMPAIGN_LEVELS[0] || null;
}

export function getLastLevel() {
  return CAMPAIGN_LEVELS[CAMPAIGN_LEVELS.length - 1] || null;
}
