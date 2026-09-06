// game/comic/renderer.js — DOM + THREE adapter for the comic layer. Owns one
// full-viewport overlay (pointer-events: none) and a small pool of comic-word
// elements, driving them from a ComicCore via a rAF loop. World anchors are
// projected through the game camera each frame and clamped into a safe screen
// band that clears the HUD chips and bottom controls. Pure presentation.

import { keyframe, MAX_SLOTS, shakeOf } from './comic.js';
import { pickBurstShape } from './burstShapes.js';

const SAFE_TOP = 208;
const SAFE_BOTTOM = 216;
const WORD_OFFSET_Y = 74;

const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
const clamp01v = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);

const mkEl = () => {
  const el = document.createElement('div');
  el.className = 'comic-word';
  el.setAttribute('aria-hidden', 'true');
  return el;
};

// SVG burst helper for comic words
function buildBurstMarkup(word, colorIndex, shapeIndex) {
  const fillColors = ['#FF6B1A', '#FFE135', '#FF3D8A']; // rotate through palette
  const fill = fillColors[colorIndex % fillColors.length];
  const path = pickBurstShape(shapeIndex);
  return `
    <svg class="comic-burst-svg" viewBox="0 0 200 200" aria-hidden="true">
      <path d="${path}" fill="${fill}" stroke="#1A1A1A" stroke-width="6" stroke-linejoin="round"/>
      <circle cx="60" cy="140" r="4" fill="#1A1A1A" opacity="0.35"/>
      <circle cx="140" cy="150" r="3" fill="#1A1A1A" opacity="0.3"/>
      <circle cx="150" cy="60" r="4" fill="#1A1A1A" opacity="0.3"/>
    </svg>
    <span class="comic-burst-text">${word}</span>
  `;
}

export class ComicRenderer {
  constructor(core, camera, opts) {
    this.core = core;
    this.camera = camera;
    const o = opts || {};
    this.overlayId = o.overlayId || 'comic-fx';
    this.overlay = document.createElement('div');
    this.overlay.id = this.overlayId;
    this.overlay.className = 'comic-fx';
    this.overlay.setAttribute('aria-hidden', 'true');
    document.body.appendChild(this.overlay);

    this.pool = [];
    for (let i = 0; i < MAX_SLOTS; i++) this.pool.push(mkEl());
    this._els = new Map(); // slot -> element (iterable, unlike a WeakMap)
    this._v = new THREE.Vector3();
    this._raf = 0;
    this._running = false;
    this._last = 0;
    this._shakeT = 0;
    this.hidden = false;
  }

  setHidden(v) {
    if (this.hidden === !!v) return;
    this.hidden = !!v;
    this.overlay.style.display = v ? 'none' : '';
  }

  screenHeight() {
    return this.overlay.clientHeight || window.innerHeight;
  }

  screenWidth() {
    return this.overlay.clientWidth || window.innerWidth;
  }

  project(anchor) {
    const w = this.screenWidth();
    const h = this.screenHeight();
    let px;
    let py;
    if (anchor.kind === 'mission') {
      // Outcome banner: deterministic top-right slot that clears both HUD
      // chips and the result panel (kept authoritative below the word).
      px = w * 0.66;
      py = 252;
    } else if (anchor.kind === 'screen') {
      px = anchor.x;
      py = anchor.y;
    } else {
      this._v.set(
        anchor.kind === 'bh' ? 0 : anchor.x,
        anchor.kind === 'bh' ? 0 : anchor.y,
        anchor.kind === 'bh' ? 0 : anchor.z,
      );
      this._v.project(this.camera);
      if (!isFinite(this._v.z) || this._v.z > 1) {
        px = w * 0.5;
        py = h * 0.4;
      } else {
        px = (this._v.x * 0.5 + 0.5) * w;
        py = (0.5 - this._v.y * 0.5) * h;
        py -= WORD_OFFSET_Y;
      }
    }
    // Grab it into a safe band that clears chips (top) and bottom controls.
    px = clamp(px, Math.round(w * 0.1), Math.round(w * 0.9));
    py = clamp(py, SAFE_TOP, Math.max(SAFE_TOP, h - SAFE_BOTTOM));
    return { px, py };
  }

  start() {
    if (this._running || this.hidden) return;
    this._running = true;
    this._last = performance.now();
    const step = (now) => {
      if (!this._running) return;
      const dt = Math.min(64, now - this._last);
      this._last = now;
      this.core.tick(dt);
      this.draw();
      if (this.core.activeCount() > 0) {
        this._raf = requestAnimationFrame(step);
      } else {
        this._running = false;
      }
    };
    this._raf = requestAnimationFrame(step);
  }

  draw() {
    const rm = this.core.reducedMotion;
    const slots = this.core.view();
    // Recycle: any element whose slot has expired leaves the overlay so its
    // pool index is free again (Map iteration — WeakMap has no forEach/keys).
    const live = new Set(slots);
    for (const [slot, el] of [...this._els]) {
      if (!live.has(slot)) {
        this._els.delete(slot);
        if (el.parentNode) this.overlay.removeChild(el);
      }
    }
    for (let i = 0; i < slots.length; i++) {
      const slot = slots[i];
      let el = this._els.get(slot);
      if (!el) {
        el = this.pool.find((p) => !p.parentNode) || mkEl();
        this._els.set(slot, el);
        el.innerHTML = buildBurstMarkup(slot.word, 0, slot.word.length);
        el.className = 'comic-word';
        this.overlay.appendChild(el);
      }
      const p = clamp01v(slot.age / slot.duration);
      const k = keyframe(p, { reducedMotion: rm });
      const pos = this.project(slot.anchor);
      const ddx = slot.drift.x * k.drift;
      const ddy = slot.drift.y * k.drift;
      const x = pos.px + ddx;
      const y = Math.max(0, pos.py + ddy);
      const o = Math.max(0, Math.min(1, k.opacity));
      el.style.transform =
        `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px) ` +
        `translate(-50%, -50%) rotate(${slot.rot}deg) scale(${k.scale.toFixed(3)})`;
      el.style.opacity = o.toFixed(3);
    }
  }

  _shake(intensity) {
    if (this.core.reducedMotion || intensity <= 0) return;
    const cls = intensity >= 0.8 ? 'comic-shake-l' : intensity >= 0.5 ? 'comic-shake-m' : 'comic-shake-s';
    document.body.classList.remove('comic-shake-s', 'comic-shake-m', 'comic-shake-l');
    document.body.classList.add(cls);
    clearTimeout(this._shakeT);
    this._shakeT = setTimeout(() => {
      document.body.classList.remove('comic-shake-s', 'comic-shake-m', 'comic-shake-l');
    }, 220);
  }

  show(name, opts) {
    const sOpts = opts || {};
    const before = this.core.activeCount();
    const ok = this.core.show(name, sOpts);
    if (ok) {
      this._shake(shakeOf(name));
      if (before === 0) this.start();
    }
    return ok;
  }

  clear() {
    this.core.clear();
    this._els = new Map();
    for (const el of this.pool) if (el.parentNode) this.overlay.removeChild(el);
  }

  dispose() {
    this._running = false;
    clearTimeout(this._shakeT);
    if (this._raf) cancelAnimationFrame(this._raf);
    if (this.overlay.parentNode) this.overlay.parentNode.removeChild(this.overlay);
  }
}