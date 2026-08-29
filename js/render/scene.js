// render/scene.js — SceneManager: renderer + camera + scene graph, wiring the
// lights, starfield, and the black-hole set-piece together each frame.

import { buildLights } from './lights.js';
import { makeStarLayer } from './starfield.js';
import { buildBlackHole } from './blackhole.js';

export class SceneManager {
  constructor(container, config) {
    this.container = container;
    this.config = config; // { horizonRadius }

    this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance', preserveDrawingBuffer: true });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.1;
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setSize(container.clientWidth, container.clientHeight);
    container.appendChild(this.renderer.domElement);

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(60, container.clientWidth / container.clientHeight, 0.1, 4000);
    this.camera.position.set(0, 9.6, 208);
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
    if (this.bh?.lensGroup) this.bh.lensGroup.quaternion.copy(this.camera.quaternion);
  }

  render() {
    this.renderer.render(this.scene, this.camera);
  }
}