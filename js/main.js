import { Game } from './game/main.js';
import { UI } from './game/ui.js';
import { ResultPanel } from './game/result.js';
import { MissionUI } from './game/missionui.js';
import { evaluateMission, getMission } from './game/missions/index.js';
import { Progression, missionFlow } from './game/progression/index.js';
import { CATALOG } from './objects.js';
import { applyBranding, BRAND } from './ui/theme.js';
import { TERMINATION } from './physics.js';
import { createAudioSystem } from './audio/index.js';
import { icon } from './ui/icons.js';

applyBranding({ title: `${BRAND.name} — Spaghettification Sandbox`, wordmark: BRAND.name });

const container = document.getElementById('canvas-container');
let ui;

// Audio layer — entirely emissive, enhancement-only. Lazily unlocked on the
// first user gesture (mobile autoplay), suspended whenever the page is hidden,
// muted via localStorage preference. If anything in here is missing the game
// behaves exactly as before — audio never writes game state.
const audio = createAudioSystem();
const AUDIO_KEY = 'bh_audio_enabled';
const savedAudio = localStorage.getItem(AUDIO_KEY);
if (savedAudio !== null) audio.setMuted(savedAudio !== '1');
const audioBtn = document.getElementById('audio-btn');
const renderAudioBtn = () => {
  const muted = audio.isMuted();
  audioBtn.innerHTML = icon(muted ? 'speaker-off' : 'speaker-on', 20);
  audioBtn.classList.toggle('muted', muted);
  audioBtn.setAttribute('title', muted ? 'Unmute sound' : 'Mute sound');
  audioBtn.setAttribute('aria-label', muted ? 'Unmute sound' : 'Mute sound');
};
renderAudioBtn();
audioBtn.addEventListener('click', () => {
  audio.setMuted(!audio.isMuted());
  localStorage.setItem(AUDIO_KEY, audio.isMuted() ? '0' : '1');
  renderAudioBtn();
});

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
  onUiState: (st) => { if (ui) ui.onGameState(st); },
  audio,
});
ui = new UI(game);

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
missionUI.select(progression.state.currentMissionId);
missionUI.refresh(progression);

// throw-result presentation — feeds ONLY on finalized telemetry + score
const resultPanel = new ResultPanel(document.getElementById('result'), {
  onAgain: () => {
    // result disappears the moment a new throw begins (beginAim fires onBeginAim)
    game.beginAim();
  },
});
game.onThrowEnded = (telemetry, score) => {
  const def = CATALOG.find((o) => o.id === game.currentId);
  const mission = missionUI.getSelected();
  const missionResult = mission
    ? { ...evaluateMission(mission, { telemetry, score }), title: mission.title }
    : null;

  // campaign: advance ONLY on a real first completion. The ALREADY flag is read
  // BEFORE completing so a replay can never masquerade as a new unlock.
  const alreadyCompleted = !!(mission && missionResult && missionResult.completed === true
    && progression.isCompleted(mission.id));
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

  // Audio: mission outcome as a restrained confirmation. A PLAYER_RESET cancel
  // is not a mission outcome — it stays silent (Phase-15 cancel semantics).
  if (telemetry.terminationReason !== TERMINATION.PLAYER_RESET && mission && missionResult) {
    if (missionResult.completed === true) {
      if (completeOutcome && completeOutcome.changed) {
        audio.missionComplete();
        if (completeOutcome.unlockedMissionId) audio.missionUnlock();
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
  if (progressionView && progressionView.kicker === 'NEXT MISSION' && completeOutcome && completeOutcome.unlockedMissionId) {
    const next = getMission(completeOutcome.unlockedMissionId);
    if (next && next.hint) {
      progressionView = { ...progressionView, hint: next.hint };
    }
  }
  resultPanel.show(telemetry, score, def ? def.name : '', {
    title: missionResult ? missionResult.title : '',
    status: plan.status,
    tone: plan.tone,
  }, progressionView);
};
game.onBeginAim = () => resultPanel.hide();
document.getElementById('result-scrim').addEventListener('click', () => resultPanel.hide());

game.selectObject('rock');
window.__game = game;          // debug hook
window.__audio = audio;        // debug hook (audio/haptics introspection)
window.__missionUI = missionUI; // debug hook (selection + evaluation readback)
Object.defineProperty(window.__game, 'progression', {
  get: () => progression.snapshot,
});
window.__game.resetProgression = () => {
  progression.reset();
  missionUI.select(progression.state.currentMissionId);
  missionUI.refresh(progression);
};
