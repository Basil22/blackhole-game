// render/scene.js — SceneManager: renderer + camera + scene graph, wiring the
// lights, starfield, and the black-hole set-piece together each frame.

import { buildLights } from './lights.js';
import { makeStarLayer } from './starfield.js';
import { buildBlackHole } from './blackhole.js';

const _spinQ = new THREE.Quaternion();
const _zAxis = new THREE.Vector3(0, 0, 1);

export class SceneManager {
  constructor(container, config) {
    this.container = container;
    this.config = config; // { horizonRadius }

    // Mobile detection: disable MSAA (expensive fillrate) and cap pixel ratio
    // lower to stay within tile-based GPU budgets. preserveDrawingBuffer is off
    // by default (avoids per-frame copy cost); turned on temporarily for capture.
    const mobile = /Mobi|Android/i.test(navigator.userAgent);
    this.renderer = new THREE.WebGLRenderer({
      antialias: !mobile,
      powerPreference: 'high-performance',
      preserveDrawingBuffer: false,
    });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.1;
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, mobile ? 1.5 : 2));
    this.renderer.setSize(container.clientWidth, container.clientHeight);
    container.appendChild(this.renderer.domElement);

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(60, container.clientWidth / container.clientHeight, 0.1, 4000);
    // Phase 23 — the settled gameplay framing IS zoom 30 (dist 868.8 on the
    // zoom axis distFromSlider(30)=1200−0.3·1104). Skip-intro / reduced-motion
    // land here directly; the opening dive settles here too. 208 was the old
    // near close-up (≈slider 90); 868.8 is the wide establishing frame.
    this.camera.position.set(0, 9.6, 868.8);
    this.camera.lookAt(0, -25.6, 0);

    buildLights(this.scene);

    this.stars = makeStarLayer(2400, 7.0, 0.95);
    this.scene.add(this.stars);
    this.stars2 = makeStarLayer(380, 10.0, 0.8);
    this.scene.add(this.stars2);

    const bh = buildBlackHole(this.scene, this.config.horizonRadius);
    this.bh = bh; // fx handle — loop reads sim state and drives setProximity/flash/agitate
    this.hole = bh.hole;
    this.diskGroup = bh.diskGroup;
    this.diskMesh = bh.diskMesh;
    this.diskMat = bh.diskMat;
    this.photonRing = bh.photonRing;
    this.glowSprite = bh.glowSprite;

    // Real-time animation clock for the black hole. simTime only advances while
    // physics runs, so the disk/ring would freeze the moment a throw ends.
    this._animTime = 0;
  }

  resize() {
    const w = this.container.clientWidth, h = this.container.clientHeight;
    this.renderer.setSize(w, h);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  update(dt, time) {
    this._animTime += dt;
    if (this.bh) this.bh.update(dt, this._animTime);
    this.stars.rotation.y += dt * 0.002;
    if (this.stars2) this.stars2.rotation.y += dt * 0.0015;
    // photon ring always faces the camera -> full circle from any angle
    if (this.photonRing) this.photonRing.quaternion.copy(this.camera.quaternion);
    // Lens group: billboard + gentle Z-spin (spin set by bh.update)
    if (this.bh?.lensGroup) {
      const lg = this.bh.lensGroup;
      const spinZ = lg.userData.spinZ || 0; // stashed by bh.update()
      lg.quaternion.copy(this.camera.quaternion);
      // Apply Z-spin on top of the billboard orientation
      _spinQ.setFromAxisAngle(_zAxis, spinZ);
      lg.quaternion.multiply(_spinQ);
    }
  }

  render() {
    this.renderer.render(this.scene, this.camera);
  }
}