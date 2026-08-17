// game/main.js — Game controller: state machine + fixed-timestep loop that
// wires physics, rendering, and input together. Input/orbit lives in input.js,
// aim arrow in aim.js, launch math in trajectory.js, readout in readout.js,
// object spawn in spawn.js, timestep in sim.js.

import { getObjectDef } from '../objects.js';
import { SceneManager } from '../render/scene.js';
import { ParticleSystem } from '../render/objects.js';
import { CameraInput } from './input.js';
import { AimArrow } from './aim.js';
import { launchVelocity } from './trajectory.js';
import { buildHeld, colorFor } from './spawn.js';
import { startLoop } from './loop.js';
import { createThrowTelemetry, TERMINATION } from '../physics.js';
import { calculateThrowScore } from './scoring/index.js';
import { calculateGuidance, launchChanged, TrajectoryPath } from './guidance/index.js';
import { aimFractions } from './aiming/index.js';
import { GuideHud } from './guidehud.js';

const SPAWN = new THREE.Vector3(0, 19.2, 384);

export class Game {
  constructor(container, { onUiState, audio } = {}) {
    this.container = container;
    this.onUiState = onUiState || (() => {});
    // Optional audio layer (js/audio). Purely emissive — it reads state and
    // plays events; it never writes to physics/telemetry/score/mission. When
    // absent or locked, the game behaves exactly as before.
    this.audio = audio || null;
    this.config = { horizonRadius: 40 };

    this.scene = new SceneManager(container, this.config);
    this.particles = new ParticleSystem(this.scene.scene);

    this.objects = [];          // active sims (each throw = own world+visualizer)
    this.held = null;           // aim-preview object { world, visualizer, meta }
    this.state = 'idle';        // idle | aim | flying
    this.slowmo = false;
    this.timeScale = 1;
    this.size = 1;              // throwable scale multiplier
    this.throwCount = 0;

    // telemetry: live readout mirror + the last finalized throw result.
    // The full result object (created at finalize) is stored on `lastTelemetry`,
    // and its pure score on `lastScore` — inspect window.__game.lastScore.
    this.telemetry = {
      initialSpan: 0, maxSpan: 0, tears: 0, consumed: 0, dist: 0,
    };
    this.lastTelemetry = null;
    this.lastScore = null;
    this._readoutTimer = 0;

    // fixed-timestep accumulator state (used by loop.js)
    this.simTime = 0;
    this._readoutTimer = 0;
    this._readoutEl = document.getElementById('readout');

    // aim state
    this.aim = { active: false, startX: 0, startY: 0, dx: 0, dy: 0 };
    this.spawnPos = SPAWN.clone();

    this._disposed = false;

    this.aimArrow = new AimArrow(this.scene.scene);
    this.trajPath = new TrajectoryPath(this.scene.scene, { horizonRadius: this.config.horizonRadius });
    // Pure prediction result while aiming (plain data, see guidance/guidance.js);
    // null outside aiming. Exposed at window.__game.guidance. The prediction
    // NEVER affects the real simulation — it is purely informational.
    this.guidance = null;
    this._lastGuideVel = null;
    this.guideHud = new GuideHud(document.getElementById('guidance-hud'));
    // Horizon-crossing audio is a once-per-throw event (reset on each launch).
    this._horizonSounded = false;
    // Phase 18 — aim-high cue latch: the audio fires ONCE when the pull enters
    // the powerful tail (power01 ≥ 0.78 after Phase 24's envelope lift, a UI
    // reading of the existing mapping), and re-arms only when the player pulls
    // back below the threshold.
    this._highPowerLatched = false;
    // Callbacks set by the app shell (js/main.js): onThrowEnded fires with
    // {lastTelemetry, lastScore} right after a throw's result is finalized.
    this.onThrowEnded = null;
    this.onBeginAim = null;
    this.input = new CameraInput(this.container, this.scene.camera, {
      isAiming: () => this.state === 'aim',
      onAimMove: (dx, dy) => {
        this.aim.dx += dx * 0.9;
        this.aim.dy += dy * 0.9;
        this._updateAimArrow();
      },
      onAimEnd: () => this.launch(),
      onCancelAim: () => this.cancelAim(),
      onSpace: () => this.beginAim(),
      onEnter: () => this.launch(),
      onSlowmo: () => this.toggleSlowmo(),
      onRespawn: () => this.disposeObject(),
      syncZoomSlider: (d) => this.input.syncZoomSlider(d),
    });

    this._bindResize();
    this.stopLoop = startLoop(this);
    this._lastT = performance.now();
  }

  // ---------- selection / throwing ----------
  selectObject(id) {
    this.currentId = id;
    this.audio?.tap('select');
    // rebuild the held preview if already aiming
    if (this.state === 'aim') {
      this._spawnHeld();
      this._updateAimArrow();
    }
    this.onUiState({ object: id });
  }

  setSize(s) {
    this.size = Math.max(0.3, Math.min(10, s));
    this.audio?.slider();
    if (this.state === 'aim') {
      this._spawnHeld();
      this._updateAimArrow();
    }
    this.onUiState({ size: this.size });
  }

  // Called by UI "THROW" button (or Enter key)
  beginAim() {
    if (this.state === 'aim') return;
    if (!this.currentId) return;
    if (this.onBeginAim) this.onBeginAim();   // dismiss any prior throw result
    this.audio?.aimStart();
    this._spawnHeld();          // show the object at full scale, sitting at spawn
    this.state = 'aim';
    this.aim.active = false;
    this.aim.dx = 0; this.aim.dy = 0;
    this._highPowerLatched = false;
    this._showAimArrow();
    this._updateGuidance();     // draw the base predicted path for this object
    this.onUiState({ state: 'aim' });
  }

  _spawnHeld() {
    this._disposeHeld();
    this.held = buildHeld({
      def: getObjectDef(this.currentId),
      size: this.size,
      spawnPos: this.spawnPos,
      horizonRadius: this.config.horizonRadius,
      scene: this.scene.scene,
    });
    return this.held.meta;
  }

  _disposeHeld() {
    if (!this.held) return;
    this.held.visualizer.dispose();
    this.held = null;
  }

  _disposeAllObjects() {
    for (const o of this.objects) o.visualizer.dispose();
    this.objects.length = 0;
  }

  launch() {
    if (this.state !== 'aim') return;
    if (!this.held) return;
    const vel = launchVelocity(this.held.world, this.spawnPos, this.aim);
    for (const p of this.held.world.bodies) {
      p.vel.x = vel.x; p.vel.y = vel.y; p.vel.z = vel.z;
    }

    // Start the throw telemetry AFTER the launch velocity is applied so its
    // initial snapshot reflects the real throw (COM state + speed + distance).
    this.held.telemetry = createThrowTelemetry({ world: this.held.world });

    this.throwCount++;
    this._horizonSounded = false;
    this.objects.push(this.held);
    this.telemetry = this.held.telemetry;
    this.held = null;
    this.state = 'flying';
    this.aim.active = false;
    this.aimArrow.hide();
    // Presentation handoff: the predicted path dissolves instead of blinking
    // out (the real object continues the line the player was shown), and a
    // short directional puff marks the moment of release. Prediction state is
    // cleared as before — the real sim takes over.
    this.audio?.launch({ object: this.currentId });
    this.guidance = null;
    this._lastGuideVel = null;
    this.guideHud.hide();
    this.trajPath.fadeOut();
    this.particles.launchTrail(
      this.spawnPos, vel,
      this.currentId ? colorFor(this.currentId) : 0xffa040,
    );
    this.onUiState({ state: 'flying' });
  }

  disposeObject() {
    // Player cut the throw short — finalize any in-flight telemetry as such.
    for (const o of this.objects) {
      if (o.telemetry) {
        this.lastTelemetry = o.telemetry.finalizeThrow(TERMINATION.PLAYER_RESET);
        this.lastScore = calculateThrowScore(this.lastTelemetry);
        if (this.onThrowEnded) this.onThrowEnded(this.lastTelemetry, this.lastScore);
      }
    }
    this._disposeHeld();
    this._disposeAllObjects();
    this._clearGuidance();
    this.state = 'idle';
    this.aim.active = false;
    this.aimArrow.hide();
    this.onUiState({ state: 'idle' });
  }

  toggleSlowmo() {
    this.slowmo = !this.slowmo;
    this.timeScale = this.slowmo ? 0.25 : 1;
    this.onUiState({ slowmo: this.slowmo });
  }

  // Phase 17 — CANCEL: back out of an aim without launching or finalizing
  // anything. This is NOT a throw and NOT a failed throw: no telemetry, no
  // score, no mission evaluation, no progression, no object consumption. The
  // aim visuals (arrow + predicted path) are cleared and the UI returns to
  // the pre-throw state with the object selection/size/zoom intact. The only
  // audio is a subtle UI tick — never a launch/capture/escape/horizon/mission
  // signal. Placed after toggleSlowmo() so source-slice tests that treat the
  // disposeObject() path as audio-silent stay intact.
  cancelAim() {
    if (this.state !== 'aim') return;
    this._disposeHeld();
    this._clearGuidance();
    this.aim.active = false;
    this.aim.dx = 0; this.aim.dy = 0;
    this.aimArrow.hide();
    this.state = 'idle';
    this.audio?.cancel();
    this._highPowerLatched = false;
    this.onUiState({ state: 'idle' });
  }

  // ---------- aim arrow ----------
  _showAimArrow() {
    this.aimArrow.show(this.spawnPos);
    this.aimArrow.update(this.spawnPos, this.held.world, this.aim);
  }

  _updateAimArrow() {
    if (!this.aimArrow || !this.held) return;
    this.aimArrow.update(this.spawnPos, this.held.world, this.aim);
    this._updateGuidance();
  }

  // Recompute the predicted path only when the launch velocity meaningfully
  // changed (direction/power throttle in guidance.launchChanged); otherwise the
  // pointer-move cadence would re-run a multi-ms prediction every pixel.
  _updateGuidance() {
    if (!this.held || this.state !== 'aim') return;
    const vel = launchVelocity(this.held.world, this.spawnPos, this.aim);
    if (!launchChanged(this._lastGuideVel, vel)) return;
    this._lastGuideVel = vel.clone();
    this.guidance = calculateGuidance({
      mu: this.held.world.mu,
      horizonRadius: this.held.world.horizonRadius,
      pos: { x: this.spawnPos.x, y: this.spawnPos.y, z: this.spawnPos.z },
      vel: { x: vel.x, y: vel.y, z: vel.z },
    });
    this.trajPath.update(this.guidance);
    this.guideHud.show(this.guidance);
    // Phase 18 — aim-high cue: derived from the existing mapping (power01 is a
    // UI-normalized reading; it is never displayed). Latched so the throttled
    // prediction recompute can't re-fire it; only a pull-back below the
    // threshold re-arms. Pure audio side-channel, never a state writer.
    // Phase 24: threshold 0.70 so the cue fires at tangFrac ≈ 1.34 — a
    // powerful but BOUND pass, well before escape (√2 ≈ 1.414). Adjusted for
    // tangMax 1.77 (needed for 360px mobile escape reachability).
    const fr = aimFractions({ dx: this.aim.dx, dy: this.aim.dy });
    const high = fr.power01 >= 0.70;
    if (high && !this._highPowerLatched) {
      this._highPowerLatched = true;
      this.audio?.aimHigh();
    } else if (!high) {
      this._highPowerLatched = false;
    }
  }

  _clearGuidance() {
    this.guidance = null;
    this._lastGuideVel = null;
    this.trajPath.hide();
    this.guideHud.hide();
  }

  // ---------- resize / dispose ----------
  _bindResize() {
    this._onResize = () => this.scene.resize();
    window.addEventListener('resize', this._onResize);
  }

  dispose() {
    this._disposed = true;
    this.stopLoop();
    this.trajPath.dispose();
    window.removeEventListener('resize', this._onResize);
  }
}