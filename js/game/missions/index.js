// game/missions/index.js — barrel for the Phase-7 mission/objective layer.
//   Pure: evaluate.js / mission.js / catalog.js are Three.js-free, DOM-free,
//   physics-free. Missions consume ONLY the finalized ThrowTelemetry +
//   ThrowScore (game.lastTelemetry / game.lastScore). No mission ever runs its
//   own simulation — evaluation happens once, after a real throw ends.
export { MISSION_TYPES, MISSION_STATES, isValidMission } from './mission.js';
export { MISSION_CATALOG, getMission, getDefaultMissionId } from './catalog.js';
export { evaluateMission } from './evaluate.js';
