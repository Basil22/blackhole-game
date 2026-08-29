// game/challenges/index.js — barrel for the Phase-10 challenge layer.
// Pure underneath: profiles.js / catalog.js / evaluate.js are Three.js-free,
// DOM-free, physics-free, deterministic, and immutable. Nothing here ever
// touches the sim, telemetry, score, or scoring engine.
export {
  OBJECT_IDS,
  OBJECT_DIFFICULTY_LABELS,
  OBJECT_CHALLENGE_PROFILES,
  getObjectChallengeProfile,
  difficultyLabel,
} from './profiles.js';
export {
  MISSION_DIFFICULTY_LABELS,
  isValidObjectChallengeProfile,
  isValidMissionChallenge,
  isKnownMission,
  missionDifficulty,
  getMissionChallenge,
  validateChallengeData,
} from './catalog.js';
export { getRecommendedObject } from './evaluate.js';