// game/input.js — camera orbit, pinch zoom, zoom slider, keyboard, and the
// slingshot drag. Talks to the Game through callbacks so the Game stays
// focused on simulation state.

const MIN_DIST = 96;
const MAX_DIST = 1200;

// Phase 17 — zoom-slider semantics: LEFT = farthest (ZOOM OUT), RIGHT = closest
// (ZOOM IN). Only the UI mapping is inverted; the camera range (MIN_DIST..
// MAX_DIST) and every pinch/orbit behavior are unchanged. These pure helpers
// are exported so the node test suite can assert the monotonic endpoints.
export function distFromSlider(v) {
  const p = Math.max(0, Math.min(100, v)) / 100;
  return MAX_DIST - p * (MAX_DIST - MIN_DIST);
}

export function sliderFromDist(d) {
  return Math.round(((MAX_DIST - d) / (MAX_DIST - MIN_DIST)) * 100);
}

export { MIN_DIST, MAX_DIST };

export class CameraInput {
  constructor(el, camera, callbacks) {
    this.el = el;
    this.camera = camera;
    this.cb = callbacks; // { isAiming, onAimMove(dx,dy), onAimEnd, onCancelAim, onSpace, onEnter, onSlowmo, onRespawn, syncZoomSlider(dist) }

    this.theta = Math.atan2(camera.position.z, camera.position.x);
    this.phi = Math.acos(camera.position.y / camera.position.length());
    this.dist = camera.position.length();

    this.dragging = false;
    this.cameraDragActive = false; // orbit ONLY while an explicit canvas gesture is held
    this.lastX = 0;
    this.lastY = 0;
    this.pointers = new Map();
    this.pinchDist = 0;
    this.aimActive = false;
    // Phase 20 — keyboard gate while the opening screen / dive runs. Pointer
    // input needs no lock (the full-screen opening overlay intercepts it); this
    // just stops Space/Enter/S/R/Escape from firing gameplay before PLAY.
    this._locked = false;

    this._bindPointers();
    this._bindCancelCleanup();
    this._bindSlider();
    this._bindKeyboard();
  }

  setLocked(v) {
    this._locked = !!v;
    return this._locked;
  }

  get locked() {
    return this._locked;
  }

  _applyCam() {
    const c = this.camera;
    c.position.set(
      this.dist * Math.sin(this.phi) * Math.cos(this.theta),
      this.dist * Math.cos(this.phi),
      this.dist * Math.sin(this.phi) * Math.sin(this.theta),
    );
    c.lookAt(0, 0, 0);
  }

  _getPos(e) {
    const rect = this.el.getBoundingClientRect();
    return {
      x: (e.clientX || e.changedTouches[0].clientX) - rect.left,
      y: (e.clientY || e.changedTouches[0].clientY) - rect.top,
    };
  }

  _pdist() {
    const pts = [...this.pointers.values()];
    return Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
  }

  _bindPointers() {
    const el = this.el;

    const capture = (pid) => {
      try { el.setPointerCapture(pid); } catch (err) { /* pointer already gone */ }
    };

    el.addEventListener('pointerdown', (e) => {
      if (e.pointerType === 'mouse' && e.button !== 0) return;
      // Only start an interaction from the canvas itself — UI controls (zoom
      // slider, object picker, buttons) live on top of it and must never leak
      // a drag into the camera. Capture the pointer so the matching pointerup
      // is delivered to the canvas even when released over a HUD element.
      if (e.target !== el && !el.contains(e.target)) return;
      capture(e.pointerId);
      this.pointers.set(e.pointerId, this._getPos(e));
      if (this.pointers.size === 2) {
        // pinch — cancel drag + aim, orbit is handled by pinch zoom
        this.pinchDist = this._pdist();
        this.dragging = false;
        this.cameraDragActive = false;
        this.aimActive = false;
        return;
      }
      this.dragging = true;
      this.lastX = e.clientX; this.lastY = e.clientY;
      // In aim mode, a pointer down anywhere = start slingshot
      if (this.cb.isAiming()) {
        this.aimActive = true;
      } else {
        this.cameraDragActive = true;
      }
    });

    el.addEventListener('pointermove', (e) => {
      // pinch zoom (regardless of drag state)
      if (this.pointers.has(e.pointerId)) {
        this.pointers.set(e.pointerId, this._getPos(e));
        if (this.pointers.size === 2) {
          const d = this._pdist();
          const f = d / (this.pinchDist || 1);
          this.dist = Math.max(MIN_DIST, Math.min(MAX_DIST, this.dist / f));
          this.pinchDist = d;
          this._applyCam();
          if (this.cb.syncZoomSlider) this.cb.syncZoomSlider(this.dist);
        }
      }
      if (!this.dragging || this.pointers.size >= 2) return;
      const dx = e.clientX - this.lastX, dy = e.clientY - this.lastY;
      this.lastX = e.clientX; this.lastY = e.clientY;
      if (this.aimActive) {
        this.cb.onAimMove(dx, dy);
        return;
      }
      // camera orbit — blocked unless an explicit drag is active
      if (!this.cameraDragActive) return;
      this.theta -= dx * 0.005;
      this.phi -= dy * 0.005;
      this.phi = Math.max(0.15, Math.min(Math.PI - 0.15, this.phi));
      this._applyCam();
    });

    const endDrag = (e, force) => {
      if (this.pointers.has(e.pointerId)) this.pointers.delete(e.pointerId);
      if (!this.dragging && !force) return;
      this.dragging = false;
      this.cameraDragActive = false;
      if (this.aimActive && this.cb.isAiming()) {
        this.aimActive = false;
        this.cb.onAimEnd();
      }
    };
    el.addEventListener('pointerup', (e) => {
      try { el.releasePointerCapture(e.pointerId); } catch (err) { /* no capture */ }
      endDrag(e);
    });
    el.addEventListener('pointercancel', endDrag);
  }

  // Defensive cleanup: if the browser swallows a pointerup (scrolled out of a
  // gesture, tab switch, window blur), the camera must not stay permanently
  // "dragging." Same for visibility change so a backgrounded tab never orbits.
  _bindCancelCleanup() {
    const cancelAll = () => {
      this.dragging = false;
      this.cameraDragActive = false;
      this.aimActive = false;
      this.pointers.clear();
      this.pinchDist = 0;
    };
    window.addEventListener('blur', cancelAll);
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) cancelAll();
    });
  }

  _bindSlider() {
    const zoomSlider = document.getElementById('zoom-slider');
    const zoomVal = document.getElementById('zoom-val');
    this._distFromSlider = distFromSlider;
    this._sliderFromDist = sliderFromDist;
    this._zoomSlider = zoomSlider;
    this._zoomVal = zoomVal;
    if (zoomSlider) {
      zoomSlider.value = String(sliderFromDist(this.dist));
      if (zoomVal) zoomVal.textContent = zoomSlider.value;
      zoomSlider.addEventListener('input', () => {
        this.dist = distFromSlider(parseFloat(zoomSlider.value));
        // keep the numeric readout honest on manual slider drags (the pinch
        // path already does this through syncZoomSlider)
        if (zoomVal) zoomVal.textContent = zoomSlider.value;
        this._applyCam();
      });
    }
  }

  // keep the slider + label in sync when pinch-zooming
  syncZoomSlider(d) {
    if (this._zoomVal) this._zoomVal.textContent = String(this._sliderFromDist(d));
    if (this._zoomSlider) this._zoomSlider.value = String(this._sliderFromDist(d));
  }

  _bindKeyboard() {
    window.addEventListener('keydown', (e) => {
      if (this._locked) return;
      if (e.code === 'Space') { e.preventDefault(); this.cb.onSpace(); }
      if (e.code === 'Enter' && this.cb.isAiming()) this.cb.onEnter();
      if (e.code === 'Escape' && this.cb.isAiming()) this.cb.onCancelAim();
      if (e.code === 'KeyS') this.cb.onSlowmo();
      if (e.code === 'KeyR') this.cb.onRespawn();
    });
  }

  // Phase 20 — re-derive theta/phi/dist from the CURRENT camera position and
  // re-apply the canonical framing (lookAt origin). Called when the opening
  // dive settles the camera, so the cached orbit state matches reality and the
  // next drag continues from the settled framing instead of snapping back.
  syncFromCamera() {
    const p = this.camera.position;
    this.dist = p.length() || 1;
    this.theta = Math.atan2(p.z, p.x);
    this.phi = Math.acos(Math.max(-1, Math.min(1, p.y / this.dist)));
    this._applyCam();
    // Phase 23 — the camera IS the source of truth: after any settle, the zoom
    // slider + numeric label must agree with the camera so there is never a
    // camera=30 / UI=0 or camera=30 / UI=19 mismatch.
    this.syncZoomSlider(this.dist);
  }
}