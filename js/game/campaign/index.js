// game/campaign/index.js — barrel for the Phase-19 campaign layer.
// Pure underneath: levels.js / state.js / storage.js have no Three.js, DOM,
// physics, telemetry, or score knowledge. The controller consumes ONLY the
// completed-mission id array from the existing Progression controller.
export { Campaign } from './campaign.js';
export {
  CAMPAIGN_LEVELS,
  getLevel,
  getLevelByIndex,
  getFirstLevel,
  getLastLevel,
} from './levels.js';
export {
  CAMPAIGN_VERSION,
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
} from './state.js';
export { CAMPAIGN_STORAGE_KEY, loadCampaign, saveCampaign, clearCampaign } from './storage.js';
