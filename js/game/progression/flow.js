// game/progression/flow.js — PURE planner for the mission-outcome presentation.
// Turns the protocol already mandated by the campaign controller into a single
// renderable plan for the result panel:
//
//   { mission, missionResult, alreadyCompleted, completeOutcome, campaignComplete }
//     → { status, tone, progression }
//
// Important rules it encodes (and never re-derives itself):
//  * status text is decided from missionResult.completed + the ALREADY flag
//    (replay → "MISSION ALREADY COMPLETED", never a fake unlock).
//  * an unlock line exists ONLY when completeOutcome.unlockedMissionId exists —
//    that id is the single source of truth; no mission-index inference.
//  * campaign complete displays a special final plan (still throwable).
// Three.js-free, DOM-free, never mutates inputs, never throws on garbage.

import { getMission, isValidMission } from '../missions/index.js';
import { MISSION_ORDER } from './state.js';

const NO_MISSION = { missionId: null, completed: false, replay: false, status: '', tone: '', progression: null };

// Phase 24: computed, not hardcoded — the ladder is now 6 missions (Grazing the
// Void moved to optional), so the final display derives from MISSION_ORDER.
const CAMPAIGN_TITLE = `${MISSION_ORDER.length} / ${MISSION_ORDER.length} Missions`;

// Build the renderable plan for one finalized throw. Defensive by construction:
// any malformed input (mission or result) collapses to a clean "failed / no
// progression" plan.
export function missionFlow({ mission, missionResult, alreadyCompleted, completeOutcome, campaignComplete }) {
  if (!isValidMission(mission)) return NO_MISSION;

  const failed = !missionResult || missionResult.completed !== true;
  if (failed) {
    return {
      missionId: mission.id,
      completed: false,
      replay: false,
      status: 'Mission Failed',
      tone: 'fail',
      progression: null,
      nudge: mission.hint || '',
    };
  }

  const replay = alreadyCompleted === true;
  const justCompleted = completeOutcome && completeOutcome.changed === true;

  // The one throw that flips the whole campaign: final mission just completed.
  if (justCompleted && campaignComplete === true) {
    return {
      missionId: mission.id,
      completed: true,
      replay: false,
      status: 'Campaign Complete',
      tone: 'final',
      progression: {
        kicker: 'Campaign',
        title: CAMPAIGN_TITLE,
        tagline: 'You conquered the black hole.',
        tone: 'final',
      },
    };
  }

  // A genuine first completion that unlocked exactly one next mission.
  const unlockedMissionId = justCompleted ? completeOutcome.unlockedMissionId : null;
  if (unlockedMissionId) {
    const next = getMission(unlockedMissionId);
    return {
      missionId: mission.id,
      completed: true,
      replay: false,
      status: 'Mission Complete',
      tone: 'done',
      progression: {
        kicker: 'Next Mission',
        title: next ? next.title : '',
        tagline: '',
        tone: 'unlock',
      },
    };
  }

  // Completed but nothing new — replay of an already-completed mission, or a
  // first completion that unlocks nothing (all later missions already open).
  return {
    missionId: mission.id,
    completed: true,
    replay,
    status: replay ? 'Mission Already Completed' : 'Mission Complete',
    tone: replay ? 'already' : 'done',
    progression: null,
  };
}