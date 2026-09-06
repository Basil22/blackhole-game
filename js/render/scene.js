// render/scene.js — SceneManager: renderer + camera + scene graph, wiring the
// lights, starfield, and the black-hole set-piece together each frame.

import { buildLights } from './lights.js';
import { makeStarLayer } from './starfield.js';
import { buildBlackHole } from './blackhole.js';
import { createLensingPass } from './blackhole/lensing.js';

export class SceneManager {
  constructor(container, config) {
    this.container = container;
    this.config = config || {}; // { horizonRadius, quality?, lensing? }

    this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance', preserveDrawingBuffer: true });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.1;
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
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

    // Phase 28 — opaque "shadow core" ball. The lensed pass is additive, so it
    // can only ADD bent plasma, never carve a black void over the starfield.
    // This opaque sphere (radius = the lensed photon shadow, ~2.6 h) supplies
    // the pure-black silhouette that the geodesic fell-region matches; plasma
    // arcs hug its rim. Hidden while the geometry-only path is active.
    const hr = this.config.horizonRadius;
    this.shadowCore = new THREE.Mesh(
      new THREE.SphereGeometry(hr * 2.6, 48, 48),
      new THREE.MeshBasicMaterial({ color: 0x000000, toneMapped: false }),
    );
    this.scene.add(this.shadowCore);
    this.shadowCore.visible = false;

    // Forward the black-hole fx hooks to the lensing pass too (renderer-only:
    // proximity heats the bent plasma, flash/agitate add transient energy).
    // Capture the ORIGINAL methods first — never re-walk bh.* after reassigning
    // (that would recurse into the wrapper).
    const orig = {
      setProximity: bh.setProximity ? bh.setProximity.bind(bh) : null,
      flash: bh.flash ? bh.flash.bind(bh) : null,
      agitate: bh.agitate ? bh.agitate.bind(bh) : null,
      gulp: bh.gulp ? bh.gulp.bind(bh) : null,
    };
    bh.setProximity = (p) => { if (orig.setProximity) orig.setProximity(p); if (this.lensing) this.lensing.setProximity(p); };
    bh.flash = () => { if (orig.flash) orig.flash(); if (this.lensing) this.lensing.flash(); };
    bh.agitate = () => { if (orig.agitate) orig.agitate(); if (this.lensing) this.lensing.agitate(); };
    // Phase 30 — "gulp": a quick shadow expansion + settle timed to consumption
    // (the void visibly swallows). State-driven presentation, no new physics.
    this._gulp = 0;
    bh.gulp = () => {
      if (orig.gulp) orig.gulp();
      if (this.lensing) this.lensing.flash();
      this._gulp = 1;
    };

    // Phase 28 — reduced-resolution relativistic lensing pass. Layers bent
    // plasma around the hero silhouette. Isolated in js/render/blackhole/.
    this.quality = this.config.quality || 'medium';
    this._lensingRequested = this.config.lensing !== false;
    this.lensing = null;
    if (this._lensingRequested) {
      this.lensing = createLensingPass({
        renderer: this.renderer,
        scene: this.scene,
        camera: this.camera,
        hr: this.config.horizonRadius,
        quality: this.quality,
      });
      this._applyLensingVisibility();
    }

    // Real-time animation clock for the black hole. simTime only advances while
    // physics runs, so the disk/ring would freeze the moment a throw ends.
    this._animTime = 0;
  }

  _applyLensingVisibility() {
    const active = !!(this.lensing && this.lensing.enabled.value);
    // When lensing is active the classic black-hole geometry (opaque hero
    // sphere, flat tilted disk, white photon ring, glow sprite) is HIDDEN and
    // replaced by the opaque "shadow core" ball + the additive lensed pass.
    // The pass lays geodesically-bent plasma around the shadow core's pure-black
    // silhouette — plasma genuinely wraps OVER/UNDER the void (Phase-27 ref_a)
    // instead of a flat disk painted over a ball. Geometry returns when lensing
    // is off/quality degree 0 (the LOW / any-failure fallback).
    const geo = active ? this.shadowCore : null;
    if (this.hole) this.hole.visible = !active;
    if (this.diskGroup) this.diskGroup.visible = !active;
    if (this.diskMesh) this.diskMesh.visible = !active;
    if (this.photonRing) this.photonRing.visible = !active;
    if (this.glowSprite) this.glowSprite.visible = !active;
    if (this.shadowCore) this.shadowCore.visible = !!geo;
  }

  setQuality(q) {
    this.quality = q;
    if (this.lensing) {
      this.lensing.setQuality(q);
      this._applyLensingVisibility();
    }
  }

  // Phase 29 — reduced-motion: forward to the lensing pass so the plasma
  // advection slows/stops while the static faceted geometry stays readable.
  setReducedMotion(on) {
    if (this.lensing) this.lensing.setReducedMotion(on);
  }

  setLensingEnabled(on) {
    this._lensingRequested = !!on;
    if (this._lensingRequested && !this.lensing) {
      this.lensing = createLensingPass({
        renderer: this.renderer,
        scene: this.scene,
        camera: this.camera,
        hr: this.config.horizonRadius,
        quality: this.quality,
      });
    }
    if (this.lensing) this.lensing.enabled.value = this._lensingRequested;
    this._applyLensingVisibility();
  }

  resize() {
    const w = this.container.clientWidth, h = this.container.clientHeight;
    this.renderer.setSize(w, h);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    // Keep the reduced lens buffer in step with the drawing buffer (Part K/E):
    // resize it to the new drawing-buffer dimensions and drop the camera aspect
    // into the pass. Aspect is preserved on both axes, so no distortion.
    if (this.lensing) {
      const dw = this.renderer.domElement.width, dh = this.renderer.domElement.height;
      this.lensing.resize(dw, dh);
    }
  }

  update(dt, time) {
    this._animTime += dt;
    // Phase 30 — decay the "gulp" and swell the shadow core (1 → swell peak →
    // settle 1, ~0.4 s). Only the black void moves; nothing in the sim does.
    if (this._gulp > 0) {
      this._gulp = Math.max(0, this._gulp - dt * 2.4);
      const s = 1 + 0.22 * Math.sin(Math.PI * (1 - this._gulp));
      if (this.shadowCore) this.shadowCore.scale.setScalar(s);
    }
    if (this.bh) this.bh.update(dt, this._animTime);
    if (this.lensing) {
      this.lensing.update(dt, this._animTime);
      this.lensing.sync(this.camera);
    }
    this.stars.rotation.y += dt * 0.002;
    if (this.stars2) this.stars2.rotation.y += dt * 0.0015;
    // photon ring always faces the camera -> full circle from any angle
    if (this.photonRing) this.photonRing.quaternion.copy(this.camera.quaternion);
    if (this.bh?.lensGroup) this.bh.lensGroup.quaternion.copy(this.camera.quaternion);
  }

  render() {
    // Phase 28: re-run the reduced-res lensing ray march, then render the scene.
    if (this.lensing) {
      if (this.lensing.enabled.value) this.lensing.render();
      else this._applyLensingVisibility(); // allocation failure => geometry path
      this.lensing.composite();
    }
    this.renderer.render(this.scene, this.camera);
  }
}