// game/android.js — Android-specific behaviors: back button, lifecycle.
// Pure browser-side code — Capacitor APIs are optional (no-op on desktop).

let _game = null;
let _App = null;

export async function initAndroid(game) {
  _game = game;

  // Dynamically import Capacitor — fails silently in browser/unsupported env
  try {
    const mod = await import('@capacitor/app');
    _App = mod.App;
  } catch {
    return; // not in Capacitor — desktop browser, skip
  }

  _setupBackButton();
  _setupLifecycle();
}

function _setupBackButton() {
  if (!_App) return;
  _App.addListener('backButton', ({ canGoBack }) => {
    if (!_game) return;
    const s = _game.state;

    // Settings modal → close
    const settingsModal = document.getElementById('settings-modal');
    if (settingsModal && settingsModal.classList.contains('open')) {
      settingsModal.classList.remove('open');
      return;
    }

    // Menu modal → close
    const menuModal = document.getElementById('menu-modal');
    if (menuModal && menuModal.classList.contains('open')) {
      menuModal.classList.remove('open');
      return;
    }

    // Object picker → close
    if (document.body.classList.contains('obj-panel-open')) {
      document.body.classList.remove('obj-panel-open');
      return;
    }

    // Mission selector → close
    const missionModal = document.getElementById('mission-modal');
    if (missionModal && missionModal.classList.contains('open')) {
      missionModal.classList.remove('open');
      return;
    }

    // Result panel → close
    const resultEl = document.getElementById('result');
    if (resultEl && resultEl.classList.contains('open')) {
      resultEl.classList.remove('open');
      document.body.classList.remove('result-open');
      return;
    }

    // During aim → cancel (safer than launching)
    if (s === 'aim') {
      _game.cancelAim?.() || _game.restoreIdle?.();
      return;
    }

    // During flying → do nothing (wait for throw to end)
    if (s === 'flying') return;

    // Opening/idle → Android default behavior (minimize/exit)
    if (!canGoBack) {
      _App.exitApp();
    }
  });
}

function _setupLifecycle() {
  if (!_App) return;

  _App.addListener('appStateChange', ({ isActive }) => {
    if (!isActive && _game) {
      if (_game.state === 'flying') {
        _game.restoreIdle?.();
      }
      _game.audio?.suspend?.();
    } else if (isActive && _game) {
      _game.audio?.resume?.();
    }
  });

  _App.addListener('appMovedToBackground', () => {
    if (_game?.state === 'flying') {
      _game.restoreIdle?.();
    }
  });
}
