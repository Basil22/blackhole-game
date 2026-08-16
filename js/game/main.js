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
import { buildHeld } from './spawn.js';
import { startLoop } from './loop.js';

const SPAWN = new THREE.Vector3(0, 19.2, 384);

export class Game {
  constructor(container, { onUiState } = {}) {
    this.container = container;
    this.onUiState = onUiState || (() => {});
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

    // telemetry for the physics readout
    this.telemetry = {
      initialSpan: 0, maxSpan: 0, tears: 0, consumed: 0, dist: 0, timeScale: 1,
    };
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
    this.input = new CameraInput(this.container, this.scene.camera, {
      isAiming: () => this.state === 'aim',
      onAimMove: (dx, dy) => {
        this.aim.dx += dx * 0.9;
        this.aim.dy += dy * 0.9;
        this._updateAimArrow();
      },
      onAimEnd: () => this.launch(),
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
    // rebuild the held preview if already aiming
    if (this.state === 'aim') this._spawnHeld();
    this.onUiState({ object: id });
  }

  setSize(s) {
    this.size = Math.max(0.3, Math.min(10, s));
    if (this.state === 'aim') this._spawnHeld();
    this.onUiState({ size: this.size });
  }

  // Called by UI "THROW" button (or Enter key)
  beginAim() {
    if (this.state === 'aim') return;
    if (!this.currentId) return;
    this._spawnHeld();          // show the object at full scale, sitting at spawn
    this.state = 'aim';
    this.aim.active = false;
    this.aim.dx = 0; this.aim.dy = 0;
    this._showAimArrow();
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
      timeScale: this.timeScale,
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

    this.throwCount++;
    this.objects.push(this.held);
    this.telemetry = this.held.telemetry;
    this.held = null;
    this.state = 'flying';
    this.aim.active = false;
    this.aimArrow.hide();
    this.onUiState({ state: 'flying' });
  }

  disposeObject() {
    this._disposeHeld();
    this._disposeAllObjects();
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

  // ---------- aim arrow ----------
  _showAimArrow() {
    this.aimArrow.show(this.spawnPos);
    this.aimArrow.update(this.spawnPos, this.held.world, this.aim);
  }

  _updateAimArrow() {
    if (!this.aimArrow || !this.held) return;
    this.aimArrow.update(this.spawnPos, this.held.world, this.aim);
  }

  // ---------- resize / dispose ----------
  _bindResize() {
    this._onResize = () => this.scene.resize();
    window.addEventListener('resize', this._onResize);
  }

  dispose() {
    this._disposed = true;
    this.stopLoop();
    window.removeEventListener('resize', this._onResize);
  }
}