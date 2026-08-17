// game/progression/index.js — barrel for the Phase-8 campaign-progression
// layer. Pure underneath: state.js / storage.js have no Three.js, DOM, physics,
// telemetry, or score knowledge. The controller consumes ONLY evaluateMission
// results (missionResult.completed).
export { Progression } from './progression.js';
export {
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
} from './state.js';
export { missionFlow } from './flow.js';
export { PROGRESSION_STORAGE_KEY, loadProgression, saveProgression, clearProgression } from './storage.js';