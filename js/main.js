import { Game } from './game/main.js';
import { UI } from './game/ui.js';
import { ResultPanel } from './game/result.js';
import { MissionUI } from './game/missionui.js';
import { CampaignUI } from './game/campaignui.js';
import { evaluateMission, getMission, calculateStars } from './game/missions/index.js';
import { Progression, missionFlow } from './game/progression/index.js';
import { ScoreHistory } from './game/scoring/index.js';
import { Campaign, getLevel } from './game/campaign/index.js';
import { DailyTracker } from './game/challenges/index.js';
import { CATALOG } from './objects.js';
import { applyBranding, BRAND } from './ui/theme.js';
import { TERMINATION } from './physics.js';
import { createAudioSystem } from './audio/index.js';
import { Settings, SETTINGS_STORAGE_KEY } from './game/settings/index.js';
import { SettingsUI } from './game/settingsui.js';
import { OpeningScreen } from './game/opening.js';
import { DailyUI } from './game/dailyui.js';
import { Tutorial } from './game/tutorial.js';
import { StatsUI } from './game/statsui.js';

applyBranding({ title: `${BRAND.name} — Spaghettification Sandbox`, wordmark: 'Black Hole' });

const container = document.getElementById('canvas-container');
let ui;
let campaignUI;

// Audio layer — entirely emissive, enhancement-only. Lazily unlocked on the
// first user gesture (mobile autoplay), suspended whenever the page is hidden,
// muted via localStorage preference. Sound + haptics are both driven by the
// Phase-20 settings controller (single source of truth). If anything in here
// is missing the game behaves exactly as before — audio never writes state.
const audio = createAudioSystem();
const AUDIO_KEY = 'bh_audio_enabled'; // legacy mirror (kept for compat)

// ---- Phase 20: unified settings (audio / haptics / skipIntro / reduceMotion)
const systemPref = () => {
  try {
    return !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  } catch (err) {
    return false;
  }
};
const hadSettings = localStorage.getItem(SETTINGS_STORAGE_KEY) !== null;
const settings = new Settings({ storage: localStorage, systemPref });
if (!hadSettings) {
  // migrate the pre-Phase-20 mute preference into the settings model
  const legacy = localStorage.getItem(AUDIO_KEY);
  if (legacy !== null) settings.set('audio', legacy === '1');
}

const audioBtn = null; // Phase 21: audio lives only in Settings (menu → settings)

// One application path: settings → audio/haptics layer + legacy mirror.
const applySettings = (state) => {
  audio.setMuted(state.audio !== true);
  audio.setHapticsEnabled(state.haptics !== false);
  audio.setHapticsReducedMotion(settings.reduceMotionEffective);
  localStorage.setItem(AUDIO_KEY, state.audio === true ? '1' : '0');
};
settings.onApply = applySettings;
applySettings(settings.state);

// First gesture unlocks the AudioContext; the browser can re-suspend it
// between gestures, so unlock is called on every pointer/keydown (idempotent).
const unlockAudio = () => audio.unlock();
window.addEventListener('pointerdown', unlockAudio, { capture: true, passive: true });
window.addEventListener('keydown', unlockAudio, { capture: true, passive: true });
// No background audio: suspend on hide/blur, resume on return (only if the
// context was already unlocked by a real gesture).
document.addEventListener('visibilitychange', () => {
  if (document.hidden) audio.suspend(); else audio.resume();
});
window.addEventListener('blur', () => audio.suspend());
window.addEventListener('focus', () => audio.resume());

const game = new Game(container, {
  onUiState: (st) => {
    // Phase 21: a live throw owns the screen — the level + mission chips slide
    // out (CSS transform on body.gameplay-active) and come back on idle.
    if (typeof st.state === 'string') {
      document.body.classList.toggle('gameplay-active', st.state === 'aim' || st.state === 'flying');
    }
    if (ui) ui.onGameState(st);
    if (campaignUI) campaignUI.onGameState(st);
  },
  audio,
});
const campaign = new Campaign();
ui = new UI(game, { campaign });

// Phase-10: the challenge layer reads the picker's object list as plain data —
// no physics module ever reaches it. Same ids as js/objects.js CATALOG.
const OBJECT_CATALOG = CATALOG.map(({ id, name }) => ({ id, name }));

// mission/objective layer — session-local, informational, never touches the sim.
// The chip shows the current mission; evaluation happens ONLY after a real throw
// finalizes (onThrowEnded), consuming game.lastTelemetry + game.lastScore.
const missionUI = new MissionUI({ objectCatalog: OBJECT_CATALOG });

// campaign progression — linear unlock order over the mission catalog. Loaded
// from localStorage (normalized defensively), advanced ONLY by first mission
// completions. Never reads telemetry/score itself — it trusts the eval flag.
const progression = new Progression();
const scoreHistory = new ScoreHistory();
const dailyTracker = new DailyTracker();
missionUI.select(progression.state.currentMissionId);
missionUI.refresh(progression);

// Phase-19 campaign layer — sits on top of the mission progression (reads its
// completed ids, never evaluates anything itself). Drives the level chip +
// selector, object unlocks in the picker, and the level-complete rewards.
const dailyUI = new DailyUI({
  dailyTracker,
  missionUI,
  onActivate: (mission) => {
    // Daily challenge replaces the mission selection while active
    if (mission && mission.recommendedObjectIds && mission.recommendedObjectIds[0]) {
      ui.setObjectActive(mission.recommendedObjectIds[0]);
    }
  },
});

campaignUI = new CampaignUI({
  campaign,
  objectCatalog: OBJECT_CATALOG,
  onSelectLevel: (objectId) => ui.setObjectActive(objectId),
});
campaignUI.refresh(progression.state.completedMissionIds);
ui.refreshObjectPicker(progression.state.completedMissionIds);

// throw-result presentation — feeds ONLY on finalized telemetry + score
const resultPanel = new ResultPanel(document.getElementById('result'), {
  onAgain: () => {
    // result disappears the moment a new throw begins (beginAim fires onBeginAim)
    game.beginAim();
  },
});
game.onThrowEnded = (telemetry, score) => {
  tutorial.advance('launched');
  tutorial.advance('throw-ended');
  const def = CATALOG.find((o) => o.id === game.currentId);
  const mission = missionUI.getSelected();
  const missionResult = mission
    ? { ...evaluateMission(mission, { telemetry, score }), title: mission.title }
    : null;

  // campaign: advance ONLY on a real first completion. The ALREADY flag is read
  // BEFORE completing so a replay can never masquerade as a new unlock.
  const alreadyCompleted = !!(mission && missionResult && missionResult.completed === true
    && progression.isCompleted(mission.id));
  const completedBefore = [...progression.state.completedMissionIds];
  let completeOutcome = null;
  if (mission && missionResult && missionResult.completed === true) {
    completeOutcome = progression.complete(mission.id);
    if (completeOutcome.changed) {
      if (completeOutcome.unlockedMissionId) {
        missionUI.select(completeOutcome.unlockedMissionId);
      }
      missionUI.refresh(progression);
    }
  }

  // Phase-19 campaign: level completion + object unlocks derive from the
  // completed mission set — a real first completion can complete one or more
  // levels at once (required-mission sets overlap across levels).
  const completedMissionIds = progression.state.completedMissionIds;
  const campaignOutcome = campaign.recordMissionComplete(completedBefore, completedMissionIds);
  if (campaignOutcome.changed) {
    campaignUI.refresh(completedMissionIds);
    ui.refreshObjectPicker(completedMissionIds);
    if (campaignOutcome.currentLevelChanged && campaignOutcome.currentLevelId) {
      const lvl = getLevel(campaignOutcome.currentLevelId);
      if (lvl) {
        game.selectObject(lvl.objectId);
        ui.setObjectActive(lvl.objectId);
        ui.refreshObjectPicker(completedMissionIds);
      }
    }
  }

  // Audio: mission outcome as a restrained confirmation. A PLAYER_RESET cancel
  // is not a mission outcome — it stays silent (Phase-15 cancel semantics).
  if (telemetry.terminationReason !== TERMINATION.PLAYER_RESET && mission && missionResult) {
    if (missionResult.completed === true) {
      if (completeOutcome && completeOutcome.changed) {
        audio.missionComplete();
        if (completeOutcome.unlockedMissionId) audio.missionUnlock();
      }
      if (campaignOutcome.changed && campaignOutcome.unlockedObjects.length) {
        // level-complete unlock — a richer chime than the plain mission unlock
        audio.missionComplete();
        audio.missionUnlock();
      }
    } else {
      audio.missionFailed();
    }
  }

  // The Phase-9 flow planner turns those primitives into the exact result-panel
  // language (status / tone / unlock line) — nothing here re-derives it.
  const plan = missionFlow({
    mission,
    missionResult,
    alreadyCompleted,
    completeOutcome,
    campaignComplete: progression.state.campaignComplete,
  });
  // Phase-10: surface the unlocked mission's declarative hint as a NEXT
  // CHALLENGE line whenever a real unlock actually happened.
  let progressionView = plan.progression;
  if (progressionView && progressionView.kicker === 'Next Mission' && completeOutcome && completeOutcome.unlockedMissionId) {
    const next = getMission(completeOutcome.unlockedMissionId);
    if (next && next.hint) {
      progressionView = { ...progressionView, hint: next.hint };
    }
  }

  // Phase-19: when the throw completed one or more levels, the level-complete
  // rewards REPLACE the mission-unlock line in the result panel (the campaign
  // is the headline). Each completed level gets its own block so a cascade
  // (several levels finished at once) reads correctly.
  let campaignRewards = null;
  if (campaignOutcome.changed && campaignOutcome.newLevels.length) {
    campaignRewards = campaignOutcome.newLevels.map((lvl) => {
      const unlockedId = lvl.unlocks ? lvl.unlocks.objectId : null;
      const unlockedDef = unlockedId ? OBJECT_CATALOG.find((o) => o.id === unlockedId) : null;
      const nextLvl = lvl.unlocks ? getLevel(lvl.unlocks.levelId) : null;
      return {
        kicker: 'Level Complete',
        title: lvl.title,
        tagline: unlockedId && unlockedDef ? `New Object Unlocked — ${unlockedDef.name}` : '',
        tone: campaignOutcome.campaignComplete ? 'final' : 'unlock',
        hint: campaignOutcome.campaignComplete
          ? 'Campaign Complete — You Conquered The Black Hole'
          : (nextLvl ? `Next — Level ${nextLvl.index} · ${nextLvl.title}` : ''),
      };
    });
    progressionView = null;
  }
  // Phase E: daily challenge evaluation (parallel to regular missions)
  if (dailyUI.isActive && telemetry.terminationReason !== TERMINATION.PLAYER_RESET) {
    const dailyResult = dailyUI.evaluate(telemetry, score);
    if (dailyResult && dailyResult.completed) {
      dailyUI.recordComplete(score.total);
      audio.missionComplete();
    }
  }

  // Phase B: star rating + Phase A: score persistence
  let stars = 0;
  let historyResult = { isNewBest: false, previousBest: null };
  if (mission && missionResult && missionResult.completed) {
    stars = calculateStars(mission, { telemetry, score });
  }
  if (mission && telemetry.terminationReason !== TERMINATION.PLAYER_RESET) {
    historyResult = scoreHistory.record(mission.id, {
      total: score.total,
      breakdown: score.breakdown,
      objectId: game.currentId,
      stars,
    });
  }
  resultPanel.show(telemetry, score, def ? def.name : '', {
    title: missionResult ? missionResult.title : '',
    status: plan.status,
    tone: plan.tone,
    nudge: plan.nudge || '',
  }, progressionView, campaignRewards, {
    stars: (mission && missionResult && missionResult.completed) ? stars : 0,
    isNewBest: historyResult.isNewBest,
    previousBest: historyResult.previousBest,
  });
};
game.onBeginAim = () => {
  resultPanel.hide();
  tutorial.advance('aim-start');
};
document.getElementById('result-scrim').addEventListener('click', () => resultPanel.hide());

// ---- Phase 20: settings + opening experience -------------------------------
const settingsUI = new SettingsUI({ settings });
// Phase 21 — settings lives inside the top-left menu (single access point).
const statsUI = new StatsUI({
  scoreHistory,
  dailyTracker,
  progression,
});

document.getElementById('menu-stats').addEventListener('click', () => {
  ui.hideMenu();
  statsUI.open();
});
document.getElementById('settings-open').addEventListener('click', () => {
  ui.hideMenu();
  settingsUI.open();
});
// Phase F: interactive tutorial — first-play step-by-step tips
const tutorial = new Tutorial();

const opening = new OpeningScreen({
  game,
  settings,
  audio,
  onReady: () => {
    // the camera settled + the title screen is gone — gameplay is live. An
    // idle event nudges any first-launch chrome (the campaign DRAG·RELEASE
    // hint reads it), but gameplay was already interactable below the fade.
    game.onUiState({ state: 'idle' });
    // Phase F: launch the interactive tutorial on first play
    tutorial.mount();
  },
});
opening.onOpenSettings = () => settingsUI.open();

game.selectObject('rock');
opening.begin(); // show the title screen + gate input until PLAY
window.__game = game;          // debug hook
window.__audio = audio;        // debug hook (audio/haptics introspection)
window.__settings = settings;  // debug hook (settings introspection)
window.__opening = opening;    // debug hook (harness: opening.skip())
window.__missionUI = missionUI; // debug hook (selection + evaluation readback)
window.__campaignUI = campaignUI; // debug hook (level selector introspection)
Object.defineProperty(window.__game, 'progression', {
  get: () => progression.snapshot,
});
Object.defineProperty(window.__game, 'campaign', {
  get: () => campaign.snapshot,
});
window.__game.resetProgression = () => {
  progression.reset();
  missionUI.select(progression.state.currentMissionId);
  missionUI.refresh(progression);
  campaignUI.refresh(progression.state.completedMissionIds);
  ui.refreshObjectPicker(progression.state.completedMissionIds);
  ui.setObjectActive('rock');
};
window.__game.resetCampaign = () => {
  progression.reset();
  campaign.reset();
  scoreHistory.reset();
  missionUI.select(progression.state.currentMissionId);
  missionUI.refresh(progression);
  campaignUI.refresh(progression.state.completedMissionIds);
  ui.refreshObjectPicker(progression.state.completedMissionIds);
  ui.setObjectActive('rock');
};
window.__scoreHistory = scoreHistory;
window.__tutorial = tutorial;

// Android-specific: back button + lifecycle (no-op on desktop, dynamic import)
import { initAndroid } from './game/android.js';
initAndroid(game);

// Phase 26b: mark that the module actually executed to the end (Android debug).
try {
  if (typeof window !== 'undefined') window.__initOK = true;
} catch (err) { /* ignore */ }
