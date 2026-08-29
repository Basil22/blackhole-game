// game/campaign/levels.js — declarative Phase-19 campaign level definitions.
// Pure content only: id/title/description/objectId/requiredMissionIds/unlocks.
// No physics, no scoring, no UI. Level ids are stable; required missions are
// existing mission-catalog ids (validated in state.js). Completing every
// required mission completes the level; each level unlocks the next level +
// the object the next level plays with. The final level unlocks nothing.
//
// IMPORTANT: this is presentation/progression data only. Object availability
// never touches physics/telemetry/scoring/aiming — it gates the picker.

//  NOTE (Phase 24): survive-near-horizon-01 ("Grazing the Void") is NOT required by
//  any level. Real-sim evidence: the horizon is binary — a close pass (≤1.5×HR)
//  always consumes the object (human: 0 partial survivals near the hole; rock/ship/
//  planet shed mass but all end HORIZON_CROSSING), so no throw is both close and
//  survived. Requiring it would make the campaign unwinnable. It remains in the
//  mission catalog as a real (rock-reachable) optional badge: aim a grazing pass
//  that tears free mass (rock reaches closest ~1.0HR with ~1-4 points surviving).
//  The required ladders below are each completable by every object the player can
//  bring to that level.
export const CAMPAIGN_LEVELS = Object.freeze([
  {
    id: 'level-1',
    index: 1,
    title: 'FIRST CONTACT',
    description: 'Reach the edge of the void with the asteroid.',
    objectId: 'rock',
    requiredMissionIds: Object.freeze([
      'near-horizon-01',
      'orbit-01',
    ]),
    unlocks: Object.freeze({ levelId: 'level-2', objectId: 'human' }),
  },
  {
    id: 'level-2',
    index: 2,
    title: 'THE HUMAN LIMIT',
    description: 'Test the astronaut against gravity, escape, and the void.',
    objectId: 'human',
    requiredMissionIds: Object.freeze([
      'near-horizon-01',
      'escape-01',
      'capture-01',
      'orbit-01',
    ]),
    unlocks: Object.freeze({ levelId: 'level-3', objectId: 'ship' }),
  },
  {
    id: 'level-3',
    index: 3,
    title: 'GRAVITY WELL',
    description: 'Fly the starship through the full mission set.',
    objectId: 'ship',
    requiredMissionIds: Object.freeze([
      'near-horizon-01',
      'escape-01',
      'capture-01',
      'orbit-01',
      'score-01',
      'score-02',
    ]),
    unlocks: Object.freeze({ levelId: 'level-4', objectId: 'planet' }),
  },
  {
    id: 'level-4',
    index: 4,
    title: 'EVENT HORIZON',
    description: 'Master the planet at the very edge of reality.',
    objectId: 'planet',
    requiredMissionIds: Object.freeze([
      'near-horizon-01',
      'escape-01',
      'capture-01',
      'orbit-01',
      'score-01',
      'score-02',
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
