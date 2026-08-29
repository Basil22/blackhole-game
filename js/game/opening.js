// game/opening.js — Phase 20 opening experience: title screen + camera dive.
//
// PLAY fades the title overlay and, on the FIRST experience, dives the camera
// in from a distant framing with accelerating motion, a subtle monochrome
// exposure pulse at the screen edges, a slight overshoot/bounce, then settles
// into the exact gameplay framing the orbit/slider controls expect. Afterwards
// gameplay UI is revealed and the player can immediately begin aiming.
//
// Levers (pure, testable):
//   - Skip Intro on Opening → PLAY = quick fade, no camera movement.
//   - Reduced motion (system pref OR explicit setting) → short simple fade,
//     no dive / exposure / bounce.
//
// Performance contract (from the spec): the intro reuses the EXISTING scene +
// renderer + camera; it creates no post-processing, render targets, second
// pipeline, or particle system. The exposure is a CSS class toggle on the
// existing #vignette div (GPU-composited, one transition — zero per-frame DOM
// work). The dive is a short-lived requestAnimationFrame that only writes the
// camera position with a preallocated temp vector — nothing is allocated per
// frame. loop.js is untouched.

// Phase 23 — the dive sweeps the EXTENDED zoom axis: slider -30 (farther than
// the normal max) → slider +30 (the settled gameplay framing). The zoom
// mapping is the Phase-17 axis (0→1200 farthest, 100→96 closest), extended
// linearly so slider -30 = 1531.2 and slider +30 = 868.8. Final zoom is 30.
const AXIS_MIN = 96;     // distFromSlider(100)
const AXIS_MAX = 1200;   // distFromSlider(0)
const AXIS_SPAN = AXIS_MAX - AXIS_MIN; // 1104

// Pure: distance for any extended slider value (negative = farther than max).
export function diveDistFromSlider(s) {
  return AXIS_MAX - (s / 100) * AXIS_SPAN;
}

export const DIVE_SLIDER_FROM = -30;
export const DIVE_SLIDER_TO = 30;
export const DIVE_FROM = diveDistFromSlider(DIVE_SLIDER_FROM); // 1531.2
export const DIVE_TO = diveDistFromSlider(DIVE_SLIDER_TO);     // 868.8
export const GAMEPLAY_ZOOM = 30; // the settled gameplay zoom (camera + UI agree)
export const DIVE_MS = 1500;     // full dive duration
const DIVE_OVER_MAX = 1.06; // allowed radial overshoot fraction
const APPROACH_AT = 0.72;   // when the "approaching" exposure brightens

// Pure easing: radial progress 0..1 (+ a small overshoot past 1 near the end).
// 0) slow accelerating start (easeInOutCubic entry), 1) settles exactly at 1.
export function diveProgress(t) {
  const u = Math.max(0, Math.min(1, t));
  const ease = (x) => (x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2);
  const base = ease(u);
  // trailing sine bump adds the physical bounce-back after the fast approach
  const tail = Math.max(0, Math.min(1, (u - 0.78) / 0.22));
  const over = Math.sin(tail * Math.PI) * 0.05;
  return Math.min(DIVE_OVER_MAX, base + over);
}

export class OpeningScreen {
  constructor({ game, settings, audio, onReady } = {}) {
    this.game = game || null;
    this.settings = settings || null;
    this.audio = audio || null;
    this.onReady = onReady || (() => {});
    this.el = document.getElementById('opening');
    this.playBtn = document.getElementById('opening-play');
    this.settingsBtn = document.getElementById('opening-settings');
    this.hintEl = document.getElementById('opening-skip-hint');
    this._onOpenSettings = () => {};
    this.started = false;
    this.ready = false;
    this._raf = 0;
    this._bind();
  }

  set onOpenSettings(fn) {
    this._onOpenSettings = typeof fn === 'function' ? fn : () => {};
  }

  _bind() {
    if (this.playBtn) {
      this.playBtn.addEventListener('click', () => this.play());
    }
    if (this.settingsBtn) {
      this.settingsBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        this._onOpenSettings();
      });
    }
  }

  // Hide/show the skip hint based on whether a full intro will actually run.
  refresh() {
    if (!this.settings || !this.hintEl) return;
    const willIntro = !this.settings.get('skipIntro') && !this.settings.reduceMotionEffective;
    this.hintEl.classList.toggle('hide', !willIntro);
  }

  // Boot: park the camera at the distant framing (only when a real dive will
  // play), gate the keyboard so Space/Enter can't fire before PLAY, and sync
  // the skip hint. Called by js/main.js after all wiring.
  begin() {
    if (!this.game) return;
    this.game.input.setLocked(true);
    this.refresh();
    if (this._fullIntro() && this.game.scene) {
      const cam = this.game.scene.camera;
      cam.position.set(0, 9.6, DIVE_FROM);
      cam.lookAt(0, 0, 0);
    } else if (this.game.scene) {
      this.game.input.syncFromCamera();
    }
  }

  _fullIntro() {
    return !!this.settings
      && !this.settings.get('skipIntro')
      && !this.settings.reduceMotionEffective;
  }

  play() {
    if (this.started || !this.game) return;
    this.started = true;
    this.audio?.tap('select'); // PLAY press: quiet instrumentation tick
    if (!this.settings) { this._done(); return; }
    if (this.settings.get('skipIntro')) { this._enterShort(150); return; }
    if (this.settings.reduceMotionEffective) { this._enterShort(320); return; }
    this._enterDive();
  }

  // Skip-intro / reduced-motion: a short, simple fade. No camera movement,
  // no exposure, no bounce. Just leave the title and land in gameplay.
  _enterShort(ms) {
    const finish = () => {
      if (this.game) {
        this.game.input.syncFromCamera();
        this.game.input.setLocked(false);
      }
      this._done();
    };
    if (!this.el) { finish(); return; }
    this.el.style.transition = `opacity ${ms}ms ease`;
    this.el.classList.add('leaving');
    window.setTimeout(finish, ms);
  }

  // Full intro: fade the title while the camera accelerates in with exposure,
  // overshoot → settle into the gameplay framing, then release input.
  _enterDive() {
    this.game.input.setLocked(true);
    document.body.classList.add('intro-diving');
    if (this.el) {
      this.el.style.transition = 'opacity 420ms ease';
      this.el.classList.add('leaving');
    }
    this.audio?.play('aim-start'); // dive activation: low activation tone
    const startT = performance.now();
    const cam = this.game.scene.camera;
    // Phase 23 — the approach exposure brightens as the camera nears the
    // settle (one class toggle at ~72% of the dive, not per-frame).
    const approachT = window.setTimeout(() => {
      if (this.started && !this.ready) document.body.classList.add('intro-approach');
    }, Math.round(DIVE_MS * APPROACH_AT));
    const tick = (now) => {
      if (!this.game || this.game._disposed) return;
      const t = Math.min(1, (now - startT) / DIVE_MS);
      const p = diveProgress(t);
      // sweep the extended zoom axis: -30 → +30, easing + overshoot past +30
      const sl = DIVE_SLIDER_FROM + (DIVE_SLIDER_TO - DIVE_SLIDER_FROM) * p;
      const d = diveDistFromSlider(sl);
      cam.position.set(0, 9.6, d);
      cam.lookAt(0, 0, 0);
      if (t < 1) {
        this._raf = requestAnimationFrame(tick);
        return;
      }
      this._approachT = approachT;
      this._finishDive();
    };
    this._raf = requestAnimationFrame(tick);
  }

  _finishDive() {
    document.body.classList.remove('intro-diving', 'intro-approach');
    if (this._approachT) { clearTimeout(this._approachT); this._approachT = 0; }
    if (this.game) {
      this.game.input.syncFromCamera(); // orbit continues from the settled framing
      this.game.input.setLocked(false);
    }
    this.audio?.play('aim-state'); // settle blip
    this._done();
  }

  _done() {
    if (this._raf) { cancelAnimationFrame(this._raf); this._raf = 0; }
    if (this._approachT) { clearTimeout(this._approachT); this._approachT = 0; }
    document.body.classList.remove('intro-diving', 'intro-approach');
    if (this.el) this.el.classList.add('hidden');
    this.ready = true;
    this.onReady();
  }

  // Debug/harness hook: complete the intro instantly (no animation) so tests
  // that need gameplay can boot straight past the title screen. Always lands
  // at the settled gameplay framing (zoom 30) — never left at the parked far
  // framing, so camera and zoom UI agree.
  skip() {
    if (this.ready) return;
    this.started = true;
    if (this._raf) { cancelAnimationFrame(this._raf); this._raf = 0; }
    if (this._approachT) { clearTimeout(this._approachT); this._approachT = 0; }
    document.body.classList.remove('intro-diving', 'intro-approach');
    if (this.game) {
      if (this.game.scene) {
        const cam = this.game.scene.camera;
        cam.position.set(0, 9.6, DIVE_TO);
        cam.lookAt(0, 0, 0);
      }
      this.game.input.syncFromCamera(); // settle framing → camera == UI == 30
      this.game.input.setLocked(false);
    }
    if (this.el) this.el.classList.add('hidden');
    this.ready = true;
    this.onReady();
  }
}