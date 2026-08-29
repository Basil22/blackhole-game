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

const NO_MISSION = { missionId: null, completed: false, replay: false, status: '', tone: '', progression: null };

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
      status: 'MISSION FAILED',
      tone: 'fail',
      progression: null,
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
      status: 'CAMPAIGN COMPLETE',
      tone: 'final',
      progression: {
        kicker: 'CAMPAIGN',
        title: '7 / 7 MISSIONS',
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
      status: 'MISSION COMPLETE',
      tone: 'done',
      progression: {
        kicker: 'NEXT MISSION',
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
    status: replay ? 'MISSION ALREADY COMPLETED' : 'MISSION COMPLETE',
    tone: replay ? 'already' : 'done',
    progression: null,
  };
}